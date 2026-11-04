// Ligas privadas entre amigos: lectura de datos, clasificación y avisos. El
// cálculo de puntos está en friendLeagueRules.js.
import { pool } from '../config/db.js';
import { createSocialNotification } from './socialService.js';
import { activePlusSql } from './subscriptionService.js';
import { computeLineupCard } from './playerCardService.js';
import { PUBLIC_LINK_BASE, getSeasonStats } from './profileShareService.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';
import { isSendingHour } from './retentionRules.js';
import { LEAGUE_LIMITS, computeStandings, findOvertaken, isLeagueComplete } from './friendLeagueRules.js';

// Las actas se cierran después del partido: se espera antes de dar la liga por acabada.
const CLOSING_GRACE_DAYS = 2;
const REMINDER_DAYS = 5;
const PUBLIC_LIST_LIMIT = 20;
const PUBLIC_FINISHED_VISIBLE_DAYS = 30;
const LEAGUE_COLUMNS = `l.id, l.name, l.owner_id, l.team_size, l.matches_goal, l.duration_days, l.rules, l.status, l.is_public, l.join_code,
  l.started_at, l.ends_at, l.finished_at, l.created_at,
  GREATEST(TIMESTAMPDIFF(DAY, NOW(), l.ends_at), 0) AS days_left,
  (l.ends_at + INTERVAL ${CLOSING_GRACE_DAYS} DAY <= NOW()) AS closing_passed`;

function parseLeague(row) {
  if (!row) return null;
  return {
    ...row,
    rules: typeof row.rules === 'string' ? JSON.parse(row.rules) : row.rules,
    is_public: Boolean(Number(row.is_public)),
    days_left: row.days_left === null ? null : Number(row.days_left),
    closing_passed: Boolean(Number(row.closing_passed)),
  };
}

export async function getLeague(db, leagueId) {
  const [[row]] = await db.query(`SELECT ${LEAGUE_COLUMNS} FROM friend_leagues l WHERE l.id=?`, [leagueId]);
  return parseLeague(row);
}

export async function getMembers(db, leagueId) {
  const [rows] = await db.query(
    `SELECT m.user_id, m.status, m.team_no, m.last_rank, u.name, u.nickname, u.avatar_url, u.primary_position,
            ${activePlusSql('u.id')} AS is_plus
     FROM friend_league_members m JOIN users u ON u.id=m.user_id
     WHERE m.league_id=?
     ORDER BY FIELD(m.status,'accepted','invited'), u.name`,
    [leagueId]
  );
  return rows;
}

/** Resultados cerrados de los miembros dentro de las fechas de la liga. */
async function getStatRows(db, league, memberIds) {
  if (!memberIds.length || !league.started_at) return [];
  const [rows] = await db.query(
    `SELECT mps.match_id, mps.user_id, mps.result, mps.goals, mps.assists, mps.saves, mps.is_mvp, m.starts_at
     FROM match_player_stats mps JOIN matches m ON m.id=mps.match_id
     WHERE mps.user_id IN (?) AND mps.result IS NOT NULL AND m.status <> 'cancelled'
       AND m.starts_at >= ? AND m.starts_at <= ?`,
    [memberIds, league.started_at, league.ends_at]
  );
  return rows;
}

export async function getStandings(db, league, members) {
  const accepted = members.filter((member) => member.status === 'accepted');
  const rows = await getStatRows(db, league, accepted.map((member) => member.user_id));
  return computeStandings({ league, members: accepted, rows });
}

/** Tus números en cada liga, para la lista de "Mis ligas". */
export async function listLeaguesForUser(db, userId) {
  const [rows] = await db.query(
    `SELECT ${LEAGUE_COLUMNS}, me.status AS my_status
     FROM friend_league_members me JOIN friend_leagues l ON l.id=me.league_id
     WHERE me.user_id=?
     ORDER BY FIELD(l.status,'active','draft','finished'), FIELD(me.status,'invited','accepted'), l.created_at DESC
     LIMIT 50`,
    [userId]
  );
  return Promise.all(rows.map(async (row) => {
    const league = parseLeague(row);
    const members = await getMembers(db, league.id);
    const summary = {
      id: league.id,
      name: league.name,
      status: league.status,
      is_public: league.is_public,
      my_status: row.my_status,
      team_size: league.team_size,
      matches_goal: league.matches_goal,
      days_left: league.status === 'active' ? league.days_left : null,
      members_count: members.filter((member) => member.status === 'accepted').length,
      owner_name: members.find((member) => member.user_id === league.owner_id)?.name || null,
      avatars: members.filter((member) => member.status === 'accepted').slice(0, 4)
        .map(({ user_id: id, name, avatar_url: avatarUrl }) => ({ id, name, avatar_url: avatarUrl })),
    };
    if (league.status === 'draft') return summary;
    const standings = await getStandings(db, league, members);
    const mine = standings.entries.find((entry) => entry.user_ids.includes(Number(userId)));
    const myLine = standings.players.get(Number(userId));
    return { ...summary, my_rank: mine?.rank ?? null, my_points: mine?.points ?? 0, my_matches: myLine?.matches ?? 0 };
  }));
}

