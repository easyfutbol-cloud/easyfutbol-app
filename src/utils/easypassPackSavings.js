const amount = (pack) => Number(pack.easyPassAmount ?? pack.credits);
const price = (pack) => Number(pack.price_cents ?? pack.priceCents);
const location = (pack) => String(pack.location_id ?? pack.locationId ?? '');

// Compare prices available to this same customer, including any Plus discount.
// Promotion codes entered at checkout are deliberately not assumed here.
export function getPackSavings(pack, packs) {
  const credits = amount(pack);
  const total = price(pack);
  if (!Number.isInteger(credits) || credits <= 0 || !Number.isInteger(total) || total < 0) return null;

  const singles = packs.filter((candidate) => amount(candidate) === 1
    && location(candidate) === location(pack)
    && Number.isInteger(price(candidate)) && price(candidate) > 0);
  const separatePriceCents = singles.length ? Math.min(...singles.map(price)) * credits : null;
  return {
    unitPriceCents: total / credits,
    separatePriceCents,
    savingsCents: credits > 1 && separatePriceCents !== null
      ? Math.max(0, separatePriceCents - total) : 0,
  };
}
