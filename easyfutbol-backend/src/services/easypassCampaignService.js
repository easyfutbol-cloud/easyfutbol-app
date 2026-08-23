const ASTURIAS_SLUG = 'asturias';
const DEFAULT_START_DATE = '2026-08-23';
const DEFAULT_DISCOUNT_PERCENT = 10;

function madridDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getAsturiasPackCampaign(pack, date = new Date(), env = process.env) {
  const startDate = String(env.ASTURIAS_DISCOUNT_START_DATE || DEFAULT_START_DATE).trim();
  const percent = Number(env.ASTURIAS_DISCOUNT_PERCENT || DEFAULT_DISCOUNT_PERCENT);
  const isAsturias = String(pack?.locationSlug || pack?.location_slug || '').toLowerCase() === ASTURIAS_SLUG;
  const isStarted = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && madridDate(date) >= startDate;
  const isValidPercent = Number.isFinite(percent) && percent > 0 && percent < 100;

  return {
    active: isAsturias && isStarted && isValidPercent,
    percent: isValidPercent ? percent : 0,
    startDate,
  };
}
