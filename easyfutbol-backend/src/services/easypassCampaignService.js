const PROMOTION_LOCATION_SLUG = 'valladolid';
const DEFAULT_START_DATE = '2026-09-04';
const DEFAULT_DISCOUNT_PERCENT = 10;

function madridDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getValladolidPackCampaign(pack, date = new Date(), env = process.env) {
  const startDate = String(env.EASYPASS_PROMOTION_START_DATE || DEFAULT_START_DATE).trim();
  const percent = Number(env.EASYPASS_PROMOTION_PERCENT || DEFAULT_DISCOUNT_PERCENT);
  const isPromotionLocation = String(pack?.locationSlug || pack?.location_slug || '').toLowerCase() === PROMOTION_LOCATION_SLUG;
  const isStarted = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && madridDate(date) >= startDate;
  const isValidPercent = Number.isFinite(percent) && percent > 0 && percent < 100;

  return {
    active: isPromotionLocation && isStarted && isValidPercent,
    percent: isValidPercent ? percent : 0,
    startDate,
  };
}

const DEFAULT_FIRST_PACK_PERCENT = 50;

// 50% en el primer pack de 1 EasyPass, una vez por usuario. No se acumula con
// Plus: si aplica, sustituye a su descuento.
export function getFirstPackDiscount(pack, { alreadyUsed = false } = {}, date = new Date(), env = process.env) {
  const enabled = !['0', 'false', 'off'].includes(String(env.FIRST_PACK_DISCOUNT_ENABLED ?? 'true').trim().toLowerCase());
  const percent = Number(env.FIRST_PACK_DISCOUNT_PERCENT || DEFAULT_FIRST_PACK_PERCENT);
  const endDate = String(env.FIRST_PACK_DISCOUNT_END_DATE || '').trim();
  const isValidPercent = Number.isFinite(percent) && percent > 0 && percent < 100;
  const notEnded = !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || madridDate(date) <= endDate;
  const isSinglePack = Number(pack?.easyPassAmount ?? pack?.credits) === 1;

  return {
    active: enabled && isValidPercent && notEnded && isSinglePack && !alreadyUsed,
    percent: isValidPercent ? percent : 0,
  };
}

export function getPackPricing(pack, { subscriptionPercent = 0, firstPackDiscountUsed = false } = {}, date = new Date(), env = process.env) {
  const originalPriceCents = Number(pack?.price_cents || 0);
  const regularPriceCents = subscriptionPercent
    ? Math.round(originalPriceCents * (1 - subscriptionPercent / 100))
    : originalPriceCents;
  const firstPack = getFirstPackDiscount(pack, { alreadyUsed: firstPackDiscountUsed }, date, env);
  const firstPackPriceCents = Math.round(originalPriceCents * (1 - firstPack.percent / 100));
  // Nunca dejamos que el "descuento" encarezca el pack respecto al precio Plus.
  const firstPackApplies = firstPack.active && firstPackPriceCents < regularPriceCents;

  return {
    originalPriceCents,
    regularPriceCents,
    priceCents: firstPackApplies ? firstPackPriceCents : regularPriceCents,
    firstPackDiscountApplied: firstPackApplies,
    firstPackDiscountPercent: firstPackApplies ? firstPack.percent : 0,
    subscriptionDiscountApplied: !firstPackApplies && subscriptionPercent > 0,
  };
}
