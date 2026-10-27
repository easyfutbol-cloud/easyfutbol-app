// Enlace público del perfil y los datos extra de la cabecera (racha y forma
// reciente). La URL cuelga del mismo dominio que /claim/<token>, que ya
// funciona como página puente desde WhatsApp hacia la app.
import crypto from 'crypto';
import { getPlayedMatches } from './engagementService.js';
import { computeStreak, weekKey } from './engagementRules.js';

export const PUBLIC_LINK_BASE = (process.env.PUBLIC_API_URL || 'https://api.easyfutbol.es').replace(/\/+$/, '');
export const profileShareUrl = (slug) => (slug ? `${PUBLIC_LINK_BASE}/jugador/${slug}` : null);
export const isValidSlug = (slug) => /^[A-Za-z0-9]{6,16}$/.test(String(slug || ''));

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomSlug(length = 10) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('');
}

/** Devuelve el slug del jugador, creándolo la primera vez. */
export async function ensureProfileSlug(db, userId) {
  const [[row]] = await db.query('SELECT public_slug FROM users WHERE id = ?', [userId]);
  if (row?.public_slug) return row.public_slug;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = randomSlug();
    try {
      // "IS NULL" evita pisar un slug creado a la vez desde otra petición.
      await db.query('UPDATE users SET public_slug = ? WHERE id = ? AND public_slug IS NULL', [slug, userId]);
      const [[after]] = await db.query('SELECT public_slug FROM users WHERE id = ?', [userId]);
      if (after?.public_slug) return after.public_slug;
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw new Error('No se pudo generar el enlace del perfil');
}

export async function getProfileStreak(db, userId, now = new Date()) {
  const matches = await getPlayedMatches(db, userId);
  const streak = computeStreak(matches.map((m) => weekKey(m.starts_at)).filter(Boolean), weekKey(now));
  return { current: streak.current, best: streak.best, at_risk: streak.at_risk };
}

/**
 * Últimos 5 partidos con acta. El resultado siempre se ve; goles y
 * asistencias solo si el jugador enseña esas estadísticas (o es su perfil).
 */
export async function getRecentForm(db, userId, { showGoals, showAssists }) {
  const [rows] = await db.query(
    `SELECT m.id AS match_id, m.starts_at, mps.result, mps.goals, mps.assists, CAST(mps.is_mvp AS UNSIGNED) AS is_mvp
     FROM match_player_stats mps JOIN matches m ON m.id = mps.match_id
     WHERE mps.user_id = ? AND mps.result IS NOT NULL
     ORDER BY m.starts_at DESC, m.id DESC LIMIT 5`,
    [userId]
  );
  return rows.map((r) => ({
    match_id: r.match_id,
    starts_at: r.starts_at,
    result: r.result,
    is_mvp: Boolean(Number(r.is_mvp)),
    goals: showGoals ? Number(r.goals || 0) : null,
    assists: showAssists ? Number(r.assists || 0) : null,
  }));
}

export async function getSeasonStats(db, userId) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS matches_played, COALESCE(SUM(goals),0) AS goals, COALESCE(SUM(assists),0) AS assists,
            COALESCE(SUM(saves),0) AS saves, COALESCE(SUM(is_mvp),0) AS mvp_count,
            COALESCE(SUM(result='win'),0) AS wins, COALESCE(SUM(result='loss'),0) AS losses, COALESCE(SUM(result='draw'),0) AS draws
     FROM match_player_stats WHERE user_id=?`,
    [userId]
  );
  const decided = Number(row.wins) + Number(row.losses) + Number(row.draws);
  return {
    matches_played: Number(row.matches_played),
    goals: Number(row.goals),
    assists: Number(row.assists),
    saves: Number(row.saves),
    mvp_count: Number(row.mvp_count),
    win_rate: decided ? Math.round((Number(row.wins) / decided) * 100) : 0,
  };
}
