function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Hora del reloj en formato 21:37, o null si no hay fecha válida. */
export function formatClockTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Hora real y minuto (21:37 · 37'); los eventos antiguos solo tienen el minuto puesto a mano. */
export function eventTimeLabel(event) {
  const minute = `${event?.minute ?? 0}'`;
  const time = formatClockTime(event?.occurred_at);
  return time ? `${time} · ${minute}` : minute;
}

/** Minuto del partido según su hora de inicio; null si no se conoce el inicio. */
export function minuteSinceStart(occurredAt, startsAt) {
  const start = new Date(startsAt).getTime();
  const occurred = new Date(occurredAt).getTime();
  if (!startsAt || Number.isNaN(start) || Number.isNaN(occurred)) return null;
  return Math.min(200, Math.max(0, Math.floor((occurred - start) / 60000)));
}

/** Misma fecha que `base` con la hora escrita a mano (21:37); null si no es válida. */
export function withClockTime(base, text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date(base);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(hours, minutes, 0, 0);
  return date;
}
