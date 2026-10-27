import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Pedimos la valoración de la tienda solo en un buen momento: al cerrar la
// tarjeta de un partido que ha ido bien, con algo de recorrido en la app y como
// mucho una vez cada 4 meses. iOS además limita el aviso a 3 veces al año.
const LAST_ASKED_KEY = 'storeReview:lastAskedAt';
const MIN_DAYS_BETWEEN = 120;
export const MIN_MATCHES_FOR_REVIEW = 3;

export function isGoodMatch(personal) {
  return personal?.result === 'win'
    || Number(personal?.goals || 0) > 0
    || Number(personal?.assists || 0) > 0
    || Boolean(Number(personal?.is_mvp || 0));
}

export async function maybeAskForReview({ personal, matchesPlayed }) {
  try {
    if (matchesPlayed < MIN_MATCHES_FOR_REVIEW || !isGoodMatch(personal)) return false;
    const lastAskedAt = Number(await AsyncStorage.getItem(LAST_ASKED_KEY)) || 0;
    if (Date.now() - lastAskedAt < MIN_DAYS_BETWEEN * 24 * 60 * 60 * 1000) return false;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return false;
    await AsyncStorage.setItem(LAST_ASKED_KEY, String(Date.now()));
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
