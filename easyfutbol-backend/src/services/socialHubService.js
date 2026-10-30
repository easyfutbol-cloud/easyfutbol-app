// Pantalla Social: los tops de jugadores por categoría y la lista de amigos
// con lo que hace falta para pintarla (color, dorsal, carta, próximo partido).
// Los tops enseñan lo mismo que el ranking público (/stats/top-players).
import { activePlusSql } from './subscriptionService.js';
import { equippedCosmetics } from './engagementRules.js';
import { computePlayerCard, parseProfileSections } from './playerCardService.js';
import { getLocationFilter, getPeriodBounds, getUserSedeSlug } from './rankingScope.js';
import { formatLocationLabel } from './weeklyLineupService.js';

export const TOP_CATEGORIES = [
  { key: 'goals', emoji: '⚽', title: 'Goleadores', unit: 'goles' },
  { key: 'assists', emoji: '🎯', title: 'Asistentes', unit: 'asistencias' },
  { key: 'mvps', emoji: '⭐', title: 'MVPs', unit: 'MVP' },
  { key: 'saves', emoji: '🧤', title: 'Muros', unit: 'paradas' },
  { key: 'wins', emoji: '🏆', title: 'Ganadores', unit: 'victorias' },
  { key: 'matches', emoji: '📅', title: 'Incansables', unit: 'partidos' },
  { key: 'reactions', emoji: '🔥', title: 'Más valorados', unit: 'reacciones' },
];
export const TOP_PERIODS = { month: 'monthly', season: 'yearly' };
export const TOP_SCOPES = ['sede', 'all', 'friends'];

/**
 * Ordena una categoría. Empate: gana quien lo hizo en menos partidos, y si
 * sigue igual comparten puesto (1, 1, 3). Fuera los que tienen 0.
 */
export function rankCategory(rows, key, meId, limit = 10) {
  const sorted = rows
    .filter((row) => Number(row[key]) > 0)
    .sort((a, b) => b[key] - a[key] || a.matches - b.matches || String(a.name).localeCompare(String(b.name), 'es'));
  let rank = 0;
  const ranked = sorted.map((row, index) => {
    const prev = sorted[index - 1];
    if (!prev || prev[key] !== row[key] || prev.matches !== row.matches) rank = index + 1;
    return { rank, row };
  });
  const toItem = ({ rank: position, row }) => ({
    rank: position, id: row.id, name: row.name, nickname: row.nickname, avatar_url: row.avatar_url,
    is_plus: row.is_plus, profile_accent: row.profile_accent, value: Number(row[key]), matches: row.matches,
  });
  const mine = ranked.find((entry) => entry.row.id === meId);
  return { items: ranked.slice(0, limit).map(toItem), me: mine ? { rank: mine.rank, value: Number(mine.row[key]) } : null };
}

async function friendIds(db, userId) {
  const [rows] = await db.query(
    `SELECT IF(requester_id=?,addressee_id,requester_id) AS id FROM friendships
     WHERE status='accepted' AND (requester_id=? OR addressee_id=?)`,
    [userId, userId, userId]
  );
  return rows.map((row) => row.id);
}

/** Tops de un periodo ('month' | 'season') en un ámbito ('sede' | 'all' | 'friends'). */
export async function getSocialTops(db, userId, { period = 'month', scope = 'sede', limit = 10 } = {}) {
  const periodKey = TOP_PERIODS[period] ? period : 'month';
  let scopeKey = TOP_SCOPES.includes(scope) ? scope : 'sede';
  const bounds = getPeriodBounds(TOP_PERIODS[periodKey]);

  let sede = null;
  let locationFilter = { sql: '', params: [] };
  if (scopeKey === 'sede') {
    sede = await getUserSedeSlug(db, userId);
    if (sede) locationFilter = getLocationFilter({ location_slug: sede });
    else scopeKey = 'all';
  }
  let ids = null;
  if (scopeKey === 'friends') ids = [userId, ...(await friendIds(db, userId))];

  const [rows] = await db.query(
    `SELECT u.id, u.name, u.nickname, u.avatar_url, u.profile_accent, MAX(${activePlusSql('u.id')}) AS is_plus,
            COUNT(DISTINCT mps.match_id) AS matches, COALESCE(SUM(mps.goals),0) AS goals,
            COALESCE(SUM(mps.assists),0) AS assists, COALESCE(SUM(mps.is_mvp),0) AS mvps,
            COALESCE(SUM(mps.saves),0) AS saves, COALESCE(SUM(mps.result='win'),0) AS wins
     FROM match_player_stats mps
     JOIN users u ON u.id = mps.user_id
     JOIN matches m ON m.id = mps.match_id
     WHERE m.starts_at >= ? AND m.starts_at < ? ${locationFilter.sql}
       ${ids ? 'AND u.id IN (?)' : ''}
     GROUP BY u.id, u.name, u.nickname, u.avatar_url, u.profile_accent`,
    [bounds.start, bounds.end, ...locationFilter.params, ...(ids ? [ids] : [])]
  );
  const players = rows.map((row) => ({
    ...row,
    is_plus: Boolean(Number(row.is_plus)),
    matches: Number(row.matches), goals: Number(row.goals), assists: Number(row.assists),
    mvps: Number(row.mvps), saves: Number(row.saves), wins: Number(row.wins), reactions: 0,
  }));

  // Reacciones recibidas en el periodo, solo entre los jugadores que han jugado en él.
  if (players.length) {
    const [reactionRows] = await db.query(
      `SELECT profile_user_id AS id, COUNT(*) AS total FROM player_profile_reactions
       WHERE created_at >= ? AND created_at < ? AND profile_user_id IN (?) GROUP BY profile_user_id`,
      [bounds.start, bounds.end, players.map((p) => p.id)]
    );
    const byId = new Map(reactionRows.map((row) => [row.id, Number(row.total)]));
    for (const player of players) player.reactions = byId.get(player.id) || 0;
  }

  return {
    period: periodKey,
    scope: scopeKey,
    sede: sede ? formatLocationLabel(sede) : null,
    players: players.length,
    categories: TOP_CATEGORIES.map((category) => ({ ...category, ...rankCategory(players, category.key, userId, limit) })),
  };
}

