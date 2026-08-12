export const leagueInfo = { name: 'EasyFutbol League', season: 'Temporada piloto', city: 'Valladolid' };
export const leagueNews = [
  { id: 1, tag: 'LIGA', title: 'Nace EasyFutbol League', text: 'Una competición regular para disfrutar, competir y seguir cada jornada desde la app.', date: 'Hoy' },
  { id: 2, tag: 'FORMATO', title: 'Así funcionará la temporada', text: 'Calendario, clasificación, estadísticas individuales y toda la información de tu equipo.', date: 'Próximamente' },
];
export const leagueMatches = [
  { id: 1, round: 1, date: 'Sáb 12 sep · 18:00', venue: 'Fútbol 7 Parquesol', home: 'Naranja Mecánica', away: 'Barrio FC', homeScore: null, awayScore: null },
  { id: 2, round: 1, date: 'Sáb 12 sep · 19:00', venue: 'Fútbol 7 Parquesol', home: 'Atlético Pucela', away: 'Los del Lunes', homeScore: null, awayScore: null },
  { id: 3, round: 2, date: 'Sáb 19 sep · 18:00', venue: 'Fútbol 7 Parquesol', home: 'Barrio FC', away: 'Atlético Pucela', homeScore: null, awayScore: null },
];
export const playedLeagueMatches = [
  {
    id: 101, round: 6, date: 'Sáb 22 ago · Finalizado', venue: 'Fútbol 7 Parquesol',
    home: 'Naranja Mecánica', away: 'Barrio FC', homeScore: 4, awayScore: 2,
    mvp: { name: 'Álex Martín', team: 'Naranja Mecánica', goals: 2, assists: 1 },
    lineups: {
      home: ['Roberto Merchán (POR)', 'Diego León', 'Mario Sanz', 'Pablo Cano', 'Álex Martín', 'Sergio Pérez', 'David Gil'],
      away: ['Javi Ruiz (POR)', 'Hugo Martín', 'Iván Nieto', 'Carlos Rey', 'Rubén Gil', 'Luis Sanz', 'Adrián Pérez'],
    },
    events: [
      { minute: 7, type: 'goal', team: 'home', player: 'Álex Martín', detail: 'Gol' },
      { minute: 14, type: 'goal', team: 'away', player: 'Rubén Gil', detail: 'Gol' },
      { minute: 23, type: 'yellow', team: 'away', player: 'Carlos Rey', detail: 'Tarjeta amarilla' },
      { minute: 31, type: 'goal', team: 'home', player: 'Sergio Pérez', detail: 'Gol · Asistencia de Álex Martín' },
      { minute: 39, type: 'goal', team: 'home', player: 'Álex Martín', detail: 'Gol' },
      { minute: 46, type: 'goal', team: 'away', player: 'Luis Sanz', detail: 'Gol' },
      { minute: 49, type: 'goal', team: 'home', player: 'Mario Sanz', detail: 'Gol' },
    ],
    report: {
      referee: 'Daniel Gómez', duration: '50 minutos', attendance: '68 espectadores',
      notes: 'Partido disputado con normalidad. Sin incidencias posteriores al encuentro.',
    },
  },
  {
    id: 102, round: 5, date: 'Sáb 15 ago · Finalizado', venue: 'Fútbol 7 Parquesol',
    home: 'Atlético Pucela', away: 'Naranja Mecánica', homeScore: 1, awayScore: 3,
    mvp: { name: 'Diego León', team: 'Naranja Mecánica', goals: 1, assists: 2 },
    lineups: { home: ['Marcos Gil (POR)', 'Leo Ruiz', 'Víctor Sanz', 'Raúl Cano', 'Óscar Rey', 'Jorge Nieto', 'Ángel Martín'], away: ['Roberto Merchán (POR)', 'Diego León', 'Mario Sanz', 'Pablo Cano', 'Álex Martín', 'Sergio Pérez', 'David Gil'] },
    events: [{ minute: 11, type: 'goal', team: 'away', player: 'Diego León', detail: 'Gol' }, { minute: 28, type: 'goal', team: 'home', player: 'Óscar Rey', detail: 'Gol' }, { minute: 36, type: 'goal', team: 'away', player: 'Álex Martín', detail: 'Gol · Asistencia de Diego León' }, { minute: 48, type: 'goal', team: 'away', player: 'Mario Sanz', detail: 'Gol · Asistencia de Diego León' }],
    report: { referee: 'Laura Pérez', duration: '50 minutos', attendance: '51 espectadores', notes: 'Encuentro finalizado sin incidencias.' },
  },
];
export const standings = [
  ['Naranja Mecánica', 6, 4, 2, 0, 14], ['Barrio FC', 6, 4, 1, 1, 13], ['Atlético Pucela', 6, 3, 2, 1, 11], ['Los del Lunes', 6, 3, 0, 3, 9], ['Titanes FC', 6, 2, 1, 3, 7], ['La Banda', 6, 1, 2, 3, 5],
];
export const rankings = {
  goals: [['Álex Martín', 'Naranja Mecánica', 9], ['Sergio Pérez', 'Barrio FC', 7], ['Mario Sanz', 'Atlético Pucela', 6]],
  assists: [['Diego León', 'Barrio FC', 6], ['Pablo Cano', 'Los del Lunes', 5], ['Álex Martín', 'Naranja Mecánica', 4]],
  wins: [['Álex Martín', 'Naranja Mecánica', 4], ['Diego León', 'Barrio FC', 4], ['Mario Sanz', 'Atlético Pucela', 3]],
  goalkeepers: [
    ['Roberto Merchán', 'Naranja Mecánica', 3, 1.17],
    ['Javi Ruiz', 'Barrio FC', 2, 1.33],
    ['Marcos Gil', 'Atlético Pucela', 2, 1.5],
    ['Dani López', 'Los del Lunes', 1, 1.83],
  ],
};
export const teamPlayers = ['Roberto Merchán', 'Álex Martín', 'Diego León', 'Mario Sanz', 'Pablo Cano', 'Sergio Pérez', 'David Gil'];
export const weeklySeven = {
  round: 6,
  formation: '2-3-1',
  featuredPlayer: 'Álex Martín',
  players: [
    { id: 1, name: 'Roberto Merchán', team: 'Naranja Mecánica', position: 'POR', row: 'goalkeeper', leaguePhotoUrl: null },
    { id: 2, name: 'Hugo Martín', team: 'Barrio FC', position: 'DEF', row: 'defence', leaguePhotoUrl: null },
    { id: 3, name: 'Mario Sanz', team: 'Naranja Mecánica', position: 'DEF', row: 'defence', leaguePhotoUrl: null },
    { id: 4, name: 'Diego León', team: 'Naranja Mecánica', position: 'MED', row: 'midfield', leaguePhotoUrl: null },
    { id: 5, name: 'Óscar Rey', team: 'Atlético Pucela', position: 'MED', row: 'midfield', leaguePhotoUrl: null },
    { id: 6, name: 'Rubén Gil', team: 'Barrio FC', position: 'MED', row: 'midfield', leaguePhotoUrl: null },
    { id: 7, name: 'Álex Martín', team: 'Naranja Mecánica', position: 'DEL', row: 'forward', leaguePhotoUrl: null },
  ],
};
