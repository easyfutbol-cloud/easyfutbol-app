export const WAITLIST_OFFER_MINUTES = 30;

export function getWaitlistOffersToCreate({ capacity, spotsTaken, activeOffers }) {
  const normalizedCapacity = Math.max(Number(capacity) || 0, 0);
  const normalizedSpotsTaken = Math.max(Number(spotsTaken) || 0, 0);
  const normalizedActiveOffers = Math.max(Number(activeOffers) || 0, 0);
  const freeSpots = Math.max(normalizedCapacity - normalizedSpotsTaken, 0);
  return Math.max(freeSpots - normalizedActiveOffers, 0);
}

