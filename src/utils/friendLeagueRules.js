// Textos, plantillas y reparto de equipos de las ligas entre amigos. Los puntos
// se calculan en el backend (friendLeagueRules.js); aquí solo se configuran.
export const RULE_FIELDS = [
  { key: 'win', label: 'Victoria', icon: 'trophy-outline' },
  { key: 'draw', label: 'Empate', icon: 'remove-outline' },
  { key: 'loss', label: 'Derrota', icon: 'close-outline' },
  { key: 'goal', label: 'Gol', icon: 'football-outline' },
  { key: 'assist', label: 'Asistencia', icon: 'swap-horizontal-outline' },
  { key: 'save', label: 'Parada', icon: 'hand-left-outline' },
  { key: 'mvp', label: 'MVP', icon: 'star-outline' },
];

export const MAX_LEAGUE_MEMBERS = 20;
export const ADMIN_DEFAULT_LEAGUE_MEMBERS = 100;
export const ADMIN_MIN_LEAGUE_MEMBERS = 2;
export const ADMIN_MAX_LEAGUE_MEMBERS = 500;
export const ADMIN_MEMBERS_OPTIONS = [20, 50, 100, 200, 500];
export const ADMIN_MEMBERS_STEP = 10;
export const POINTS_MIN = -10;
export const POINTS_MAX = 20;
export const MATCHES_MIN = 3;
export const MATCHES_MAX = 50;
export const MATCHES_OPTIONS = [5, 10, 15, 20];
export const DURATION_OPTIONS = [15, 30, 60, 90];
export const FORMATS = [
  { size: 1, label: 'Solo', icon: 'person-outline' },
  { size: 2, label: 'Parejas', icon: 'people-outline' },
  { size: 3, label: 'Tríos', icon: 'people-circle-outline' },
];

export const LEAGUE_PRESETS = [
  { key: 'classic', label: 'Clásica', hint: 'Cuenta todo', values: { win: 3, draw: 1, loss: 0, goal: 1, assist: 1, save: 1, mvp: 2 } },
  { key: 'scorers', label: 'Goleadores', hint: 'Manda el gol', values: { win: 1, draw: 0, loss: 0, goal: 3, assist: 2, save: 0, mvp: 2 } },
  { key: 'results', label: 'Solo resultados', hint: 'Lo importante es ganar', values: { win: 3, draw: 1, loss: 0, goal: 0, assist: 0, save: 0, mvp: 0 } },
];

export const DEFAULT_LEAGUE_RULES = { ...LEAGUE_PRESETS[0].values, double_vs_rivals: true };

/** Plantilla que coincide con estas reglas, o null si están personalizadas. */
export function presetKeyFor(rules) {
  const preset = LEAGUE_PRESETS.find(({ values }) => Object.keys(values).every((key) => values[key] === rules[key]));
  return preset?.key || null;
}

// Mismo criterio que el resto de la app para saber si la sesión es de administrador.
export const isAdminUser = (user) => user?.role === 'admin' || user?.role === 'ADMIN' || user?.is_admin === true || user?.is_admin === 1 || user?.is_admin === '1';

export const formatLabel = (teamSize) => FORMATS.find(({ size }) => size === Number(teamSize))?.label || 'Solo';

export const playerShortName = (player) => player?.nickname || String(player?.name || 'Jugador').split(' ')[0];

/** "Ana y Beto", o el nombre del jugador en una liga individual. */
export const entryName = (entry) => entry.players.map(playerShortName).join(' y ');

/** Equipos vacíos justos para los aceptados, conservando lo ya repartido. */
export function syncTeams(teams, acceptedIds, teamSize) {
  const accepted = new Set(acceptedIds);
  const count = Math.ceil(acceptedIds.length / teamSize);
  const kept = (teams || []).map((team) => team.filter((id) => accepted.has(id)));
  const placed = new Set(kept.flat());
  const next = Array.from({ length: count }, (_, index) => kept[index] || []);
  // Los equipos que sobran devuelven a sus jugadores a "sin equipo".
  kept.slice(count).flat().forEach((id) => placed.delete(id));
  return { teams: next, unassigned: acceptedIds.filter((id) => !placed.has(id)) };
}

/** Saca al jugador de su equipo, o lo mete en el primero con hueco. */
export function toggleTeamMember(teams, userId, teamSize) {
  if (teams.some((team) => team.includes(userId))) {
    return teams.map((team) => team.filter((id) => id !== userId));
  }
  const slot = teams.findIndex((team) => team.length < teamSize);
  return slot < 0 ? teams : teams.map((team, index) => (index === slot ? [...team, userId] : team));
}

/** Reparto al azar en equipos del tamaño de la liga. random es inyectable para probarlo. */
export function shuffleTeams(acceptedIds, teamSize, random = Math.random) {
  const pool = [...acceptedIds];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const teams = [];
  for (let i = 0; i < pool.length; i += teamSize) teams.push(pool.slice(i, i + teamSize));
  return teams;
}

export const teamsAreComplete = (teams, teamSize) => teams.length >= 2 && teams.every((team) => team.length === teamSize);

const pointsLabel = (points) => `${points} ${Math.abs(points) === 1 ? 'punto' : 'puntos'}`;

/** Frase con tu distancia al líder (o al segundo si vas primero). */
export function leaderGapText(myEntry, standings) {
  if (!myEntry || !standings.length) return '';
  if (!standings.some((entry) => entry.matches > 0)) return 'Todavía no se ha jugado ningún partido';
  if (myEntry.rank > 1) return `A ${pointsLabel(standings[0].points - myEntry.points)} del líder`;
  const rival = standings.find((entry) => entry !== myEntry);
  if (!rival || rival.points === myEntry.points) return 'Empatado en cabeza';
  return `${pointsLabel(myEntry.points - rival.points)} de ventaja`;
}

/** Ejemplo para entender las reglas: ganar con 2 goles y 1 asistencia. */
export function exampleMatchText(rules) {
  const base = 2 * rules.goal + rules.assist;
  const normal = rules.win + base;
  if (!rules.double_vs_rivals || !rules.win) return `Ganar con 2 goles y 1 asistencia: ${pointsLabel(normal)}.`;
  return `Ganar con 2 goles y 1 asistencia: ${pointsLabel(normal)}, o ${normal + rules.win} si es contra un rival de la liga.`;
}
