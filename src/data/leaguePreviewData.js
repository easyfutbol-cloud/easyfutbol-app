// Datos ficticios de la demostración de EasyFutbol League, con una liga por ciudad.
// Todo lo derivado (clasificación, rankings, 7 de la jornada) se calcula a partir
// de los resultados, así que las cifras son coherentes entre pantallas.
import { approvedPlayerProfile, approvedProfile } from './leagueTeamProfiles';

export const LEAGUE_NAME = 'EasyFutbol League';
const FORMAT = 'Fútbol 7';
const MATCH_MINUTES = 50;

// Pon aquí el nombre de la marca para ver cómo quedaría el patrocinio en la app.
export const leagueSponsor = { name: 'Madison MKT' };

const POSITIONS = ['POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'MED', 'DEL', 'DEL'];
const SLOTS = ['Sáb · 20:00', 'Sáb · 21:00', 'Dom · 20:00', 'Dom · 21:00'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Ciudades con liga en juego: equipos, plantillas y marcadores de las jornadas disputadas.
const LIVE_CITIES = [
  {
    id: 'vll',
    name: 'Valladolid',
    venue: 'Fútbol 7 Parquesol',
    start: new Date(2026, 8, 5),
    teams: [
      { id: 'nar', name: 'Naranja Mecánica', short: 'NAR', color: '#FF5A00' },
      { id: 'bar', name: 'Barrio FC', short: 'BAR', color: '#3B82F6' },
      { id: 'atp', name: 'Atlético Pucela', short: 'ATP', color: '#A855F7' },
      { id: 'ldl', name: 'Los del Lunes', short: 'LDL', color: '#22C55E' },
      { id: 'tit', name: 'Titanes FC', short: 'TIT', color: '#EAB308' },
      { id: 'ban', name: 'La Banda', short: 'BAN', color: '#EF4444' },
      { id: 'esg', name: 'Real Esgueva', short: 'ESG', color: '#14B8A6' },
      { id: 'pis', name: 'Deportivo Pisuerga', short: 'PIS', color: '#EC4899' },
    ],
    rosters: {
      nar: ['Roberto Merchán', 'Mario Sanz', 'Pablo Cano', 'Iker Soto', 'Diego León', 'David Gil', 'Nico Prieto', 'Samuel Vega', 'Álex Martín', 'Sergio Pérez'],
      bar: ['Javi Ruiz', 'Hugo Martín', 'Iván Nieto', 'Carlos Rey', 'Rubén Gil', 'Luis Sanz', 'Marco Alonso', 'Óliver Mata', 'Adrián Pérez', 'Gonzalo Díez'],
      atp: ['Marcos Gil', 'Leo Ruiz', 'Víctor Sanz', 'Raúl Cano', 'Óscar Rey', 'Jorge Nieto', 'Ángel Martín', 'Bruno Pastor', 'Dani Herrero', 'Eric Molina'],
      ldl: ['Dani López', 'Tomás Rivas', 'Aitor Blanco', 'Fran Ortega', 'Pablo Muñoz', 'Enzo Calvo', 'Mateo Gallego', 'Joel Fuentes', 'Rodrigo Vidal', 'Unai Castro'],
      tit: ['Álvaro Ramos', 'Kike Marín', 'Asier Román', 'Jaime Serrano', 'Lucas Delgado', 'Gabri Moreno', 'Hugo Lozano', 'Izan Cabrera', 'Manu Carmona', 'Pau Medina'],
      ban: ['Sergio Crespo', 'Martín Vargas', 'Rafa Iglesias', 'Cristian Peña', 'Dario León', 'Aarón Santos', 'Biel Garrido', 'Toni Márquez', 'Mikel Rubio', 'Yeray Sáez'],
      esg: ['Guille Pardo', 'Borja Esteban', 'Nacho Bravo', 'Liam Arias', 'Omar Benítez', 'Ismael Rojas', 'Alberto Cruz', 'Carlos Nieto', 'Julen Soler', 'Hernán Vera'],
      pis: ['Fer Domínguez', 'Quique Lara', 'Rober Camacho', 'Gerard Mora', 'Héctor Pozo', 'Tito Ferrer', 'Chema Luque', 'Ramón Gil', 'Ander Ibáñez', 'Bastian Rey'],
    },
    results: [
      [[4, 2], [2, 2], [3, 1], [1, 3]],
      [[2, 1], [0, 2], [5, 3], [2, 2]],
      [[3, 3], [4, 1], [1, 2], [2, 0]],
      [[3, 1], [2, 4], [2, 2], [1, 0]],
    ],
  },
  {
    id: 'ovi',
    name: 'Oviedo',
    venue: 'Sede EasyFutbol Oviedo',
    start: new Date(2026, 8, 12),
    teams: [
      { id: 'vet', name: 'Vetusta FC', short: 'VET', color: '#2563EB' },
      { id: 'car', name: 'Los Carbayones', short: 'CAR', color: '#16A34A' },
      { id: 'nrn', name: 'Naranco United', short: 'NRN', color: '#F97316' },
      { id: 'uri', name: 'Deportivo Uría', short: 'URI', color: '#DC2626' },
      { id: 'lla', name: 'Atlético Llamaquique', short: 'LLA', color: '#7C3AED' },
      { id: 'pea', name: 'La Peña Azul', short: 'PEA', color: '#0EA5E9' },
      { id: 'sid', name: 'Sidra Team', short: 'SID', color: '#CA8A04' },
      { id: 'fon', name: 'Fontán CF', short: 'FON', color: '#DB2777' },
    ],
    results: [
      [[2, 0], [3, 3], [1, 2], [4, 1]],
      [[2, 2], [5, 2], [0, 1], [3, 2]],
      [[1, 1], [2, 3], [4, 0], [2, 1]],
    ],
  },
];

// Ciudades sin liga en juego todavía.
const UPCOMING_CITIES = [
  { id: 'leo', name: 'León', status: 'registration', start: 'Enero 2027', teamsRegistered: 6, venue: 'Sede EasyFutbol León' },
  { id: 'sal', name: 'Salamanca', status: 'registration', start: 'Febrero 2027', teamsRegistered: 3, venue: 'Sede EasyFutbol Salamanca' },
  { id: 'gij', name: 'Gijón', status: 'soon', start: 'Primavera 2027' },
  { id: 'bil', name: 'Bilbao', status: 'soon', start: 'Primavera 2027' },
];

const FIRST_NAMES = ['Adrián', 'Álex', 'Andrés', 'Antonio', 'Borja', 'Bruno', 'Carlos', 'César', 'Daniel', 'David', 'Diego', 'Eloy', 'Fernando', 'Gonzalo', 'Héctor', 'Hugo', 'Iago', 'Iván', 'Jaime', 'Javier', 'Jorge', 'Juan', 'Lucas', 'Luis', 'Manuel', 'Marcos', 'Mario', 'Martín', 'Nacho', 'Nicolás', 'Óscar', 'Pablo', 'Pelayo', 'Rafael', 'Raúl', 'Rodrigo', 'Rubén', 'Samuel', 'Sergio', 'Xuan'];
const LAST_NAMES = ['Álvarez', 'Fernández', 'García', 'González', 'Menéndez', 'Suárez', 'Rodríguez', 'Díaz', 'López', 'Martínez', 'Pérez', 'Sánchez', 'Iglesias', 'Alonso', 'Fueyo', 'Cuesta', 'Prieto', 'Rubiera', 'Villa', 'Llaneza', 'Ordóñez', 'Muñiz', 'Riestra', 'Tuñón', 'Valdés', 'Arias', 'Blanco', 'Cabal', 'Castro', 'Coto', 'Del Río', 'Estrada', 'Fano', 'Gutiérrez', 'Huerta', 'Lombardía', 'Miranda', 'Noval', 'Peláez', 'Quirós'];

function generatedRosters(teams, seed) {
  const used = new Set();
  return Object.fromEntries(teams.map((team, t) => [team.id, Array.from({ length: 10 }, (_, i) => {
    let k = 0;
    let name;
    do {
      name = `${FIRST_NAMES[(i * 7 + t * 3 + seed + k) % FIRST_NAMES.length]} ${LAST_NAMES[(i * 11 + t * 5 + k * 3) % LAST_NAMES.length]}`;
      k += 1;
    } while (used.has(name));
    used.add(name);
    return name;
  })]));
}

const addDays = (date, days) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const dayMonth = (date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;
const weekendLabel = (saturday) => {
  const sunday = addDays(saturday, 1);
  return saturday.getMonth() === sunday.getMonth()
    ? `${saturday.getDate()}-${sunday.getDate()} ${MONTHS[saturday.getMonth()]}`
    : `${dayMonth(saturday)} - ${dayMonth(sunday)}`;
};

function buildPairings(ids) {
  const rounds = [];
  let rotation = ids.slice(1);
  for (let round = 0; round < ids.length - 1; round += 1) {
    const circle = [ids[0], ...rotation];
    const pairs = [];
    for (let i = 0; i < circle.length / 2; i += 1) {
      const a = circle[i];
      const b = circle[circle.length - 1 - i];
      pairs.push((round + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rotation = [rotation[rotation.length - 1], ...rotation.slice(0, -1)];
  }
  return rounds;
}

// Generador pseudoaleatorio con semilla para que los goleadores sean siempre los mismos.
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

const SCORE_WEIGHT = { POR: 0, DEF: 1, MED: 3, DEL: 6 };
const ASSIST_WEIGHT = { POR: 0.3, DEF: 1.5, MED: 4, DEL: 2.5 };

function pickWeighted(list, weights, random) {
  const total = list.reduce((sum, item) => sum + weights[item.position], 0);
  let target = random() * total;
  for (const item of list) {
    target -= weights[item.position];
    if (target <= 0) return item;
  }
  return list[list.length - 1];
}

function buildLeague(config, cityIndex) {
  const teams = config.teams.map((team) => ({ ...team, cityId: config.id }));
  const rosters = config.rosters || generatedRosters(teams, cityIndex * 13);
  const players = teams.flatMap((team) =>
    rosters[team.id].map((name, index) => ({
      id: `${team.id}-${index + 1}`,
      teamId: team.id,
      cityId: config.id,
      name,
      number: index === 0 ? 1 : index + 1,
      position: POSITIONS[index],
      captain: index === 4,
    }))
  );
  const squadOf = (teamId) => players.filter((player) => player.teamId === teamId);
  const playedRounds = config.results.length;
  const totalRounds = teams.length - 1;
  const saturdays = Array.from({ length: totalRounds + 1 }, (_, round) => addDays(config.start, round * 7));

  const lineupFor = (teamId, random) => {
    const squad = squadOf(teamId);
    const byPos = (pos) => squad.filter((player) => player.position === pos);
    const shuffle = (list) => list.map((item) => [random(), item]).sort((a, b) => a[0] - b[0]).map(([, item]) => item);
    const starters = [byPos('POR')[0], ...shuffle(byPos('DEF')).slice(0, 2), ...shuffle(byPos('MED')).slice(0, 3), shuffle(byPos('DEL'))[0]];
    return { starters, bench: squad.filter((player) => !starters.includes(player)) };
  };

  const buildMatch = (roundIndex, slotIndex, homeId, awayId) => {
    const saturday = saturdays[roundIndex];
    const day = slotIndex < 2 ? `Sáb ${dayMonth(saturday)}` : `Dom ${dayMonth(addDays(saturday, 1))}`;
    const base = {
      id: `${config.id}-r${roundIndex + 1}-${slotIndex + 1}`,
      cityId: config.id,
      round: roundIndex + 1,
      slot: SLOTS[slotIndex],
      day,
      time: slotIndex % 2 === 0 ? '20:00' : '21:00',
      venue: config.venue,
      homeId,
      awayId,
    };
    const result = config.results[roundIndex]?.[slotIndex];
    if (!result) return { ...base, status: 'scheduled' };

    const random = seeded((roundIndex + 1) * 97 + (slotIndex + 1) * 13 + cityIndex * 1009);
    const lineups = { home: lineupFor(homeId, random), away: lineupFor(awayId, random) };
    const events = [];
    const contributions = {};
    const credit = (player, points) => { contributions[player.id] = (contributions[player.id] || 0) + points; };

    [['home', result[0]], ['away', result[1]]].forEach(([side, goals]) => {
      const onPitch = [...lineups[side].starters, ...lineups[side].bench.slice(0, 2)];
      for (let i = 0; i < goals; i += 1) {
        const scorer = pickWeighted(onPitch, SCORE_WEIGHT, random);
        const assistant = random() < 0.7 ? pickWeighted(onPitch.filter((player) => player !== scorer), ASSIST_WEIGHT, random) : null;
        credit(scorer, 3);
        if (assistant) credit(assistant, 2);
        events.push({ minute: 1 + Math.floor(random() * 49), type: 'goal', side, playerId: scorer.id, assistId: assistant?.id || null });
      }
      if (random() < 0.45) {
        const booked = pickWeighted(lineups[side].starters, { POR: 0.2, DEF: 4, MED: 2, DEL: 1 }, random);
        events.push({ minute: 5 + Math.floor(random() * 44), type: 'yellow', side, playerId: booked.id });
      }
    });
    events.sort((a, b) => a.minute - b.minute);

    // MVP: mayor aportación, desempatando a favor del equipo ganador.
    const winnerSide = result[0] === result[1] ? null : result[0] > result[1] ? 'home' : 'away';
    const candidates = [...lineups.home.starters, ...lineups.away.starters].map((player) => {
      const side = player.teamId === homeId ? 'home' : 'away';
      return { player, score: (contributions[player.id] || 0) + (side === winnerSide ? 1.5 : 0) + (player.position === 'POR' && result[side === 'home' ? 1 : 0] === 0 ? 4 : 0) };
    });
    candidates.sort((a, b) => b.score - a.score);

    return {
      ...base,
      status: 'finished',
      homeScore: result[0],
      awayScore: result[1],
      events,
      lineups,
      mvpId: candidates[0].player.id,
      report: {
        referee: ['Daniel Gómez', 'Laura Pérez', 'Iván Herrera', 'Marta Salas'][slotIndex],
        duration: `${MATCH_MINUTES} minutos`,
        notes: 'Partido disputado con normalidad. Sin incidencias posteriores al encuentro.',
      },
    };
  };

  const matches = buildPairings(teams.map((team) => team.id)).flatMap((pairs, roundIndex) =>
    pairs.map(([homeId, awayId], slotIndex) => buildMatch(roundIndex, slotIndex, homeId, awayId))
  );
  const finishedMatches = matches.filter((match) => match.status === 'finished');
  const roundMatches = (round) => matches.filter((match) => match.round === round);

  const standings = (() => {
    const table = Object.fromEntries(teams.map((team) => [team.id, { teamId: team.id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] }]));
    finishedMatches.forEach((match) => {
      [[match.homeId, match.homeScore, match.awayScore], [match.awayId, match.awayScore, match.homeScore]].forEach(([teamId, own, other]) => {
        const row = table[teamId];
        row.played += 1;
        row.goalsFor += own;
        row.goalsAgainst += other;
        if (own > other) { row.won += 1; row.points += 3; row.form.push('W'); }
        else if (own === other) { row.drawn += 1; row.points += 1; row.form.push('D'); }
        else { row.lost += 1; row.form.push('L'); }
      });
    });
    return Object.values(table)
      .map((row) => ({ ...row, goalDiff: row.goalsFor - row.goalsAgainst }))
      .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
      .map((row, index) => ({ ...row, position: index + 1 }));
  })();

  const playerStats = (() => {
    const stats = Object.fromEntries(players.map((player) => [player.id, { playerId: player.id, played: 0, goals: 0, assists: 0, mvps: 0, yellows: 0, cleanSheets: 0, conceded: 0 }]));
    finishedMatches.forEach((match) => {
      ['home', 'away'].forEach((side) => {
        const conceded = side === 'home' ? match.awayScore : match.homeScore;
        [...match.lineups[side].starters, ...match.lineups[side].bench.slice(0, 2)].forEach((player) => {
          stats[player.id].played += 1;
          if (player.position === 'POR') {
            stats[player.id].conceded += conceded;
            if (conceded === 0) stats[player.id].cleanSheets += 1;
          }
        });
      });
      match.events.forEach((event) => {
        if (event.type === 'goal') {
          stats[event.playerId].goals += 1;
          if (event.assistId) stats[event.assistId].assists += 1;
        }
        if (event.type === 'yellow') stats[event.playerId].yellows += 1;
      });
      stats[match.mvpId].mvps += 1;
    });
    return stats;
  })();

  const rankBy = (key) =>
    players
      .map((player) => ({ player, value: playerStats[player.id][key], stats: playerStats[player.id] }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value || a.stats.played - b.stats.played || a.player.name.localeCompare(b.player.name));

  const rankings = {
    goals: rankBy('goals'),
    assists: rankBy('assists'),
    mvps: rankBy('mvps'),
    goalkeepers: players
      .filter((player) => player.position === 'POR')
      .map((player) => {
        const stats = playerStats[player.id];
        return { player, value: stats.cleanSheets, perMatch: stats.played ? stats.conceded / stats.played : 0, stats };
      })
      .sort((a, b) => b.value - a.value || a.perMatch - b.perMatch),
  };

  // 7 de la jornada: mejor rendimiento de la última jornada en un 2-3-1.
  const weeklySeven = (() => {
    const round = playedRounds;
    const scored = roundMatches(round).flatMap((match) => ['home', 'away'].flatMap((side) => {
      const won = side === 'home' ? match.homeScore > match.awayScore : match.awayScore > match.homeScore;
      const conceded = side === 'home' ? match.awayScore : match.homeScore;
      return match.lineups[side].starters.map((player) => {
        const goals = match.events.filter((event) => event.type === 'goal' && event.playerId === player.id).length;
        const assists = match.events.filter((event) => event.type === 'goal' && event.assistId === player.id).length;
        const score = goals * 3 + assists * 2 + (won ? 1.5 : 0) + (match.mvpId === player.id ? 3 : 0) + (player.position !== 'MED' && player.position !== 'DEL' ? Math.max(0, 3 - conceded) : 0);
        return { player, score, goals, assists };
      });
    }));
    const best = (position, count) => scored.filter((row) => row.player.position === position).sort((a, b) => b.score - a.score).slice(0, count);
    const lineup = { goalkeeper: best('POR', 1), defence: best('DEF', 2), midfield: best('MED', 3), forward: best('DEL', 1) };
    const featured = Object.values(lineup).flat().sort((a, b) => b.score - a.score)[0];
    return { round, formation: '2-3-1', lineup, featuredId: featured.player.id };
  })();

  const finalFourSaturday = saturdays[totalRounds];
  const lastSunday = addDays(saturdays[playedRounds - 1], 1);
  const totalGoals = finishedMatches.reduce((sum, match) => sum + match.homeScore + match.awayScore, 0);

  return {
    id: config.id,
    name: config.name,
    city: config.name,
    status: 'live',
    season: 'Temporada 2026',
    format: FORMAT,
    matchMinutes: MATCH_MINUTES,
    venue: config.venue,
    finalFourDate: `Sáb ${dayMonth(finalFourSaturday)}`,
    finalFourWeekend: weekendLabel(finalFourSaturday),
    finalFourDays: [`SÁB ${dayMonth(finalFourSaturday).toUpperCase()}`, `DOM ${dayMonth(addDays(finalFourSaturday, 1)).toUpperCase()}`],
    teams,
    players,
    matches,
    finishedMatches,
    standings,
    playerStats,
    rankings,
    weeklySeven,
    seasonTotals: { goals: totalGoals, matches: finishedMatches.length },
    playedRounds,
    totalRounds,
    nextRound: playedRounds + 1,
    roundMatches,
    roundWeekend: (round) => weekendLabel(saturdays[round - 1]),
    news: [
      { id: 1, tag: 'CRÓNICA', title: `La jornada ${playedRounds} aprieta la zona Final Four`, text: `Así está la pelea por los cuatro primeros puestos de ${config.name} a falta de ${totalRounds - playedRounds} jornadas.`, date: dayMonth(lastSunday) },
      { id: 2, tag: 'VÍDEO', title: 'Los mejores goles del mes, ya en YouTube', text: 'Todos los partidos se graban y se publican completos junto a un resumen de cada jornada.', date: dayMonth(addDays(lastSunday, -3)) },
    ],
  };
}

const LIVE_LEAGUES = LIVE_CITIES.map(buildLeague);
const UPCOMING = UPCOMING_CITIES.map((city) => ({ ...city, city: city.name, teamsMax: 8 }));

export const cities = [...LIVE_LEAGUES, ...UPCOMING];
export const DEFAULT_CITY_ID = LIVE_LEAGUES[0].id;
export const getCity = (id) => cities.find((city) => city.id === id) || cities[0];

// Índices globales: los ids de equipos, jugadores y partidos son únicos entre ciudades.
const allTeams = LIVE_LEAGUES.flatMap((league) => league.teams);
const allPlayers = LIVE_LEAGUES.flatMap((league) => league.players);
const allMatches = LIVE_LEAGUES.flatMap((league) => league.matches);
export const playerStats = Object.assign({}, ...LIVE_LEAGUES.map((league) => league.playerStats));

export const leagueOfTeam = (teamId) => LIVE_LEAGUES.find((league) => league.teams.some((team) => team.id === teamId));

export const getBaseTeam = (id) => allTeams.find((team) => team.id === id);
// Equipo con la personalización aprobada por los administradores aplicada encima.
export const getTeam = (id) => {
  const team = getBaseTeam(id);
  return team && { ...team, ...approvedProfile(id) };
};

// Jugador con su perfil de liga aprobado aplicado encima (foto, apodo, dorsal…).
const withProfile = (player) => player && { ...player, ...approvedPlayerProfile(player.id) };
export const getBasePlayer = (id) => allPlayers.find((player) => player.id === id);
export const getPlayer = (id) => withProfile(getBasePlayer(id));
export const teamPlayers = (teamId) => allPlayers.filter((player) => player.teamId === teamId).map(withProfile);

export const getMatch = (id) => allMatches.find((match) => match.id === id);
export const teamMatches = (teamId) => allMatches.filter((match) => match.homeId === teamId || match.awayId === teamId);
export const standingOf = (teamId) => leagueOfTeam(teamId)?.standings.find((row) => row.teamId === teamId);

export function matchOutcome(match, teamId) {
  if (match.status !== 'finished') return null;
  const own = match.homeId === teamId ? match.homeScore : match.awayScore;
  const other = match.homeId === teamId ? match.awayScore : match.homeScore;
  return own > other ? 'W' : own < other ? 'L' : 'D';
}

export const CITY_STATUS = {
  live: { label: 'En juego', color: '#34D399' },
  registration: { label: 'Inscripciones abiertas', color: '#FBBF24' },
  soon: { label: 'Próximamente', color: '#8A8F98' },
};

// Contenido de la presentación del proyecto.
export const leaguePitch = {
  headline: 'Fútbol 7 amateur con la experiencia de una liga profesional',
  intro: 'Una competición organizada, arbitrada y grabada, con calendario, estadísticas y contenido de cada jornada dentro de la app de EasyFutbol.',
  numbers: [
    { value: String(cities.length), label: 'ciudades' },
    { value: '8', label: 'equipos/ciudad' },
    { value: '31', label: 'partidos' },
    { value: '100%', label: 'grabados' },
  ],
  phases: [
    { title: 'Fase regular', detail: '7 jornadas · todos contra todos', icon: 'repeat-outline' },
    { title: 'Final Four', detail: 'Los 4 primeros · semifinales y final', icon: 'trophy-outline' },
  ],
  schedule: [
    { icon: 'calendar-outline', title: 'Sábados y domingos', detail: 'Cuatro partidos por jornada' },
    { icon: 'time-outline', title: '20:00 y 21:00', detail: `Partidos de ${MATCH_MINUTES} minutos` },
    { icon: 'location-outline', title: 'Una sede por ciudad', detail: 'Mismo formato en todas' },
  ],
  includes: [
    { icon: 'videocam-outline', title: 'Todos los partidos grabados', detail: 'Publicados completos en YouTube, con resumen de cada jornada.' },
    { icon: 'stats-chart-outline', title: 'Estadísticas oficiales', detail: 'Goles, asistencias, MVP y porterías a cero de cada jugador.' },
    { icon: 'flag-outline', title: 'Arbitraje en cada partido', detail: 'Reglamento único para una competición seria y homogénea.' },
    { icon: 'phone-portrait-outline', title: 'Todo en la app', detail: 'Calendario, clasificación en directo, fichas de partido y equipos.' },
    { icon: 'star-outline', title: 'MVP y 7 de la jornada', detail: 'Reconocimiento semanal a los mejores jugadores.' },
    { icon: 'globe-outline', title: 'Formato replicable', detail: 'La misma estructura en cada ciudad donde se organice.' },
  ],
  partnership: [
    { icon: 'ribbon-outline', title: 'Naming de la competición', detail: `"EasyFutbol League by ${leagueSponsor.name || 'tu marca'}" en app, vídeos y equipaciones.` },
    { icon: 'play-circle-outline', title: 'Marca en los vídeos', detail: 'Cabecera, rótulos y cierre en cada partido y resumen publicado.' },
    { icon: 'medal-outline', title: 'Premio MVP patrocinado', detail: 'El MVP de cada partido y el 7 de la jornada, presentados por la marca.' },
    { icon: 'megaphone-outline', title: 'Contenido para redes', detail: 'Clips, goles de la semana y resultados listos para compartir.' },
    { icon: 'flag-outline', title: 'Presencia en el campo', detail: 'Lonas, photocall y activaciones durante las jornadas.' },
    { icon: 'gift-outline', title: 'Premios y experiencias', detail: 'Producto o experiencias para campeones y jugadores destacados.' },
  ],
  rules: [
    { title: 'Equipos y plantillas', text: 'Cada equipo inscribe una plantilla de hasta 12 jugadores. Juegan 7 (portero incluido) con cambios ilimitados.' },
    { title: 'Puntuación', text: 'Victoria 3 puntos, empate 1 y derrota 0. Desempate por diferencia de goles y, después, goles a favor.' },
    { title: 'Final Four', text: 'Semifinales 1º contra 4º y 2º contra 3º. La final decide el campeón de la temporada.' },
    { title: 'Grabaciones', text: 'Todos los partidos se publican en YouTube. Cualquier equipo puede solicitar la grabación de sus encuentros.' },
    { title: 'Premios', text: 'Se definen antes del inicio de cada liga y se detallan en el dosier de la competición.' },
  ],
};
