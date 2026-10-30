// Perfil social v3: carta de jugador (media y atributos calculados de sus
// partidos), evolución mensual y los campos que el jugador personaliza
// (apodo, dorsal, bio, equipo, color y qué secciones enseña en qué orden).
import { containsOffensiveText, validatePublicName } from './publicNameModerationService.js';

// Secciones del perfil que el jugador puede ordenar u ocultar. Las de amistad
// (comparativa, partidos juntos, próximos partidos) van siempre al final.
export const PROFILE_SECTION_KEYS = ['card', 'evolution', 'form', 'stats', 'photos', 'showcase', 'reactions'];
// Sin elegir nada se ve lo de antes: carta y evolución son opt-in, igual que
// las estadísticas, porque dejan deducir goles y asistencias.
export const DEFAULT_PROFILE_SECTIONS = ['form', 'stats', 'photos', 'showcase', 'reactions'];
// Solo claves; los colores los pinta la app.
export const PROFILE_ACCENTS = ['orange', 'red', 'gold', 'green', 'sky', 'blue', 'purple', 'pink'];

export const MIN_MATCHES_FOR_CARD = 3;

export function parseProfileSections(raw) {
  if (raw === null || raw === undefined) return [...DEFAULT_PROFILE_SECTIONS];
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  // 'comments' era la sección de comentarios, sustituida por las reacciones.
  return [...new Set(list.map((s) => String(s).trim()).map((s) => (s === 'comments' ? 'reactions' : s)))].filter((s) => PROFILE_SECTION_KEYS.includes(s));
}

const cleanText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

/**
 * Valida lo que llega de la pantalla de edición. Solo se tocan los campos
 * presentes en el body; '' o null borra el valor.
 */
export function normalizeProfileCustomization(body = {}) {
  const values = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);

  if (has('nickname')) {
    const nickname = cleanText(body.nickname);
    if (!nickname) values.nickname = null;
    else {
      if (nickname.length > 24) return { ok: false, msg: 'El apodo puede tener como mucho 24 caracteres' };
      const check = validatePublicName(nickname);
      if (!check.ok) return { ok: false, msg: check.code === 'OFFENSIVE_PUBLIC_NAME' ? 'Ese apodo no está permitido' : 'El apodo debe tener al menos 2 caracteres' };
      values.nickname = check.name;
    }
  }
  if (has('shirt_number')) {
    const raw = body.shirt_number;
    if (raw === null || raw === '') values.shirt_number = null;
    else {
      const number = Number(raw);
      if (!Number.isInteger(number) || number < 1 || number > 99) return { ok: false, msg: 'El dorsal debe ser un número del 1 al 99' };
      values.shirt_number = number;
    }
  }
  if (has('bio')) {
    // La bio puede tener saltos de línea, pero sin párrafos vacíos de relleno.
    const bio = String(body.bio ?? '').trim().replace(/\n{3,}/g, '\n\n');
    if (bio.length > 160) return { ok: false, msg: 'La bio puede tener como mucho 160 caracteres' };
    if (bio && containsOffensiveText(bio)) return { ok: false, msg: 'La bio tiene palabras que no están permitidas' };
    values.bio = bio || null;
  }
  if (has('favorite_team')) {
    const team = cleanText(body.favorite_team);
    if (team.length > 40) return { ok: false, msg: 'El equipo puede tener como mucho 40 caracteres' };
    if (team && containsOffensiveText(team)) return { ok: false, msg: 'Ese equipo no está permitido' };
    values.favorite_team = team || null;
  }
  if (has('profile_accent')) {
    const accent = body.profile_accent || null;
    if (accent && !PROFILE_ACCENTS.includes(accent)) return { ok: false, msg: 'Color no válido' };
    values.profile_accent = accent;
  }
  if (has('profile_sections')) {
    if (!Array.isArray(body.profile_sections)) return { ok: false, msg: 'Secciones no válidas' };
    values.profile_sections = parseProfileSections(body.profile_sections).join(',');
  }
  return { ok: true, values };
}

// --- carta de jugador ---

