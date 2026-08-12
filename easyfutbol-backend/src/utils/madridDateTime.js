const MADRID_TIME_ZONE = 'Europe/Madrid';

const pad = (value) => String(value).padStart(2, '0');

function partsInMadrid(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: MADRID_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );
}

export function formatMadridAdminDateTime(value, durationMinutes = 0) {
  const start = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + Number(durationMinutes || 0) * 60_000);
  const startParts = partsInMadrid(start);
  const endParts = partsInMadrid(end);
  return {
    match_date: `${startParts.year}-${startParts.month}-${startParts.day}`,
    start_time: `${startParts.hour}:${startParts.minute}:${startParts.second}`,
    end_time: `${endParts.hour}:${endParts.minute}:${endParts.second}`,
  };
}

function madridOffsetMs(instant) {
  const parts = partsInMadrid(instant);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return representedAsUtc - instant.getTime();
}

export function madridWallTimeToUtc(dateValue, timeValue) {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = new Date(wallAsUtc);
  instant = new Date(wallAsUtc - madridOffsetMs(instant));
  instant = new Date(wallAsUtc - madridOffsetMs(instant));
  const verified = partsInMadrid(instant);
  if (
    `${verified.year}-${verified.month}-${verified.day}` !== date ||
    `${verified.hour}:${verified.minute}` !== `${pad(hour)}:${pad(minute)}`
  ) return null;
  return instant;
}

export function toMysqlUtc(value) {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}
