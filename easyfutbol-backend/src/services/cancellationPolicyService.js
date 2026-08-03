export const STANDARD_CANCELLATION_HOURS = 8;
export const SUBSCRIBER_CANCELLATION_HOURS = 4;

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

export function getCancellationPolicy(startsAt, subscriberEligible = false, now = new Date()) {
  const hoursRemaining = hoursUntilMatch(startsAt, now);
  const freeCancellationHours = subscriberEligible
    ? SUBSCRIBER_CANCELLATION_HOURS
    : STANDARD_CANCELLATION_HOURS;

  return {
    hoursRemaining,
    freeCancellationHours,
    refundable: Number.isFinite(hoursRemaining) && hoursRemaining > freeCancellationHours,
    earnsSubscriberWarning:
      subscriberEligible && Number.isFinite(hoursRemaining) && hoursRemaining <= freeCancellationHours,
  };
}