/**
 * Amigos con todo lo de su tarjeta. Orden: primero los que juegan pronto,
 * luego con los que más has jugado. La media de la carta solo si la enseñan;
 * el próximo partido solo si dejan verlo a sus amigos.
 */
export async function getFriendsOverview(db, userId) {
  const [friends] = await db.query(
    `SELECT u.id, u.name, u.nickname, u.avatar_url, u.profile_accent, u.shirt_number, u.primary_position,
            u.equipped_frame, u.equipped_title, u.preferred_location, ${activePlusSql('u.id')} AS is_plus,
            f.created_at AS friends_since, usp.profile_sections, COALESCE(usp.show_upcoming_to_friends,1) AS show_upcoming
     FROM friendships f
     JOIN users u ON u.id = IF(f.requester_id=?, f.addressee_id, f.requester_id)
     LEFT JOIN user_social_privacy usp ON usp.user_id = u.id
     WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?)
       AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))`,
    [userId, userId, userId, userId, userId]
  );
  if (!friends.length) return [];
  const ids = friends.map((f) => f.id);

  const [statRows] = await db.query(
    `SELECT user_id, COUNT(*) AS matches_played, COALESCE(SUM(goals),0) AS goals, COALESCE(SUM(assists),0) AS assists,
            COALESCE(SUM(saves),0) AS saves, COALESCE(SUM(is_mvp),0) AS mvp_count,
            COALESCE(SUM(result='win'),0) AS wins, COALESCE(SUM(result IN ('win','loss','draw')),0) AS decided
     FROM match_player_stats WHERE user_id IN (?) GROUP BY user_id`,
    [ids]
  );
  const [togetherRows] = await db.query(
    `SELECT b.user_id, COUNT(DISTINCT a.match_id) AS matches_together, MAX(m.starts_at) AS last_together
     FROM match_player_stats a
     JOIN match_player_stats b ON b.match_id = a.match_id AND b.user_id IN (?)
     JOIN matches m ON m.id = a.match_id
     WHERE a.user_id = ? AND m.starts_at < NOW()
     GROUP BY b.user_id`,
    [ids, userId]
  );
  const [nextRows] = await db.query(
    `SELECT i.user_id, m.id, m.title, m.starts_at
     FROM inscriptions i JOIN matches m ON m.id = i.match_id
     WHERE i.user_id IN (?) AND i.status IN ('pending','confirmed') AND m.starts_at > NOW() AND m.status <> 'cancelled'
     ORDER BY m.starts_at ASC`,
    [ids]
  );

  const stats = new Map(statRows.map((row) => [row.user_id, row]));
  const together = new Map(togetherRows.map((row) => [row.user_id, row]));
  const next = new Map();
  for (const row of nextRows) if (!next.has(row.user_id)) next.set(row.user_id, row);

  const items = friends.map((friend) => {
    const s = stats.get(friend.id);
    const decided = Number(s?.decided || 0);
    const season = {
      matches_played: Number(s?.matches_played || 0), goals: Number(s?.goals || 0), assists: Number(s?.assists || 0),
      saves: Number(s?.saves || 0), mvp_count: Number(s?.mvp_count || 0),
      win_rate: decided ? Math.round((Number(s.wins) / decided) * 100) : 0,
    };
    const showsCard = parseProfileSections(friend.profile_sections).includes('card');
    const card = showsCard ? computePlayerCard(season, friend.primary_position) : null;
    const t = together.get(friend.id);
    const upcoming = Number(friend.show_upcoming) === 1 ? next.get(friend.id) : null;
    return {
      id: friend.id,
      name: friend.name,
      nickname: friend.nickname,
      avatar_url: friend.avatar_url,
      profile_accent: friend.profile_accent,
      shirt_number: friend.shirt_number,
      primary_position: friend.primary_position,
      preferred_location: formatLocationLabel(friend.preferred_location),
      is_plus: Boolean(Number(friend.is_plus)),
      cosmetics: equippedCosmetics(friend.equipped_frame, friend.equipped_title),
      friends_since: friend.friends_since,
      card: card && !card.provisional ? { overall: card.overall, tier: card.tier } : null,
      matches_together: Number(t?.matches_together || 0),
      last_together: t?.last_together || null,
      next_match: upcoming ? { id: upcoming.id, title: upcoming.title, starts_at: upcoming.starts_at } : null,
    };
  });
  const nextAt = (item) => (item.next_match ? new Date(item.next_match.starts_at).getTime() : Infinity);
  return items.sort((a, b) => nextAt(a) - nextAt(b) || b.matches_together - a.matches_together || a.name.localeCompare(b.name, 'es'));
}
