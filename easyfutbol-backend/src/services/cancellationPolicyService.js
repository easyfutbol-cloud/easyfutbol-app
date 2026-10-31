import { madridWallTimeToUtc, partsInMadrid } from '../utils/madridDateTime.js';

export const STANDARD_CANCELLATION_HOURS = 8;
export const SUBSCRIBER_CANCELLATION_HOURS = 4;
// Partidos que empiezan antes de las 13:00 (hora de Madrid): la devolución
// solo se mantiene hasta las 16:00 del día anterior, para evitar bajas de madrugada.
export const MORNING_MATCH_CUTOFF_HOUR = 13;
export const MORNING_MATCH_DEADLINE_TIME = '16:00';

export function hoursUntilMatch(startsAt, now = new Date()) {
  const startsAtMs = new Date(startsAt).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(nowMs)) return Number.NaN;
  return (startsAtMs - nowMs) / 36e5;
}

export function hasMatchStarted(startsAt, now = new Date()) {
  const hours = hoursUntilMatch(startsAt, now);
  return !Number.isFinite(hours) || hours <= 0;
}

export function isMorningMatch(startsAt) {
  const parts = partsInMadrid(startsAt);
  return Boolean(parts) && Number(parts.hour) < MORNING_MATCH_CUTOFF_HOUR;
}

// Último instante (exclusivo) en el que la cancelación recupera el EasyPass.
export function getRefundDeadline(startsAt, subscriberEligible = false) {
  const startsAtMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startsAtMs)) return null;
  const freeCancellationHours = subscriberEligible
    ? SUBSCRIBER_CANCELLATION_HOURS
    : STANDARD_CANCELLATION_HOURS;
  const hoursDeadline = new Date(startsAtMs - freeCancellationHours * 36e5);

  if (!isMorningMatch(startsAt)) return hoursDeadline;

  const parts = partsInMadrid(startsAt);
  const previousDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - 1));
  const morningDeadline = madridWallTimeToUtc(
    previousDay.toISOString().slice(0, 10),
    MORNING_MATCH_DEADLINE_TIME
  );
  if (!morningDeadline) return hoursDeadline;
  return morningDeadline < hoursDeadline ? morningDeadline : hoursDeadline;
}

export function getCancellationPolicy(startsAt, subscriberEligible = false, now = new Date()) {
  const hoursRemaining = hoursUntilMatch(startsAt, now);
  const freeCancellationHours = subscriberEligible
    ? SUBSCRIBER_CANCELLATION_HOURS
    : STANDARD_CANCELLATION_HOURS;
  const refundDeadline = getRefundDeadline(startsAt, subscriberEligible);
  const nowMs = new Date(now).getTime();
  const refundable = Boolean(refundDeadline) && Number.isFinite(nowMs) && nowMs < refundDeadline.getTime();

  return {
    hoursRemaining,
    freeCancellationHours,
    morningMatch: isMorningMatch(startsAt),
    refundDeadline,
    refundable,
    earnsSubscriberWarning: subscriberEligible && Number.isFinite(hoursRemaining) && !refundable,
  };
}