// Cada atributo va de 45 (nada aún) a 99 (tope). La raíz cuadrada hace que
// los primeros goles suban más que los del jugador que ya está arriba.
const ATTRIBUTE_CAPS = { gol: 1.5, asi: 1.2, par: 5, vic: 100, mvp: 0.4, exp: 40 };
const scale = (value, cap) => Math.round(45 + 54 * Math.sqrt(Math.min(1, Math.max(0, value) / cap)));

const WEIGHTS = {
  forward: { gol: 0.4, asi: 0.15, vic: 0.2, mvp: 0.15, exp: 0.1 },
  midfielder: { gol: 0.15, asi: 0.35, vic: 0.25, mvp: 0.15, exp: 0.1 },
  defender: { gol: 0.05, asi: 0.15, vic: 0.45, mvp: 0.2, exp: 0.15 },
  goalkeeper: { par: 0.5, vic: 0.25, mvp: 0.1, exp: 0.15 },
  default: { gol: 0.25, asi: 0.2, vic: 0.25, mvp: 0.15, exp: 0.15 },
};

const ATTRIBUTE_LABELS = { gol: 'GOL', asi: 'ASI', par: 'PAR', vic: 'VIC', mvp: 'MVP', exp: 'EXP' };

export function cardTier(overall) {
  if (overall >= 84) return 'elite';
  if (overall >= 72) return 'gold';
  if (overall >= 60) return 'silver';
  return 'bronze';
}

/** stats: lo que devuelve getSeasonStats. position: users.primary_position. */
export function computePlayerCard(stats, position) {
  const matches = Number(stats?.matches_played || 0);
  const perMatch = (value) => (matches ? Number(value || 0) / matches : 0);
  const values = {
    gol: scale(perMatch(stats?.goals), ATTRIBUTE_CAPS.gol),
    asi: scale(perMatch(stats?.assists), ATTRIBUTE_CAPS.asi),
    par: scale(perMatch(stats?.saves), ATTRIBUTE_CAPS.par),
    vic: matches ? scale(Number(stats?.win_rate || 0), ATTRIBUTE_CAPS.vic) : 45,
    mvp: scale(perMatch(stats?.mvp_count), ATTRIBUTE_CAPS.mvp),
    exp: scale(matches, ATTRIBUTE_CAPS.exp),
  };
  const weights = WEIGHTS[position] || WEIGHTS.default;
  const overall = Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + values[key] * weight, 0));
  return {
    overall,
    tier: cardTier(overall),
    position: position || null,
    provisional: matches < MIN_MATCHES_FOR_CARD,
    matches_played: matches,
    attributes: Object.keys(ATTRIBUTE_LABELS).map((key) => ({ key, label: ATTRIBUTE_LABELS[key], value: values[key] })),
  };
}

// --- evolución mensual ---

const monthKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

/** Lista de los últimos `months` meses (YYYY-MM), del más antiguo al actual. */
export function lastMonthKeys(months, now = new Date()) {
  const keys = [];
  for (let i = months - 1; i >= 0; i -= 1) keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  return keys;
}

/**
 * Partidos, goles, asistencias y victorias por mes (meses sin partidos a 0).
 * Goles/asistencias/victorias van a null si el jugador no los enseña.
 */
export async function getMonthlyEvolution(db, userId, { months = 6, now = new Date(), show = {} } = {}) {
  const keys = lastMonthKeys(months, now);
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(m.starts_at,'%Y-%m') AS month, COUNT(DISTINCT mps.match_id) AS matches_played,
            COALESCE(SUM(mps.goals),0) AS goals, COALESCE(SUM(mps.assists),0) AS assists,
            COALESCE(SUM(mps.result='win'),0) AS wins
     FROM match_player_stats mps JOIN matches m ON m.id = mps.match_id
     WHERE mps.user_id = ? AND m.starts_at >= ? AND m.starts_at < ?
     GROUP BY DATE_FORMAT(m.starts_at,'%Y-%m')`,
    [userId, `${keys[0]}-01`, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))]
  );
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => {
    const row = byMonth.get(month);
    return {
      month,
      matches_played: Number(row?.matches_played || 0),
      goals: show.goals ? Number(row?.goals || 0) : null,
      assists: show.assists ? Number(row?.assists || 0) : null,
      wins: show.wins ? Number(row?.wins || 0) : null,
    };
  });
}
