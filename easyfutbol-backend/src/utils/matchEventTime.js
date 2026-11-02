const MAX_EVENT_MINUTE = 200;

/** Convierte la hora enviada por el móvil o el reloj en Date; null si no es válida. */
export function parseOccurredAt(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Un reloj adelantado no puede dejar un evento en el futuro. */
export function capOccurredAt(date, now = new Date()) {
  return date.getTime() > now.getTime() ? new Date(now.getTime()) : date;
}

/** Minuto del partido según su hora de inicio, dentro del rango que admite la tabla. */
export function minuteFromOccurredAt(occurredAt, startsAt) {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 0;
  const minute = Math.floor((occurredAt.getTime() - start.getTime()) / 60_000);
  return Math.min(MAX_EVENT_MINUTE, Math.max(0, minute));
}
