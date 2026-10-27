// Vitrina del perfil público (logros, veces en El 8 de la semana) y
// contador de visitas.
import { ACHIEVEMENT_CATALOG, getAchievementProgress } from './achievementCatalog.js';
import { POSITION_SLOTS } from './weeklyLineupService.js';

const TYPE_ICONS = {
  matches: 'calendar',
  goals: 'football',
  assists: 'git-merge',
  mvps: 'star',
  best_goals_in_match: 'flame',
  best_assists_in_match: 'flash',
  complete_player: 'ribbon',
};

// Qué estadística del perfil delata cada logro: si el jugador la oculta, el
// logro tampoco se enseña (un "50 goles" diría sus goles igualmente).
const TYPE_STATS = {
  matches: ['matches_played'],
  goals: ['goals'],
  assists: ['assists'],
  mvps: ['mvp_count'],
  best_goals_in_match: ['goals'],
  best_assists_in_match: ['assists'],
  complete_player: ['goals', 'assists'],
};

/**
 * De cada tipo, solo el logro más alto conseguido (con "25 goles" no hace
 * falta enseñar también "Primer gol"). visibleStats null = sin filtro (dueño).
 */
export function pickShowcaseAchievements(progressByType, visibleStats = null) {
  const best = new Map();
  for (const item of ACHIEVEMENT_CATALOG) {
    if ((progressByType[item.type] || 0) < item.target) continue;
    if (visibleStats && !TYPE_STATS[item.type].every((stat) => visibleStats.includes(stat))) continue;
    const current = best.get(item.type);
    if (!current || item.target > current.target) best.set(item.type, item);
  }
  return [...best.values()]
    .sort((a, b) => b.points - a.points)
    .map((item) => ({ code: item.code, title: item.title, description: item.description, icon: TYPE_ICONS[item.type] || 'medal' }));
}

/** Veces que el jugador ha entrado en El 8 de la semana (votaciones cerradas). */
export async function getWeeklyLineupWins(db, userId) {
  const slotsCase = Object.entries(POSITION_SLOTS).map(([position, slots]) => `WHEN ${db.escape(position)} THEN ${Number(slots)}`).join(' ');
  // Mismo desempate que getPollWinners: más votos y, a igualdad, el candidato más antiguo.
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS wins FROM (
       SELECT c.user_id, c.position,
              ROW_NUMBER() OVER (PARTITION BY c.poll_id, c.position ORDER BY COUNT(v.id) DESC, c.id ASC) AS rn
       FROM weekly_lineup_candidates c
       JOIN weekly_lineup_polls p ON p.id = c.poll_id AND p.status = 'closed'
       LEFT JOIN weekly_lineup_votes v ON v.candidate_id = c.id
       WHERE c.poll_id IN (SELECT poll_id FROM weekly_lineup_candidates WHERE user_id = ?)
       GROUP BY c.id, c.poll_id, c.position, c.user_id
     ) ranked
     WHERE ranked.user_id = ? AND ranked.rn <= CASE ranked.position ${slotsCase} ELSE 0 END`,
    [userId, userId]
  );
  return Number(row?.wins || 0);
}

export async function getProfileShowcase(db, userId, visibleStats) {
  const [progress, weeklyLineupWins] = await Promise.all([
    getAchievementProgress(db, userId),
    getWeeklyLineupWins(db, userId),
  ]);
  return {
    achievements: pickShowcaseAchievements(progress, visibleStats),
    weekly_lineup_wins: weeklyLineupWins,
  };
}

export async function recordProfileView(db, profileUserId, viewerUserId) {
  await db.query('INSERT IGNORE INTO profile_views (profile_user_id, viewer_user_id, viewed_on) VALUES (?, ?, CURRENT_DATE)', [profileUserId, viewerUserId]);
}

/** Personas distintas que han visto el perfil en los últimos 7 días y en los 7 anteriores. */
export async function getProfileViews(db, userId) {
  const [[row]] = await db.query(
    `SELECT
       COUNT(DISTINCT CASE WHEN viewed_on >= CURRENT_DATE - INTERVAL 6 DAY THEN viewer_user_id END) AS last_7_days,
       COUNT(DISTINCT CASE WHEN viewed_on < CURRENT_DATE - INTERVAL 6 DAY THEN viewer_user_id END) AS previous_7_days
     FROM profile_views
     WHERE profile_user_id = ? AND viewed_on >= CURRENT_DATE - INTERVAL 13 DAY`,
    [userId]
  );
  return { last_7_days: Number(row?.last_7_days || 0), previous_7_days: Number(row?.previous_7_days || 0) };
}
