import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { areFriends, createSocialNotification, positiveId } from '../services/socialService.js';
import { maxMembersFor, normalizeLeagueInput, validateTeams } from '../services/friendLeagueRules.js';
import { getLeague, getLeagueDetail, getMembers, listLeaguesForUser } from '../services/friendLeagueService.js';

const router = Router();
router.use(requireAuth);

const MAX_OPEN_LEAGUES_OWNED = 10;
const fail = (res, code, msg) => res.status(code).json({ ok: false, msg });

const notifyInvite = (db, { userId, actorId, actorName, league }) => createSocialNotification(db, {
  userId,
  actorId,
  type: 'friend_league',
  entityType: 'friend_league',
  entityId: league.id,
  title: 'Te invitan a una liga',
  body: `${actorName} te invita a competir en ${league.name}`,
  data: { type: 'friend_league', screen: 'FriendLeagueDetail', leagueId: league.id },
  dedupeKey: `friend-league-invite:${league.id}:${userId}`,
});

/** Invita a los que sean amigos del creador y aún no estén dentro, hasta llenar la liga. */
async function inviteFriends(db, { league, ownerId, userIds, maxMembers }) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(positiveId).filter(Boolean))].filter((id) => id !== ownerId);
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM friend_league_members WHERE league_id=?', [league.id]);
  const [[owner]] = await db.query('SELECT name FROM users WHERE id=?', [ownerId]);
  let invited = 0;
  let full = false;
  for (const userId of ids) {
    if (Number(total) + invited >= maxMembers) { full = true; break; }
    if (!await areFriends(db, ownerId, userId)) continue;
    const [result] = await db.query(`INSERT IGNORE INTO friend_league_members (league_id, user_id, status) VALUES (?, ?, 'invited')`, [league.id, userId]);
    if (!result.affectedRows) continue;
    invited += 1;
    await notifyInvite(db, { userId, actorId: ownerId, actorName: owner.name, league });
  }
  return { invited, full };
}

/** La liga si el usuario es su creador y sigue sin empezar. Si no, responde el error. */
async function loadOwnedDraft(req, res) {
  const leagueId = positiveId(req.params.id);
  const league = leagueId ? await getLeague(pool, leagueId) : null;
  if (!league) { fail(res, 404, 'Liga no encontrada'); return null; }
  if (league.owner_id !== Number(req.user.id)) { fail(res, 403, 'Solo el creador puede hacer esto'); return null; }
  if (league.status !== 'draft') { fail(res, 409, 'La liga ya ha empezado y sus reglas no se pueden cambiar'); return null; }
  return league;
}

router.get('/', async (req, res) => {
  try {
    const items = await listLeaguesForUser(pool, req.user.id);
    res.json({ ok: true, items, pending_invites: items.filter((item) => item.my_status === 'invited').length });
  } catch (error) {
    console.error('[FRIEND LEAGUES list]', error);
    fail(res, 500, 'No se pudieron cargar tus ligas');
  }
});

router.post('/', async (req, res) => {
  const { value, error: invalid } = normalizeLeagueInput(req.body);
  if (invalid) return fail(res, 400, invalid);
  const conn = await pool.getConnection();
  try {
    const [[{ open_count: openCount }]] = await conn.query(`SELECT COUNT(*) AS open_count FROM friend_leagues WHERE owner_id=? AND status IN ('draft','active')`, [req.user.id]);
    if (Number(openCount) >= MAX_OPEN_LEAGUES_OWNED) return fail(res, 409, `Ya tienes ${MAX_OPEN_LEAGUES_OWNED} ligas abiertas`);
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO friend_leagues (name, owner_id, team_size, matches_goal, duration_days, rules) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))',
      [value.name, req.user.id, value.team_size, value.matches_goal, value.duration_days, JSON.stringify(value.rules)]
    );
    await conn.query(`INSERT INTO friend_league_members (league_id, user_id, status) VALUES (?, ?, 'accepted')`, [result.insertId, req.user.id]);
    const { invited, full } = await inviteFriends(conn, {
      league: { id: result.insertId, name: value.name },
      ownerId: Number(req.user.id),
      userIds: req.body?.friend_ids,
      maxMembers: maxMembersFor(req.user.role),
    });
    await conn.commit();
    res.status(201).json({ ok: true, id: result.insertId, invited, full });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error('[FRIEND LEAGUES create]', error);
    fail(res, 500, 'No se pudo crear la liga');
  } finally {
    conn.release();
  }
});

