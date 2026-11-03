// Liga de ejemplo para enseñar cómo queda una liga antes de crear la tuya. Vive
// solo en la app: no toca el backend y los jugadores son inventados.
import { DEFAULT_LEAGUE_RULES } from './friendLeagueRules.js';

const MATCHES_GOAL = 10;

const player = (user_id, name, overall, tier, position, line) => ({
  user_id,
  name,
  nickname: null,
  avatar_url: null,
  is_plus: 0,
  card: { overall, tier, provisional: false, matches_played: 24, position },
  ...line,
});

const line = (points, matches, wins, draws, losses, goals, assists, saves, mvps, rival_wins) => ({
  points, matches, wins, draws, losses, goals, assists, saves, mvps, rival_wins,
});

const PLAYERS = [
  player(-2, 'Marcos', 86, 'elite', 'forward', line(39, 7, 5, 1, 1, 9, 4, 0, 2, 2)),
  player(-1, 'Tú', 78, 'gold', 'midfielder', line(33, 6, 4, 1, 1, 7, 8, 0, 1, 1)),
  player(-3, 'Lucía', 74, 'gold', 'defender', line(30, 6, 3, 2, 1, 3, 5, 6, 1, 1)),
  player(-4, 'Nerea', 81, 'gold', 'goalkeeper', line(26, 5, 3, 0, 2, 0, 1, 14, 1, 0)),
  player(-5, 'Dani', 66, 'silver', 'midfielder', line(16, 5, 2, 1, 2, 4, 2, 0, 0, 1)),
  player(-6, 'Sergio', 58, 'bronze', 'forward', line(5, 3, 1, 0, 2, 2, 0, 0, 0, 0)),
];

export const DEMO_LEAGUE_DETAIL = {
  league: {
    id: 0,
    name: 'Los del jueves',
    owner_id: -2,
    team_size: 1,
    matches_goal: MATCHES_GOAL,
    duration_days: 60,
    days_left: 23,
    status: 'active',
    rules: DEFAULT_LEAGUE_RULES,
    demo: true,
  },
  me: { user_id: -1, status: 'accepted', is_owner: false, team_no: null },
  members: PLAYERS.map(({ user_id, name, nickname, avatar_url, is_plus }) => ({ user_id, name, nickname, avatar_url, is_plus, status: 'accepted', team_no: null })),
  standings: PLAYERS.map((item, index) => ({
    ...item,
    team_no: null,
    rank: index + 1,
    matches_target: MATCHES_GOAL,
    players: [item],
  })),
};