/** Ligas públicas en las que aún no estás, para descubrirlas desde la pestaña Ligas. */
export async function listPublicLeagues(db, userId) {
  const [rows] = await db.query(
    `SELECT ${LEAGUE_COLUMNS}
     FROM friend_leagues l
     WHERE l.is_public=1
       AND (l.status IN ('draft','active') OR l.finished_at >= NOW() - INTERVAL ${PUBLIC_FINISHED_VISIBLE_DAYS} DAY)
       AND NOT EXISTS (SELECT 1 FROM friend_league_members me WHERE me.league_id=l.id AND me.user_id=? AND me.status='accepted')
     ORDER BY FIELD(l.status,'active','draft','finished'), l.created_at DESC
     LIMIT ${PUBLIC_LIST_LIMIT}`,
    [userId]
  );
  return Promise.all(rows.map(async (row) => {
    const league = parseLeague(row);
    const members = await getMembers(db, league.id);
    const summary = {
      id: league.id,
      name: league.name,
      status: league.status,
      matches_goal: league.matches_goal,
      days_left: league.status === 'active' ? league.days_left : null,
      members_count: members.filter((member) => member.status === 'accepted').length,
      leader_name: null,
      leader_points: null,
    };
    if (league.status === 'draft' || !summary.members_count) return summary;
    const [leader] = (await getStandings(db, league, members)).entries;
    const member = members.find((item) => item.user_id === leader.user_ids[0]);
    return { ...summary, leader_name: member?.nickname || member?.name || null, leader_points: leader.points };
  }));
}

const publicMember = ({ last_rank: _lastRank, primary_position: _position, ...member }) => member;

/** Detalle completo. La clasificación solo la ven los que han aceptado participar. */
export async function getLeagueDetail(db, leagueId, userId) {
  const league = await getLeague(db, leagueId);
  if (!league) return null;
  const members = await getMembers(db, leagueId);
  const me = members.find((member) => member.user_id === Number(userId));
  // Una liga pública la puede ver cualquiera, esté dentro o no.
  if (!me && !league.is_public) return null;
  const { closing_passed: _closing, join_code: joinCode, ...publicLeague } = league;
  const detail = {
    league: publicLeague,
    me: me
      ? { user_id: me.user_id, status: me.status, is_owner: league.owner_id === me.user_id, team_no: me.team_no }
      : { user_id: Number(userId), status: 'none', is_owner: false, team_no: null },
    members: members.map(publicMember),
    standings: [],
    join_url: league.is_public && joinCode ? `${PUBLIC_LINK_BASE}/liga/${joinCode}` : null,
    can_join: league.is_public && league.status !== 'finished' && me?.status !== 'accepted' && members.length < LEAGUE_LIMITS.adminMembers,
  };
  if (league.status === 'draft' || (detail.me.status !== 'accepted' && !league.is_public)) return detail;

  const standings = await getStandings(db, league, members);
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  // Misma media que en el perfil, sin atributos: no es necesario enseñarlos aquí.
  const cards = new Map(await Promise.all(members.filter((member) => member.status === 'accepted').map(async (member) => [
    member.user_id,
    computeLineupCard(await getSeasonStats(db, member.user_id), member.primary_position, null),
  ])));
  detail.standings = standings.entries.map(({ user_ids: userIds, key: _key, ...entry }) => ({
    ...entry,
    players: userIds.map((id) => {
      const member = memberById.get(id);
      return { ...standings.players.get(id), user_id: id, name: member.name, nickname: member.nickname, avatar_url: member.avatar_url, is_plus: member.is_plus, card: cards.get(id) };
    }),
  }));
  return detail;
}

const entryName = (entry, memberById) => entry.user_ids
  .map((id) => { const member = memberById.get(id); return member?.nickname || member?.name || 'Un rival'; })
  .join(' y ');

async function notifyLeague(db, { userId, league, title, body, dedupeKey }) {
  return createSocialNotification(db, {
    userId,
    type: 'friend_league',
    entityType: 'friend_league',
    entityId: league.id,
    title,
    body,
    data: { type: 'friend_league', screen: 'FriendLeagueDetail', leagueId: league.id },
    dedupeKey,
  });
}

