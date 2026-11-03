// Reglas puras de las ligas privadas: validación de la configuración y cálculo
// de la clasificación. Sin base de datos, para poder probarlas directamente.

export const RULE_KEYS = ['win', 'draw', 'loss', 'goal', 'assist', 'save', 'mvp'];
export const DEFAULT_RULES = { win: 3, draw: 1, loss: 0, goal: 1, assist: 1, save: 1, mvp: 2, double_vs_rivals: true };
export const LEAGUE_LIMITS = {
  name: { min: 3, max: 60 },
  matchesGoal: { min: 3, max: 50 },
  durationDays: { min: 7, max: 180 },
  points: { min: -10, max: 20 },
  members: 30,
};
const TEAM_SIZES = [1, 2, 3];

const inRange = (value, { min, max }) => Number.isInteger(value) && value >= min && value <= max;

/** Devuelve las reglas limpias, o null si algún valor no es válido o todas valen 0. */
export function normalizeRules(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rules = { double_vs_rivals: raw.double_vs_rivals !== false };
  for (const key of RULE_KEYS) {
    const value = raw[key] === undefined ? DEFAULT_RULES[key] : Number(raw[key]);
    if (!inRange(value, LEAGUE_LIMITS.points)) return null;
    rules[key] = value;
  }
  return RULE_KEYS.some((key) => rules[key] !== 0) ? rules : null;
}

/** Valida lo que manda el creador. Devuelve { value } o { error } con un texto para el usuario. */
export function normalizeLeagueInput(body = {}) {
  const name = String(body.name || '').trim();
  if (name.length < LEAGUE_LIMITS.name.min || name.length > LEAGUE_LIMITS.name.max) {
    return { error: `El nombre debe tener entre ${LEAGUE_LIMITS.name.min} y ${LEAGUE_LIMITS.name.max} caracteres` };
  }
  const teamSize = Number(body.team_size);
  if (!TEAM_SIZES.includes(teamSize)) return { error: 'Elige si se juega en solitario, en parejas o en tríos' };
  const matchesGoal = Number(body.matches_goal);
  if (!inRange(matchesGoal, LEAGUE_LIMITS.matchesGoal)) {
    return { error: `La liga debe tener entre ${LEAGUE_LIMITS.matchesGoal.min} y ${LEAGUE_LIMITS.matchesGoal.max} partidos` };
  }
  const durationDays = Number(body.duration_days);
  if (!inRange(durationDays, LEAGUE_LIMITS.durationDays)) {
    return { error: `La duración debe estar entre ${LEAGUE_LIMITS.durationDays.min} y ${LEAGUE_LIMITS.durationDays.max} días` };
  }
  const rules = normalizeRules(body.rules);
  if (!rules) return { error: `Los puntos deben ser enteros entre ${LEAGUE_LIMITS.points.min} y ${LEAGUE_LIMITS.points.max}, y al menos uno distinto de 0` };
  return { value: { name, team_size: teamSize, matches_goal: matchesGoal, duration_days: durationDays, rules } };
}

/**
 * Comprueba que los equipos repartan a todos los aceptados en grupos del tamaño
 * de la liga. Devuelve { teamByUser } (Map usuario → nº de equipo) o { error }.
 */
export function validateTeams({ teamSize, acceptedIds, teams }) {
  const accepted = acceptedIds.map(Number);
  if (teamSize === 1) {
    return accepted.length >= 2 ? { teamByUser: new Map() } : { error: 'Hacen falta al menos 2 jugadores que hayan aceptado' };
  }
  const label = teamSize === 2 ? 'parejas' : 'tríos';
  if (accepted.length < teamSize * 2) return { error: `Hacen falta al menos 2 ${label} completas` };
  if (accepted.length % teamSize !== 0) return { error: `Con ${accepted.length} jugadores no salen ${label} completas` };
  if (!Array.isArray(teams) || teams.some((team) => !Array.isArray(team) || team.length !== teamSize)) {
    return { error: `Reparte a todos los jugadores en ${label} completas` };
  }
  const teamByUser = new Map();
  teams.forEach((team, index) => team.forEach((userId) => teamByUser.set(Number(userId), index + 1)));
  const complete = teamByUser.size === accepted.length && accepted.every((userId) => teamByUser.has(userId));
  return complete ? { teamByUser } : { error: `Reparte a todos los jugadores en ${label} completas` };
}

const emptyLine = () => ({ points: 0, matches: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, saves: 0, mvps: 0, rival_wins: 0 });

const compareEntries = (a, b) => b.points - a.points || b.wins - a.wins || b.goals - a.goals;

