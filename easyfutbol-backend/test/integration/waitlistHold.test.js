import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
const database = String(process.env.DB_NAME || '');

if (enabled && !/(^test_|_test$)/i.test(database)) {
  throw new Error('DB_NAME debe ser una base aislada cuyo nombre empiece por test_ o termine en _test');
}

describe('lista de espera con EasyPass retenido', { skip: !enabled }, () => {
  let pool;
  let svc;
  let matchId;
  let nextUser = 100;

  const inTwoDays = () => new Date(Date.now() + 2 * 86400000);

  async function createUser({ located = 2, universal = 0 } = {}) {
    nextUser += 1;
    await pool.query('INSERT INTO users (id, easypass_balance) VALUES (?, ?)', [nextUser, located + universal]);
    if (located) {
      await pool.query('INSERT INTO user_easypass_balances (user_id, location_id, balance) VALUES (?, 1, ?)', [nextUser, located]);
    }
    return nextUser;
  }

  async function balances(userId) {
    const [[user]] = await pool.query('SELECT easypass_balance AS total FROM users WHERE id = ?', [userId]);
    const [[located]] = await pool.query(
      'SELECT COALESCE(SUM(balance), 0) AS total FROM user_easypass_balances WHERE user_id = ? AND location_id = 1',
      [userId]
    );
    return { total: Number(user.total), located: Number(located.total) };
  }

  const entryOf = async (userId, id = matchId) => {
    const [[row]] = await pool.query('SELECT * FROM match_waitlist WHERE match_id = ? AND user_id = ?', [id, userId]);
    return row;
  };

  const ticketsOf = async (userId, id = matchId) => {
    const [rows] = await pool.query(
      "SELECT * FROM inscriptions WHERE match_id = ? AND user_id = ? AND status = 'confirmed'",
      [id, userId]
    );
    return rows;
  };

  async function freeSpot(ticketType) {
    const [[row]] = await pool.query(
      "SELECT id FROM inscriptions WHERE match_id = ? AND user_id = 1 AND ticket_type = ? AND status = 'confirmed' LIMIT 1",
      [matchId, ticketType]
    );
    await pool.query("UPDATE inscriptions SET status = 'cancelled' WHERE id = ?", [row.id]);
    await pool.query('UPDATE matches SET spots_taken = spots_taken - 1 WHERE id = ?', [matchId]);
  }

  before(async () => {
    ({ pool } = await import('../../src/config/db.js'));
    svc = await import('../../src/services/waitlistService.js');
  });

  after(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    for (const table of ['match_extra_invitations', 'match_waitlist', 'easypass_transactions', 'inscriptions', 'user_easypass_balances', 'matches', 'push_tokens', 'users']) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await pool.query('INSERT INTO users (id, easypass_balance) VALUES (1, 0)');
    const [result] = await pool.query(
      `INSERT INTO matches (title, city, location_id, starts_at, duration_min, easypass_cost, capacity, spots_taken, status)
       VALUES ('Jueves', 'Valladolid', 1, ?, 60, 1, 4, 4, 'scheduled')`,
      [inTwoDays()]
    );
    matchId = result.insertId;
    for (const type of ['white', 'white', 'black', 'black']) {
      await pool.query(
        "INSERT INTO inscriptions (user_id, match_id, status, ticket_type) VALUES (1, ?, 'confirmed', ?)",
        [matchId, type]
      );
    }
  });

  test('al entrar retiene el EasyPass y al salir lo devuelve al mismo saldo', async () => {
    const user = await createUser({ located: 1, universal: 1 });
    await svc.joinWaitlist({ matchId, userId: user, isPlus: false, preferredTicketType: 'white' });
    assert.deepEqual(await balances(user), { total: 1, located: 0 });
    assert.equal(Number((await entryOf(user)).held_easypass), 1);

    const { refunded } = await svc.leaveWaitlist({ matchId, userId: user });
    assert.equal(refunded, 1);
    assert.deepEqual(await balances(user), { total: 2, located: 1 });
    assert.equal((await entryOf(user)).status, 'cancelled');

    await svc.leaveWaitlist({ matchId, userId: user });
    assert.deepEqual(await balances(user), { total: 2, located: 1 }, 'salir dos veces no devuelve dos veces');
  });

  test('sin saldo no entra y no se puede retener dos veces', async () => {
    const poor = await createUser({ located: 0 });
    await assert.rejects(
      svc.joinWaitlist({ matchId, userId: poor, isPlus: false, preferredTicketType: null }),
      (error) => error.code === 'NO_EASYPASS'
    );
    assert.equal(await entryOf(poor), undefined);

    const user = await createUser();
    await svc.joinWaitlist({ matchId, userId: user, isPlus: false, preferredTicketType: null });
    await assert.rejects(
      svc.joinWaitlist({ matchId, userId: user, isPlus: false, preferredTicketType: null }),
      (error) => error.code === 'ALREADY_IN_WAITLIST'
    );
    assert.equal((await balances(user)).total, 1);
  });

  test('al liberarse plaza entra el Plus primero, sin volver a cobrar, y con la camiseta que quede', async () => {
    const regular = await createUser();
    const plus = await createUser();
    await svc.joinWaitlist({ matchId, userId: regular, isPlus: false, preferredTicketType: 'black' });
    await svc.joinWaitlist({ matchId, userId: plus, isPlus: true, preferredTicketType: 'black' });

    await freeSpot('white');
    assert.deepEqual(await svc.processWaitlistForMatch(matchId), { entered: 1, offered: 0 });

    const [ticket] = await ticketsOf(plus);
    assert.equal(ticket.ticket_type, 'white', 'solo había hueco en blancos');
    assert.equal((await balances(plus)).total, 1, 'no se cobra una segunda vez');
    assert.equal((await entryOf(plus)).status, 'claimed');
    assert.equal(Number((await entryOf(plus)).held_easypass), 0);
    assert.equal((await entryOf(regular)).status, 'waiting');
    const [[match]] = await pool.query('SELECT spots_taken FROM matches WHERE id = ?', [matchId]);
    assert.equal(Number(match.spots_taken), 4);
  });

  test('quien sale y vuelve pasa al final de la cola', async () => {
    const first = await createUser();
    const second = await createUser();
    await svc.joinWaitlist({ matchId, userId: first, isPlus: false, preferredTicketType: null });
    await pool.query('UPDATE match_waitlist SET created_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE user_id = ?', [first]);
    await svc.joinWaitlist({ matchId, userId: second, isPlus: false, preferredTicketType: null });
    await svc.leaveWaitlist({ matchId, userId: first });
    await pool.query('UPDATE match_waitlist SET created_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [second]);
    await svc.joinWaitlist({ matchId, userId: first, isPlus: false, preferredTicketType: null });

    await freeSpot('black');
    await svc.processWaitlistForMatch(matchId);
    assert.equal((await ticketsOf(second)).length, 1);
    assert.equal((await ticketsOf(first)).length, 0);
  });

  test('las filas antiguas sin retención siguen recibiendo la oferta de 30 minutos', async () => {
    const legacy = await createUser();
    await pool.query(
      "INSERT INTO match_waitlist (match_id, user_id, status, notifications_consent_at) VALUES (?, ?, 'waiting', NOW())",
      [matchId, legacy]
    );
    await freeSpot('white');
    assert.deepEqual(await svc.processWaitlistForMatch(matchId), { entered: 0, offered: 1 });
    assert.equal((await entryOf(legacy)).status, 'offered');
    assert.equal((await balances(legacy)).total, 2);
  });

  test('a 2 horas del partido se devuelve lo retenido y nadie entra', async () => {
    const user = await createUser();
    await svc.joinWaitlist({ matchId, userId: user, isPlus: false, preferredTicketType: null });
    await freeSpot('white');
    await pool.query('UPDATE matches SET starts_at = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?', [matchId]);

    await svc.runWaitlistSweep();
    assert.equal((await ticketsOf(user)).length, 0);
    assert.deepEqual(await balances(user), { total: 2, located: 2 });
    assert.equal((await entryOf(user)).status, 'expired');
    await svc.runWaitlistSweep();
    assert.equal((await balances(user)).total, 2, 'el barrido no devuelve dos veces');
  });

  test('si se cancela el partido se devuelve lo retenido', async () => {
    const user = await createUser();
    await svc.joinWaitlist({ matchId, userId: user, isPlus: false, preferredTicketType: null });
    await pool.query("UPDATE matches SET status = 'cancelled' WHERE id = ?", [matchId]);
    await svc.runWaitlistSweep();
    assert.equal((await balances(user)).total, 2);
  });

  test('partido extra: oculto, Plus antes que el resto y aceptar mueve la retención', async () => {
    const plus = await createUser();
    const regular = await createUser();
    await svc.joinWaitlist({ matchId, userId: plus, isPlus: true, preferredTicketType: 'black' });
    await svc.joinWaitlist({ matchId, userId: regular, isPlus: false, preferredTicketType: null });

    const extra = await svc.createExtraMatchFromWaitlist({ sourceMatchId: matchId, startsAt: new Date(Date.now() + 3 * 86400000) });
    assert.deepEqual([extra.invited, extra.invitedPlus], [2, 1]);

    const [[extraRow]] = await pool.query('SELECT * FROM matches WHERE id = ?', [extra.id]);
    assert.equal(extraRow.is_private, 1);
    assert.equal(await svc.canViewPrivateMatch(pool, extra.id, null), false);
    assert.equal(await svc.canViewPrivateMatch(pool, extra.id, { id: regular, role: 'user' }), false, 'el no Plus aún no lo ve');
    assert.equal(await svc.canViewPrivateMatch(pool, extra.id, { id: plus, role: 'user' }), true);
    assert.equal((await svc.getWaitlistBookingBlock(pool, extraRow, plus)).code, 'PRIVATE_MATCH');

    assert.equal(await svc.getActiveExtraInvitation(pool, { sourceMatchId: matchId, userId: regular }), null);
    const invitation = await svc.getActiveExtraInvitation(pool, { sourceMatchId: matchId, userId: plus });
    const accepted = await svc.acceptExtraInvitation({ invitationId: invitation.id, userId: plus, preferredTicketType: null });
    assert.equal(accepted.ticketType, 'black');
    assert.equal((await ticketsOf(plus, extra.id)).length, 1);
    assert.equal((await balances(plus)).total, 1, 'solo paga una vez');
    assert.equal((await entryOf(plus)).status, 'claimed');
    assert.equal(Number((await entryOf(plus)).held_easypass), 0);

    await assert.rejects(
      svc.acceptExtraInvitation({ invitationId: invitation.id, userId: plus, preferredTicketType: null }),
      (error) => error.code === 'INVITATION_NOT_FOUND'
    );

    // Pasada la ventaja Plus, el resto ya lo ve; rechazar le mantiene en la lista.
    await pool.query('UPDATE match_extra_invitations SET available_from = NOW() WHERE user_id = ?', [regular]);
    const late = await svc.getActiveExtraInvitation(pool, { sourceMatchId: matchId, userId: regular });
    assert.equal(await svc.declineExtraInvitation({ invitationId: late.id, userId: regular }), true);
    assert.equal((await entryOf(regular)).status, 'waiting');
    assert.equal(Number((await entryOf(regular)).held_easypass), 1);
  });

  test('partido extra lleno: la invitación falla y sigue retenido en la lista', async () => {
    const user = await createUser();
    await svc.joinWaitlist({ matchId, userId: user, isPlus: true, preferredTicketType: null });
    const extra = await svc.createExtraMatchFromWaitlist({ sourceMatchId: matchId, startsAt: new Date(Date.now() + 3 * 86400000) });
    await pool.query('UPDATE matches SET spots_taken = capacity WHERE id = ?', [extra.id]);
    const invitation = await svc.getActiveExtraInvitation(pool, { sourceMatchId: matchId, userId: user });
    await assert.rejects(
      svc.acceptExtraInvitation({ invitationId: invitation.id, userId: user, preferredTicketType: null }),
      (error) => error.code === 'EXTRA_FULL'
    );
    assert.equal((await balances(user)).total, 1);
    assert.equal((await entryOf(user)).status, 'waiting');
  });

  test('con EasyPass retenido no se puede reservar por la vía normal', async () => {
    const user = await createUser();
    await svc.joinWaitlist({ matchId, userId: user, isPlus: false, preferredTicketType: null });
    const [[match]] = await pool.query('SELECT * FROM matches WHERE id = ?', [matchId]);
    assert.equal((await svc.getWaitlistBookingBlock(pool, match, user)).code, 'WAITLIST_HOLD_ACTIVE');
  });

  test('si ya juega con una entrada ajena, recupera lo retenido y no ocupa otra plaza', async () => {
    const user = await createUser();
    await svc.joinWaitlist({ matchId, userId: user, isPlus: false, preferredTicketType: null });
    await pool.query("UPDATE inscriptions SET assigned_user_id = ? WHERE match_id = ? AND ticket_type = 'black' LIMIT 1", [user, matchId]);
    await freeSpot('white');
    assert.deepEqual(await svc.processWaitlistForMatch(matchId), { entered: 0, offered: 0 });
    assert.equal((await balances(user)).total, 2);
    assert.equal((await entryOf(user)).status, 'cancelled');
  });
});
