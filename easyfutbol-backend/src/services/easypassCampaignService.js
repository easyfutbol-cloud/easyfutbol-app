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
