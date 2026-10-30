// Colores y etiquetas del perfil social v3. Las claves de color y de sección
// son las mismas que valida el backend (playerCardService.js).

export const PROFILE_ACCENTS = {
  orange: { label: 'Naranja', color: '#ff5a00', banner: ['#ff6a17', '#7a2a00', '#1a0d05'] },
  red: { label: 'Rojo', color: '#e5383b', banner: ['#e5383b', '#6b0f12', '#170506'] },
  gold: { label: 'Oro', color: '#f4c95d', banner: ['#f4c95d', '#7a5a12', '#1a1405'] },
  green: { label: 'Verde', color: '#2fbf71', banner: ['#2fbf71', '#0f5a33', '#05170d'] },
  sky: { label: 'Celeste', color: '#4cc9f0', banner: ['#4cc9f0', '#145a70', '#051419'] },
  blue: { label: 'Azul', color: '#4361ee', banner: ['#4361ee', '#1a2a7a', '#060a1c'] },
  purple: { label: 'Morado', color: '#9d4edd', banner: ['#9d4edd', '#46186b', '#12061c'] },
  pink: { label: 'Rosa', color: '#f15bb5', banner: ['#f15bb5', '#6e1550', '#1a0613'] },
};
export const DEFAULT_ACCENT = 'orange';
export const accentFor = (key) => PROFILE_ACCENTS[key] || PROFILE_ACCENTS[DEFAULT_ACCENT];

/** Color con transparencia a partir de un #rrggbb. */
export function withAlpha(hex, alpha) {
  const value = String(hex).replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

export const PROFILE_SECTIONS = {
  card: { label: 'Carta de jugador', icon: 'id-card-outline', hint: 'Tu media y atributos, calculados de tus partidos' },
  evolution: { label: 'Evolución', icon: 'bar-chart-outline', hint: 'Partidos por mes de los últimos 6 meses' },
  form: { label: 'Forma reciente', icon: 'pulse-outline', hint: 'Resultado de tus últimos 5 partidos' },
  stats: { label: 'Más estadísticas', icon: 'stats-chart-outline', hint: 'Las que enseñas y no caben en la cabecera' },
  photos: { label: 'Fotos', icon: 'images-outline', hint: 'Tu galería de partidos' },
  showcase: { label: 'Vitrina', icon: 'trophy-outline', hint: 'Logros, El 8 de la semana y distintivos' },
  comments: { label: 'Comentarios', icon: 'chatbubble-ellipses-outline', hint: 'Lo que te escriben otros jugadores' },
};
export const SECTION_ORDER = Object.keys(PROFILE_SECTIONS);
export const DEFAULT_SECTIONS = ['form', 'stats', 'photos', 'showcase', 'comments'];

export const POSITION_LABELS = { goalkeeper: 'Portero', defender: 'Defensa', midfielder: 'Centrocampista', forward: 'Delantero' };
export const POSITION_SHORT = { goalkeeper: 'POR', defender: 'DEF', midfielder: 'MED', forward: 'DEL' };
export const FOOT_LABELS = { right: 'Diestro', left: 'Zurdo', both: 'Ambidiestro' };

export const CARD_TIERS = {
  bronze: { label: 'BRONCE', colors: ['#c98a55', '#7a4a26', '#3a2312'], text: '#fff4ea', line: 'rgba(255,240,225,.28)' },
  silver: { label: 'PLATA', colors: ['#e3e6ea', '#9aa1aa', '#4b5058'], text: '#15171a', line: 'rgba(20,22,26,.18)' },
  gold: { label: 'ORO', colors: ['#ffe08a', '#d4a52c', '#7a5a12'], text: '#1d1503', line: 'rgba(29,21,3,.18)' },
  elite: { label: 'ÉLITE', colors: ['#1b1b1f', '#3a1a5c', '#ff5a00'], text: '#ffffff', line: 'rgba(255,255,255,.22)' },
};

export const ATTRIBUTE_NAMES = { gol: 'Gol', asi: 'Asistencia', par: 'Paradas', vic: 'Victorias', mvp: 'MVP', exp: 'Experiencia' };
