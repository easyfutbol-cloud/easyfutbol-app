export const ASTURIAS_REGION = 'Asturias';

const BASE_REGIONS = ['Valladolid', ASTURIAS_REGION];
const BASE_ASTURIAS_CITIES = ['Avilés', 'Oviedo'];
const CANONICAL_CITIES = {
  aviles: 'Avilés',
  oviedo: 'Oviedo',
  gijon: 'Gijón',
  asturias: ASTURIAS_REGION,
};
const ASTURIAS_KEYS = Object.keys(CANONICAL_CITIES);

function normalizeCity(city) {
  return String(city || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Unifica variantes como "Aviles" y "Avilés" para que no aparezcan como dos sedes
export function canonicalCity(city) {
  return CANONICAL_CITIES[normalizeCity(city)] || String(city || '').trim();
}

export function isAsturiasCity(city) {
  return ASTURIAS_KEYS.includes(normalizeCity(city));
}

function isAsturiasMatch(match) {
  return match?.location_slug === 'asturias' || isAsturiasCity(match?.city);
}

// Primer nivel del selector (Valladolid, Asturias...) y ciudades del switcher de Asturias
export function buildCityOptions(matches, selectedCity = '') {
  const regions = new Set(BASE_REGIONS);
  const asturiasCities = new Set(BASE_ASTURIAS_CITIES);

  matches.forEach((match) => {
    const city = canonicalCity(match.city);
    if (!city) return;
    if (isAsturiasMatch(match)) asturiasCities.add(city);
    else regions.add(city);
  });
  if (isAsturiasCity(selectedCity)) asturiasCities.add(canonicalCity(selectedCity));

  return {
    regions: Array.from(regions).sort((a, b) => {
      if (a === 'Valladolid') return -1;
      if (b === 'Valladolid') return 1;
      return a.localeCompare(b, 'es');
    }),
    asturiasCities: Array.from(asturiasCities).sort((a, b) => a.localeCompare(b, 'es')),
  };
}

// Al entrar en Asturias abrimos la primera ciudad que tenga partidos
export function pickAsturiasCity(asturiasCities, matches) {
  const withMatches = asturiasCities.find((city) =>
    matches.some((match) => canonicalCity(match.city) === city)
  );
  return withMatches || asturiasCities[0];
}
