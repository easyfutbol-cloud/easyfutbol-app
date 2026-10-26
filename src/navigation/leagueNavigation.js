export const LEAGUE_ROUTES = new Set([
  'LeagueHome',
  'LeagueCalendar',
  'LeagueStandings',
  'LeagueRankings',
  'LeagueAbout',
  'LeagueTeam',
  'LeagueTeamEdit',
  'LeagueTeamRequests',
  'LeaguePlayer',
  'LeaguePlayerEdit',
  'LeagueMatchDetail',
]);

export const LEAGUE_TABS = [
  { routeName: 'LeagueHome', label: 'Inicio', icon: 'home-outline', activeIcon: 'home', alwaysVisible: true },
  { routeName: 'LeagueCalendar', label: 'Calendario', icon: 'calendar-outline', activeIcon: 'calendar', children: ['LeagueMatchDetail'] },
  { routeName: 'LeagueStandings', label: 'Clasificación', icon: 'podium-outline', activeIcon: 'podium', children: ['LeagueTeam', 'LeagueTeamEdit', 'LeaguePlayer', 'LeaguePlayerEdit'] },
  { routeName: 'LeagueRankings', label: 'Estadísticas', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
  { routeName: 'LeagueAbout', label: 'La liga', icon: 'information-circle-outline', activeIcon: 'information-circle', alwaysVisible: true },
];

export const isLeagueRoute = (routeName) => LEAGUE_ROUTES.has(routeName);
