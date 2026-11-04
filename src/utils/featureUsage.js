import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

// Pantalla → apartado del panel "Uso de funciones" del admin.
const FEATURE_BY_ROUTE = {
  Social: 'social',
  SocialPrivacy: 'social',
  FriendGroupDetail: 'social',
  FriendQr: 'social',
  FriendLeagueDetail: 'friend_leagues',
  FriendLeagueEdit: 'friend_leagues',
  PlayerSocialProfile: 'player_profiles',
  MyPublicProfile: 'my_profile',
  WeeklyLineupVote: 'weekly_lineup',
  WeeklyLineupResult: 'weekly_lineup',
  Challenges: 'challenges',
  EasyPointsShop: 'easypoints_shop',
  MySeason: 'my_season',
  PostMatchSummary: 'post_match',
  Stats: 'rankings',
  Achievements: 'achievements',
  HomeTournament: 'tournaments',
  TournamentDetail: 'tournaments',
  TournamentRules: 'tournaments',
  Notifications: 'notifications',
};

const sent = new Set();

// Una vez por apartado, día y sesión. Nunca molesta al jugador: si falla, se
// reintenta la próxima vez que abra el apartado.
export async function trackFeature(feature) {
  try {
    const token = await AsyncStorage.getItem('token');
    if (!token) return;
    const key = `${new Date().toDateString()}|${feature}|${token.slice(-12)}`;
    if (sent.has(key)) return;
    sent.add(key);
    await api.post('/me/feature-usage', { feature }).catch(() => sent.delete(key));
  } catch {}
}

export function trackRoute(routeName) {
  trackFeature('app');
  const feature = FEATURE_BY_ROUTE[routeName];
  if (feature) trackFeature(feature);
}
