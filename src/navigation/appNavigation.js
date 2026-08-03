export const PRIMARY_TABS = [
  { key: 'home', label: 'Inicio', route: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'matches', label: 'Partidos', route: 'Matchs', icon: 'football-outline', activeIcon: 'football' },
  { key: 'myMatches', label: 'Mis partidos', route: 'MisPartidos', icon: 'calendar-outline', activeIcon: 'calendar' },
  { key: 'competitive', label: 'Competitivo', route: 'Competitive', icon: 'trophy-outline', activeIcon: 'trophy' },
  { key: 'profile', label: 'Perfil', route: 'Profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
];

const ROUTE_TAB = {
  Home: 'home',
  HomeTournament: 'home',
  TournamentDetail: 'home',
  TournamentRules: 'home',
  Matchs: 'matches',
  Match: 'matches',
  MyMatches: 'myMatches',
  MisPartidos: 'myMatches',
  Competitive: 'competitive',
  CompetitiveHistory: 'competitive',
  Profile: 'profile',
  Stats: 'profile',
  Achievements: 'profile',
  EasyPass: 'profile',
  Plus: 'profile',
  Faq: 'profile',
};

const ROUTES_WITHOUT_PRIMARY_NAV = new Set([
  'Access',
  'VerifyEmail',
  'PrivacyPolicy',
  'AdminPanel',
  'AdminDashboard',
  'AdminMatches',
  'AdminMatchEdit',
  'AdminCreateMatch',
  'AdminScheduledMatches',
  'AdminMatchStats',
  'AdminMatchStatsImport',
  'AdminCompetitiveMatches',
  'AdminCompetitiveEvaluation',
  'AdminCompetitiveSeasons',
  'AdminUsers',
  'AdminNotify',
  'AdminEasyPass',
]);

export function getActiveTab(routeName) {
  return ROUTE_TAB[routeName] || null;
}

export function shouldShowPrimaryNav(routeName) {
  return Boolean(routeName) && !ROUTES_WITHOUT_PRIMARY_NAV.has(routeName);
}