/** Cierra la liga si procede y avisa a todos. Devuelve true si la ha cerrado. */
async function finishIfComplete(db, league, members, standings) {
  if (!isLeagueComplete({ standings, closingPassed: league.closing_passed })) return false;
  const [result] = await db.query(`UPDATE friend_leagues SET status='finished', finished_at=NOW() WHERE id=? AND status='active'`, [league.id]);
  if (!result.affectedRows) return true;
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const winners = standings.entries.filter((entry) => entry.rank === 1).map((entry) => entryName(entry, memberById)).join(' y ');
  await Promise.all(standings.entries.flatMap((entry) => entry.user_ids.map((userId) => notifyLeague(db, {
    userId,
    league,
    title: entry.rank === 1 ? `🏆 ¡Has ganado ${league.name}!` : `${league.name} ha terminado`,
    body: entry.rank === 1 ? `Has acabado primero con ${entry.points} puntos.` : `Ganador: ${winners}. Has acabado en el puesto ${entry.rank}.`,
    dedupeKey: `friend-league-finished:${league.id}:${userId}`,
  }))));
  return true;
}

async function sendRankAlerts(db, league, members, standings) {
  const previousRanks = new Map(members.filter((member) => member.last_rank).map((member) => [member.user_id, member.last_rank]));
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  for (const { entry, overtaker } of findOvertaken({ standings, previousRanks })) {
    const name = entryName(overtaker, memberById);
    for (const userId of entry.user_ids) {
      if (await notifyLeague(db, {
        userId,
        league,
        title: `${name} te ha adelantado`,
        body: `Vas ${entry.rank}º en ${league.name}. ¿Buscamos partido para recuperar el puesto?`,
        dedupeKey: `friend-league-overtaken:${league.id}:${userId}:${today}`,
      })) sent += 1;
    }
  }
  for (const entry of standings.entries) {
    for (const userId of entry.user_ids) {
      await db.query('UPDATE friend_league_members SET last_rank=? WHERE league_id=? AND user_id=?', [entry.rank, league.id, userId]);
    }
  }
  return sent;
}

async function sendDeadlineReminders(db, league, standings) {
  if (league.days_left > REMINDER_DAYS) return 0;
  let sent = 0;
  for (const [userId, line] of standings.players) {
    const remaining = league.matches_goal - line.matches;
    if (remaining <= 0) continue;
    const plural = remaining === 1 ? 'partido' : 'partidos';
    const days = league.days_left === 1 ? '1 día' : `${league.days_left} días`;
    if (await notifyLeague(db, {
      userId,
      league,
      title: `Se acaba ${league.name}`,
      body: league.days_left ? `Te quedan ${remaining} ${plural} y ${days} para jugarlos.` : `Hoy es el último día y te quedan ${remaining} ${plural}.`,
      dedupeKey: `friend-league-reminder:${league.id}:${userId}`,
    })) sent += 1;
  }
  return sent;
}

/** Revisa las ligas activas: cierra las acabadas y manda los avisos pendientes. */
export async function settleFriendLeagues(db = pool) {
  const [rows] = await db.query(`SELECT ${LEAGUE_COLUMNS} FROM friend_leagues l WHERE l.status='active' LIMIT 500`);
  const results = { checked: rows.length, finished: 0, alerts: 0, failed: 0 };
  for (const row of rows) {
    const league = parseLeague(row);
    try {
      const members = await getMembers(db, league.id);
      const standings = await getStandings(db, league, members);
      if (await finishIfComplete(db, league, members, standings)) {
        results.finished += 1;
        continue;
      }
      results.alerts += await sendRankAlerts(db, league, members, standings);
      results.alerts += await sendDeadlineReminders(db, league, standings);
    } catch (error) {
      results.failed += 1;
      console.error('[FRIEND LEAGUES]', { leagueId: league.id, error: error?.message || error });
    }
  }
  return results;
}

let schedulerStarted = false;
let schedulerRunning = false;

/** Cada 30 minutos, solo de 10:00 a 22:00 en Madrid porque casi todo acaba en un aviso. */
export function startFriendLeagueScheduler({ intervalMinutes = 30 } = {}) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  registerScheduler('friend-leagues', { maxAgeSeconds: 2 * intervalMinutes * 60 });

  const run = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      if (isSendingHour()) {
        const result = await settleFriendLeagues();
        if (result.finished || result.alerts || result.failed) console.log('[FRIEND LEAGUES]', result);
      }
      markSchedulerSuccess('friend-leagues');
    } catch (error) {
      markSchedulerFailure('friend-leagues', error);
      console.error('[FRIEND LEAGUES] Error revisando ligas:', error?.message || error);
    } finally {
      schedulerRunning = false;
    }
  };

  run();
  setInterval(run, Math.max(1, Number(intervalMinutes) || 30) * 60 * 1000);
}
