// Reglas puras de los avisos de retención (repetir partido, alerta de hueco,
// reactivación y saldo parado). Sin base de datos para poder probarlas;
// retentionService.js las aplica.

const MADRID = 'Europe/Madrid';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const WEEKDAY_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Dos partidos son "el mismo" si caen el mismo día de la semana y a menos
// de una hora de diferencia: así un 21:00 y un 21:30 cuentan como tu hueco.
export const SLOT_TOLERANCE_MINUTES = 60;
// Ningún jugador recibe más de un aviso de retención en este tiempo.
export const RETENTION_COOLDOWN_HOURS = 48;
export const REACTIVATION_STAGES = [14, 21, 30];
// Margen para mandar cada etapa: si el día 14 no había partido que proponer,
// se reintenta hasta el 16 antes de darla por perdida.
export const REACTIVATION_WINDOW_DAYS = 3;
export const IDLE_BALANCE_DAYS = 21;
export const RETENTION_TYPES = ['slot_alert', 'reactivation', 'idle_balance'];

/** Día de la semana (0 = lunes) y minuto del día en hora de Madrid. */
export function madridSlot(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: MADRID, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return { weekday: WEEKDAY_INDEX[parts.weekday], minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function isSameSlot(a, b, toleranceMinutes = SLOT_TOLERANCE_MINUTES) {
  const slotA = madridSlot(a);
  const slotB = madridSlot(b);
  if (!slotA || !slotB) return false;
  return slotA.weekday === slotB.weekday && Math.abs(slotA.minutes - slotB.minutes) <= toleranceMinutes;
}

/** El hueco que más repite un jugador (día + hora en punto), o null. */
export function favoriteSlot(startsAtList = []) {
  const counts = new Map();
  let best = null;
  for (const value of startsAtList) {
    const slot = madridSlot(value);
    if (!slot) continue;
    const key = `${slot.weekday}:${Math.floor(slot.minutes / 60)}`;
    const entry = counts.get(key) || { count: 0, sample: value };
    entry.count += 1;
    // Ante empate gana el más reciente: los hábitos cambian.
    if (new Date(value) > new Date(entry.sample)) entry.sample = value;
    counts.set(key, entry);
    if (!best || entry.count > best.count || (entry.count === best.count && new Date(entry.sample) > new Date(best.sample))) {
      best = entry;
    }
  }
  return best ? best.sample : null;
}

export function daysSince(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((new Date(now).getTime() - date.getTime()) / DAY_MS);
}

/** Etapa de reactivación (14, 21 o 30 días sin jugar) que toca hoy, o null. */
export function reactivationStage(daysWithoutPlaying) {
  if (!Number.isFinite(daysWithoutPlaying)) return null;
  return REACTIVATION_STAGES.find(
    (stage) => daysWithoutPlaying >= stage && daysWithoutPlaying < stage + REACTIVATION_WINDOW_DAYS
  ) ?? null;
}

/** Los avisos de marketing solo salen de 10:00 a 21:59, hora de Madrid. */
export function isSendingHour(now = new Date()) {
  const slot = madridSlot(now);
  return Boolean(slot) && slot.minutes >= 10 * 60 && slot.minutes < 22 * 60;
}

function madridDayKey(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MADRID, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}

/** "hoy a las 21:00", "mañana a las 20:30" o "el jueves a las 21:00". */
export function formatMatchWhen(startsAt, now = new Date()) {
  const date = new Date(startsAt);
  const hour = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: MADRID });
  const day = madridDayKey(date);
  if (day === madridDayKey(now)) return `hoy a las ${hour}`;
  if (day === madridDayKey(new Date(now).getTime() + DAY_MS)) return `mañana a las ${hour}`;
  return `el ${WEEKDAYS[madridSlot(date).weekday]} a las ${hour}`;
}

function spotsLabel(spotsLeft) {
  const spots = Number(spotsLeft);
  if (!Number.isFinite(spots) || spots <= 0) return '';
  return spots === 1 ? 'Queda 1 plaza.' : `Quedan ${spots} plazas.`;
}

function placeLabel(match) {
  return match.field_name ? ` en ${match.field_name}` : '';
}

/** Frase corta para el aviso del resultado: "¿Repites el jueves? Quedan 5 plazas". */
export function buildRepeatSuffix(match, now = new Date()) {
  const when = formatMatchWhen(match.starts_at, now).replace(/ a las .*/, '');
  return `¿Repites ${when}? ${spotsLabel(match.spots_left)}`.trim();
}

export function buildSlotAlertMessage(match, now = new Date()) {
  return {
    title: 'Ya está abierto tu partido',
    body: `Hay partido ${formatMatchWhen(match.starts_at, now)}${placeLabel(match)}, tu hueco de siempre. ${spotsLabel(match.spots_left)}`.trim(),
  };
}

const REACTIVATION_COPY = {
  14: { title: '¿Te vienes esta semana?', lead: 'Hace un par de semanas que no juegas.' },
  21: { title: 'Te guardamos sitio', lead: 'Tu equipo te echa de menos.' },
  30: { title: 'Vuelve al campo', lead: 'Hace un mes que no te vemos por aquí.' },
};

export function buildReactivationMessage(stage, match, { balance = 0, now = new Date() } = {}) {
  const copy = REACTIVATION_COPY[stage] || REACTIVATION_COPY[14];
  const balanceNote = balance > 0 ? ` Tienes ${balance} EasyPass esperando.` : '';
  return {
    title: copy.title,
    body: `${copy.lead} Hay partido ${formatMatchWhen(match.starts_at, now)}${placeLabel(match)}. ${spotsLabel(match.spots_left)}${balanceNote}`.replace(/\s+/g, ' ').trim(),
  };
}

export function buildFriendJoinedMessage(friendName, match, now = new Date()) {
  const name = String(friendName || 'Un amigo').split(' ')[0];
  return {
    title: `${name} se ha apuntado`,
    body: `Juega ${formatMatchWhen(match.starts_at, now)}${placeLabel(match)}. ${spotsLabel(match.spots_left)} ¿Te vienes?`.replace(/\s+/g, ' ').trim(),
  };
}

export function buildIdleBalanceMessage(balance, match, now = new Date()) {
  const amount = balance === 1 ? '1 EasyPass' : `${balance} EasyPass`;
  const next = match ? ` El próximo partido es ${formatMatchWhen(match.starts_at, now)}${placeLabel(match)}.` : '';
  return {
    title: `Tienes ${amount} sin usar`,
    body: `Tu saldo sigue ahí, listo para jugar.${next}`,
  };
}
