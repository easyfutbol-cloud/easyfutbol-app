// Debe coincidir con easyfutbol-backend/src/services/cancellationPolicyService.js
const MADRID_TIME_ZONE = 'Europe/Madrid';
const MORNING_MATCH_CUTOFF_HOUR = 13;
const MORNING_MATCH_DEADLINE_HOUR = 16;

function madridParts(date) {
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
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])
  );
}

function madridWallTimeToMs(year, month, day, hour) {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour);
  let instant = wallAsUtc;
  for (let i = 0; i < 2; i += 1) {
    const p = madridParts(new Date(instant));
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant;
    instant = wallAsUtc - offset;
  }
  return instant;
}

export function getCancellationPolicy(startsAt, isPlus = false, now = Date.now()) {
  const startsAtMs = new Date(startsAt).getTime();
  const deadlineHours = isPlus ? 4 : 8;
  if (!Number.isFinite(startsAtMs)) {
    return { refundEligible: false, morningMatch: false, deadlineHours };
  }

  let deadlineMs = startsAtMs - deadlineHours * 36e5;
  const start = madridParts(new Date(startsAtMs));
  const morningMatch = start.hour < MORNING_MATCH_CUTOFF_HOUR;
  if (morningMatch) {
    deadlineMs = Math.min(
      deadlineMs,
      madridWallTimeToMs(start.year, start.month, start.day - 1, MORNING_MATCH_DEADLINE_HOUR)
    );
  }

  return { refundEligible: now < deadlineMs, morningMatch, deadlineHours };
}

export function cancellationPolicyMessage(policy, lateSuffix = '') {
  const { refundEligible, morningMatch, deadlineHours } = policy;
  if (morningMatch) {
    return refundEligible
      ? 'Como cancelas antes de las 16:00 del día anterior, se devolverá el EasyPass utilizado.'
      : `En partidos antes de las 13:00, la devolución solo es posible hasta las 16:00 del día anterior.${lateSuffix}`;
  }
  return refundEligible
    ? `Como quedan más de ${deadlineHours} horas, se devolverá el EasyPass utilizado.`
    : `Quedan ${deadlineHours} horas o menos.${lateSuffix}`;
}
