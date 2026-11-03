export const WAITLIST_OFFER_MINUTES = 30;
// A partir de aquí nadie entra sin enterarse: se devuelve lo retenido.
export const WAITLIST_AUTO_ENTRY_CUTOFF_HOURS = 2;
// Los Plus reciben la invitación al partido extra antes que el resto.
export const EXTRA_MATCH_PLUS_HEADSTART_MINUTES = 30;

export function getWaitlistOffersToCreate({ capacity, spotsTaken, activeOffers }) {
  const normalizedCapacity = Math.max(Number(capacity) || 0, 0);
  const normalizedSpotsTaken = Math.max(Number(spotsTaken) || 0, 0);
  const normalizedActiveOffers = Math.max(Number(activeOffers) || 0, 0);
  const freeSpots = Math.max(normalizedCapacity - normalizedSpotsTaken, 0);
  return Math.max(freeSpots - normalizedActiveOffers, 0);
}

export function isPastWaitlistCutoff(startsAt, now = new Date()) {
  const startsAtMs = new Date(startsAt).getTime();
  if (!Number.isFinite(startsAtMs)) return true;
  return startsAtMs - new Date(now).getTime() <= WAITLIST_AUTO_ENTRY_CUTOFF_HOURS * 36e5;
}

// Respeta la camiseta preferida si cabe; si no, la que tenga hueco. null = sin hueco.
export function chooseWaitlistTicketColor({ preferred, whiteRemaining, blackRemaining }) {
  const remaining = { white: Number(whiteRemaining) || 0, black: Number(blackRemaining) || 0 };
  if (preferred && remaining[preferred] > 0) return preferred;
  if (remaining.white <= 0 && remaining.black <= 0) return null;
  return remaining.white >= remaining.black ? 'white' : 'black';
}

// Primero el saldo de la sede y luego el universal, como al reservar normalmente.
export function splitEasyPassCharge({ locationBalance, globalBalance, locatedBalance, amount }) {
  const location = Math.max(Number(locationBalance) || 0, 0);
  const universal = Math.max((Number(globalBalance) || 0) - (Number(locatedBalance) || 0), 0);
  const available = location + universal;
  return {
    available,
    enough: available >= amount,
    fromLocation: Math.min(location, amount),
  };
}
