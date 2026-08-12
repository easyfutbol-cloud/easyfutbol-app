export const LEAGUE_ROUTES = new Set([
  'LeagueHome',
  'LeagueCalendar',
  'LeagueStandings',
  'LeagueRankings',
  'LeagueMyTeam',
  'LeagueMatchDetail',
]);

export const LEAGUE_TABS = [
  { routeName: 'LeagueHome', label: 'Inicio', icon: 'home-outline', activeIcon: 'home' },
  { routeName: 'LeagueCalendar', label: 'Calendario', icon: 'calendar-outline', activeIcon: 'calendar' },
  { routeName: 'LeagueStandings', label: 'Clasificación', icon: 'podium-outline', activeIcon: 'podium' },
  { routeName: 'LeagueRankings', label: 'Rankings', icon: 'stats-chart-outline', activeIcon: 'stats-chart' },
  { routeName: 'LeagueMyTeam', label: 'Mi equipo', icon: 'shield-outline', activeIcon: 'shield' },
];

export const isLeagueRoute = (routeName) => LEAGUE_ROUTES.has(routeName);