router.get('/:id', async (req, res) => {
  try {
    const leagueId = positiveId(req.params.id);
    const detail = leagueId ? await getLeagueDetail(pool, leagueId, req.user.id) : null;
    if (!detail) return fail(res, 404, 'Liga no encontrada');
    res.json({ ok: true, ...detail, max_members: detail.me.is_owner ? maxMembersFor(req.user.role) : undefined });
  } catch (error) {
    console.error('[FRIEND LEAGUES detail]', error);
    fail(res, 500, 'No se pudo cargar la liga');
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const league = await loadOwnedDraft(req, res);
    if (!league) return;
    const { value, error: invalid } = normalizeLeagueInput(req.body);
    if (invalid) return fail(res, 400, invalid);
    await pool.query(
      `UPDATE friend_leagues SET name=?, team_size=?, matches_goal=?, duration_days=?, rules=CAST(? AS JSON) WHERE id=? AND status='draft'`,
      [value.name, value.team_size, value.matches_goal, value.duration_days, JSON.stringify(value.rules), league.id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('[FRIEND LEAGUES edit]', error);
    fail(res, 500, 'No se pudo guardar la liga');
  }
});

router.post('/:id/invite', async (req, res) => {
  try {
    const league = await loadOwnedDraft(req, res);
    if (!league) return;
    const maxMembers = maxMembersFor(req.user.role);
    const { invited, full } = await inviteFriends(pool, { league, ownerId: Number(req.user.id), userIds: req.body?.user_ids, maxMembers });
    if (full && !invited) return fail(res, 409, `La liga ya tiene el máximo de ${maxMembers} jugadores`);
    res.status(201).json({ ok: true, invited, full });
  } catch (error) {
    console.error('[FRIEND LEAGUES invite]', error);
    fail(res, 500, 'No se pudo enviar la invitación');
  }
});

router.post('/:id/respond', async (req, res) => {
  try {
    const leagueId = positiveId(req.params.id);
    const league = leagueId ? await getLeague(pool, leagueId) : null;
    if (!league) return fail(res, 404, 'Liga no encontrada');
    if (league.status !== 'draft') return fail(res, 409, 'Esta liga ya ha empezado');
    const [result] = req.body?.accept === true
      ? await pool.query(`UPDATE friend_league_members SET status='accepted' WHERE league_id=? AND user_id=? AND status='invited'`, [leagueId, req.user.id])
      : await pool.query(`DELETE FROM friend_league_members WHERE league_id=? AND user_id=? AND status='invited'`, [leagueId, req.user.id]);
    if (!result.affectedRows) return fail(res, 404, 'No tienes ninguna invitación a esta liga');
    res.json({ ok: true });
  } catch (error) {
    console.error('[FRIEND LEAGUES respond]', error);
    fail(res, 500, 'No se pudo responder a la invitación');
  }
});

// Las reglas y el reparto quedan fijos aquí. Quien no haya aceptado se queda fuera.
router.post('/:id/start', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const league = await loadOwnedDraft(req, res);
    if (!league) return;
    const members = await getMembers(conn, league.id);
    const accepted = members.filter((member) => member.status === 'accepted').map((member) => member.user_id);
    const { teamByUser, error: invalid } = validateTeams({ teamSize: league.team_size, acceptedIds: accepted, teams: req.body?.teams });
    if (invalid) return fail(res, 400, invalid);

    await conn.beginTransaction();
    const [result] = await conn.query(
      `UPDATE friend_leagues SET status='active', started_at=NOW(), ends_at=NOW() + INTERVAL duration_days DAY WHERE id=? AND status='draft'`,
      [league.id]
    );
    if (!result.affectedRows) { await conn.rollback(); return fail(res, 409, 'La liga ya ha empezado'); }
    await conn.query(`DELETE FROM friend_league_members WHERE league_id=? AND status='invited'`, [league.id]);
    for (const userId of accepted) {
      await conn.query('UPDATE friend_league_members SET team_no=? WHERE league_id=? AND user_id=?', [teamByUser.get(userId) ?? null, league.id, userId]);
    }
    for (const userId of accepted.filter((id) => id !== Number(req.user.id))) {
      await createSocialNotification(conn, {
        userId,
        actorId: req.user.id,
        type: 'friend_league',
        entityType: 'friend_league',
        entityId: league.id,
        title: `¡Empieza ${league.name}!`,
        body: `Desde ahora cuentan tus próximos ${league.matches_goal} partidos. Tienes ${league.duration_days} días.`,
        data: { type: 'friend_league', screen: 'FriendLeagueDetail', leagueId: league.id },
        dedupeKey: `friend-league-started:${league.id}:${userId}`,
      });
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error('[FRIEND LEAGUES start]', error);
    fail(res, 500, 'No se pudo empezar la liga');
  } finally {
    conn.release();
  }
});

// En una liga por equipos no se puede salir: dejaría a sus compañeros incompletos.
router.post('/:id/leave', async (req, res) => {
  try {
    const leagueId = positiveId(req.params.id);
    const league = leagueId ? await getLeague(pool, leagueId) : null;
    if (!league) return fail(res, 404, 'Liga no encontrada');
    if (league.owner_id === Number(req.user.id)) return fail(res, 409, 'El creador no puede salir: puede eliminar la liga');
    if (league.status === 'finished') return fail(res, 409, 'Esta liga ya ha terminado');
    if (league.status === 'active' && league.team_size > 1) return fail(res, 409, 'No puedes dejar a tu equipo a mitad de liga');
    const [result] = await pool.query('DELETE FROM friend_league_members WHERE league_id=? AND user_id=?', [leagueId, req.user.id]);
    if (!result.affectedRows) return fail(res, 404, 'No estás en esta liga');
    res.json({ ok: true });
  } catch (error) {
    console.error('[FRIEND LEAGUES leave]', error);
    fail(res, 500, 'No se pudo salir de la liga');
  }
});

router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const league = await loadOwnedDraft(req, res);
    if (!league) return;
    const memberId = positiveId(req.params.userId);
    if (!memberId || memberId === Number(req.user.id)) return fail(res, 400, 'Jugador no válido');
    const [result] = await pool.query('DELETE FROM friend_league_members WHERE league_id=? AND user_id=?', [league.id, memberId]);
    if (!result.affectedRows) return fail(res, 404, 'Jugador no encontrado');
    res.json({ ok: true });
  } catch (error) {
    console.error('[FRIEND LEAGUES remove member]', error);
    fail(res, 500, 'No se pudo quitar al jugador');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const leagueId = positiveId(req.params.id);
    if (!leagueId) return fail(res, 404, 'Liga no encontrada');
    const [result] = await pool.query('DELETE FROM friend_leagues WHERE id=? AND owner_id=?', [leagueId, req.user.id]);
    if (!result.affectedRows) return fail(res, 403, 'Solo el creador puede eliminar la liga');
    res.json({ ok: true });
  } catch (error) {
    console.error('[FRIEND LEAGUES delete]', error);
    fail(res, 500, 'No se pudo eliminar la liga');
  }
});

export default router;
