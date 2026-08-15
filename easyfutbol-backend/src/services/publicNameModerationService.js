const EXACT_BLOCKED_TOKENS = new Set([
  'puta', 'puto', 'putas', 'putos',
  'cabron', 'cabrona', 'cabrones',
  'gilipollas', 'gilipolla',
  'maricon', 'maricona', 'maricones',
  'subnormal', 'retrasado', 'retrasada',
  'mierda', 'polla', 'pollas', 'coño',
  'zorra', 'zorras', 'prostituta',
  'nigger', 'faggot', 'retard',
  'nazis', 'violador', 'violadora',
  'porno', 'pornografia', 'follar', 'follador', 'folladora',

  // Inglés
  'pussy', 'dick', 'cock', 'cunt', 'asshole',
  'bitch', 'slut', 'whore', 'fuck', 'fucker', 'motherfucker',
  'blowjob', 'handjob', 'tits', 'boobs', 'rape', 'rapist',

  // Francés
  'pute', 'putain', 'salope', 'connard', 'connasse',
  'encule', 'enculee', 'batard',

  // Italiano
  'puttana', 'stronzo', 'stronza', 'coglione', 'coglioni',
  'cazzo', 'troia', 'merda',

  // Portugués
  'caralho', 'buceta', 'vadia', 'viado', 'porra',

  // Alemán
  'hure', 'fotze', 'wichser', 'arschloch', 'scheisse', 'schlampe',
]);

// Expresiones compuestas de alta confianza. Se comprueban sin espacios para
// detectar intentos como "h.i.j.o..." sin bloquear coincidencias accidentales
// dentro de nombres normales.
const BLOCKED_COMPOUNDS = [
  /^(?:soy|el|la|un|una)?hij(?:o|a)deput[ao]s?\d*$/,
  /^(?:soy|el|la|un|una)?(?:come|chupa)(?:mierda|pollas?)\d*$/,
  /^(?:soy|el|la|un|una)?gilipollas?\d*$/,
  /^(?:soy|el|la|un|una)?(?:put[ao]s?|cabron(?:a|es)?|maricon(?:a|es)?)\d*$/,
  /^(?:soy|el|la|un|una)?(?:nigger|faggot|retard|nazis?)\d*$/,
  /^(?:soy|el|la|un|una)?(?:violador(?:a)?|pornografia|porno)\d*$/,
  /^(?:the|my|big|little|tight|wet|hot)?(?:pussy|dick|cock|cunt|tits|boobs)\d*$/,
  /^(?:i?love)?(?:pussy|dick|cock|cunt|fuck(?:er)?|porn)\d*$/,
  /^(?:motherfucker|blowjob|handjob|asshole|rapist)\d*$/,
  /^(?:pute|putain|salope|connard|connasse|enculee?|batard)\d*$/,
  /^(?:puttana|stronz[oa]|coglion[ei]|cazzo|troia)\d*$/,
  /^(?:caralho|buceta|vadia|viado|porra)\d*$/,
  /^(?:hure|fotze|wichser|arschloch|scheisse|schlampe)\d*$/,
];

const LEET_REPLACEMENTS = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  '$': 's',
};

const CONFUSABLE_REPLACEMENTS = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i',
  'α': 'a', 'ε': 'e', 'ο': 'o', 'ρ': 'p', 'υ': 'y', 'χ': 'x', 'ι': 'i',
};

export function normalizePublicNameForModeration(value) {
  return String(value || '')
    .replace(/ñ/g, '\u0000')
    .replace(/Ñ/g, '\u0000')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u0000/g, 'ñ')
    .replace(/[аеорсухіαεορυχι]/g, (character) => CONFUSABLE_REPLACEMENTS[character] || character)
    .replace(/[0134578@$]/g, (character) => LEET_REPLACEMENTS[character] || character)
    .replace(/(.)\1{2,}/g, '$1$1');
}

export function validatePublicName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) {
    return { ok: false, code: 'INVALID_PUBLIC_NAME', msg: 'El nombre debe tener entre 2 y 40 caracteres' };
  }

  const normalized = normalizePublicNameForModeration(name);
  const tokens = normalized.split(/[^a-z0-9ñ]+/).filter(Boolean);
  const compact = tokens.join('');
  const blocked = tokens.some((token) => EXACT_BLOCKED_TOKENS.has(token))
    || BLOCKED_COMPOUNDS.some((pattern) => pattern.test(compact));

  if (blocked) {
    return {
      ok: false,
      code: 'OFFENSIVE_PUBLIC_NAME',
      msg: 'Ese nombre no está permitido. Elige uno respetuoso para la comunidad',
    };
  }

  return { ok: true, name };
}