/**
 * Clasificación de la liga.
 * - members: [{ user_id, team_no }], solo los aceptados.
 * - rows: filas de match_player_stats con result cerrado y starts_at dentro de la liga.
 * A cada jugador le cuentan sus primeros `matches_goal` partidos. Ganar vale doble
 * si un rival de la liga (no tu compañero) perdió ese partido, es decir, jugó
 * enfrente. Ese rival cuenta aunque ya haya agotado sus propios partidos.
 */
export function computeStandings({ league, members, rows }) {
  const { rules, matches_goal: goal, team_size: teamSize } = league;
  const teamOf = new Map(members.map((member) => [Number(member.user_id), member.team_no ?? null]));
  const losersByMatch = new Map();
  const rowsByUser = new Map();
  const sorted = [...rows]
    .filter((row) => teamOf.has(Number(row.user_id)))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at) || Number(a.match_id) - Number(b.match_id));
  for (const row of sorted) {
    const userId = Number(row.user_id);
    if (row.result === 'loss') {
      if (!losersByMatch.has(row.match_id)) losersByMatch.set(row.match_id, []);
      losersByMatch.get(row.match_id).push(userId);
    }
    if (!rowsByUser.has(userId)) rowsByUser.set(userId, []);
    rowsByUser.get(userId).push(row);
  }

  const players = new Map();
  for (const member of members) {
    const userId = Number(member.user_id);
    const line = emptyLine();
    for (const row of (rowsByUser.get(userId) || []).slice(0, goal)) {
      const goals = Number(row.goals || 0);
      const assists = Number(row.assists || 0);
      const saves = Number(row.saves || 0);
      const mvp = row.is_mvp ? 1 : 0;
      line.matches += 1;
      line.goals += goals;
      line.assists += assists;
      line.saves += saves;
      line.mvps += mvp;
      line.points += goals * rules.goal + assists * rules.assist + saves * rules.save + mvp * rules.mvp;
      if (row.result === 'win') {
        const beatRival = (losersByMatch.get(row.match_id) || [])
          .some((loser) => teamSize === 1 || teamOf.get(loser) !== teamOf.get(userId));
        const doubled = rules.double_vs_rivals && beatRival;
        line.wins += 1;
        if (doubled) line.rival_wins += 1;
        line.points += rules.win * (doubled ? 2 : 1);
      } else if (row.result === 'draw') {
        line.draws += 1;
        line.points += rules.draw;
      } else if (row.result === 'loss') {
        line.losses += 1;
        line.points += rules.loss;
      }
    }
    players.set(userId, line);
  }

  // En solitario cada jugador es su propio equipo; así el resto del cálculo es único.
  const entries = new Map();
  for (const member of members) {
    const userId = Number(member.user_id);
    const key = teamSize === 1 ? `u${userId}` : `t${member.team_no}`;
    if (!entries.has(key)) entries.set(key, { key, team_no: teamSize === 1 ? null : member.team_no, user_ids: [], ...emptyLine() });
    const entry = entries.get(key);
    const line = players.get(userId);
    entry.user_ids.push(userId);
    for (const field of Object.keys(line)) entry[field] += line[field];
  }

  const ordered = [...entries.values()].sort((a, b) => compareEntries(a, b) || a.user_ids[0] - b.user_ids[0]);
  let rank = 0;
  ordered.forEach((entry, index) => {
    if (index === 0 || compareEntries(ordered[index - 1], entry) !== 0) rank = index + 1;
    entry.rank = rank;
    entry.matches_target = goal * entry.user_ids.length;
  });
  return { entries: ordered, players };
}

/** Todos han jugado sus partidos, o ha pasado la fecha límite más el margen para cerrar actas. */
export function isLeagueComplete({ standings, closingPassed }) {
  return Boolean(closingPassed) || (standings.entries.length > 0
    && standings.entries.every((entry) => entry.matches >= entry.matches_target));
}

/**
 * Quién ha perdido puestos desde el último aviso y frente a quién: el equipo que
 * ahora va justo por delante y antes iba por detrás. previousRanks: Map usuario → puesto.
 */
export function findOvertaken({ standings, previousRanks }) {
  const results = [];
  const { entries } = standings;
  const previousOf = (entry) => previousRanks.get(entry.user_ids[0]);
  entries.forEach((entry, index) => {
    const previous = previousOf(entry);
    if (!previous || entry.rank <= previous) return;
    const overtaker = entries.slice(0, index).reverse()
      .find((other) => other.rank < entry.rank && previousOf(other) > previous);
    if (overtaker) results.push({ entry, overtaker });
  });
  return results;
}
