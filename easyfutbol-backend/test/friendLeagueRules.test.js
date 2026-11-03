import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  DEFAULT_RULES,
  computeStandings,
  findOvertaken,
  isLeagueComplete,
  normalizeLeagueInput,
  normalizeRules,
  validateTeams,
} from '../src/services/friendLeagueRules.js';

const league = (overrides = {}) => ({ team_size: 1, matches_goal: 10, rules: DEFAULT_RULES, ...overrides });
const row = (match_id, user_id, result, stats = {}) => ({
  match_id, user_id, result, starts_at: `2026-11-${String(match_id).padStart(2, '0')}T20:00:00`, goals: 0, assists: 0, saves: 0, is_mvp: 0, ...stats,
});
const solos = (...ids) => ids.map((user_id) => ({ user_id, team_no: null }));
const entryOf = (standings, userId) => standings.entries.find((entry) => entry.user_ids.includes(userId));

describe('normalizeRules', () => {
  test('rellena lo que falte y acepta valores negativos', () => {
    assert.deepEqual(normalizeRules({ loss: -2 }), { ...DEFAULT_RULES, loss: -2 });
  });
  test('rechaza decimales, valores fuera de rango y reglas que no puntúan nada', () => {
    assert.equal(normalizeRules({ goal: 1.5 }), null);
    assert.equal(normalizeRules({ goal: 21 }), null);
    assert.equal(normalizeRules({ win: 0, draw: 0, loss: 0, goal: 0, assist: 0, save: 0, mvp: 0 }), null);
  });
});

describe('normalizeLeagueInput', () => {
  const valid = { name: ' Los del jueves ', team_size: 2, matches_goal: 10, duration_days: 60, rules: {} };
  test('limpia una liga válida', () => {
    const { value } = normalizeLeagueInput(valid);
    assert.equal(value.name, 'Los del jueves');
    assert.equal(value.team_size, 2);
  });
  test('rechaza formato, partidos o duración no válidos', () => {
    assert.ok(normalizeLeagueInput({ ...valid, team_size: 4 }).error);
    assert.ok(normalizeLeagueInput({ ...valid, matches_goal: 2 }).error);
    assert.ok(normalizeLeagueInput({ ...valid, duration_days: 3 }).error);
    assert.ok(normalizeLeagueInput({ ...valid, name: 'a' }).error);
  });
});

describe('validateTeams', () => {
  test('en solitario basta con dos jugadores', () => {
    assert.ok(validateTeams({ teamSize: 1, acceptedIds: [1, 2] }).teamByUser);
    assert.ok(validateTeams({ teamSize: 1, acceptedIds: [1] }).error);
  });
  test('exige repartir a todos en equipos completos', () => {
    assert.equal(validateTeams({ teamSize: 2, acceptedIds: [1, 2, 3, 4], teams: [[1, 2], [3, 4]] }).teamByUser.get(4), 2);
    assert.ok(validateTeams({ teamSize: 2, acceptedIds: [1, 2, 3], teams: [[1, 2], [3]] }).error);
    assert.ok(validateTeams({ teamSize: 2, acceptedIds: [1, 2, 3, 4], teams: [[1, 2], [3, 1]] }).error);
    assert.ok(validateTeams({ teamSize: 2, acceptedIds: [1, 2, 3, 4], teams: [[1, 2], [3, 9]] }).error);
  });
});

describe('computeStandings', () => {
  test('suma cada estadística según su valor', () => {
    const standings = computeStandings({
      league: league({ rules: { ...DEFAULT_RULES, double_vs_rivals: false } }),
      members: solos(1),
      rows: [row(1, 1, 'win', { goals: 2, assists: 1, saves: 3, is_mvp: 1 })],
    });
    assert.equal(entryOf(standings, 1).points, 3 + 2 + 1 + 3 + 2);
  });

  test('una estadística a 0 no suma y una negativa resta', () => {
    const rules = { ...DEFAULT_RULES, goal: 0, loss: -2, double_vs_rivals: false };
    const standings = computeStandings({ league: league({ rules }), members: solos(1), rows: [row(1, 1, 'loss', { goals: 5 })] });
    assert.equal(entryOf(standings, 1).points, -2);
  });

  test('solo se duplica la victoria contra un rival de la liga', () => {
    const standings = computeStandings({
      league: league(),
      members: solos(1, 2),
      rows: [row(1, 1, 'win', { goals: 1 }), row(1, 2, 'loss'), row(2, 1, 'win', { goals: 1 })],
    });
    const player = entryOf(standings, 1);
    assert.equal(player.rival_wins, 1);
    assert.equal(player.points, (3 * 2 + 1) + (3 + 1));
  });

  test('no se duplica si está desactivado o si el rival jugó en tu mismo equipo', () => {
    const off = computeStandings({
      league: league({ rules: { ...DEFAULT_RULES, double_vs_rivals: false } }),
      members: solos(1, 2),
      rows: [row(1, 1, 'win'), row(1, 2, 'loss')],
    });
    assert.equal(entryOf(off, 1).points, 3);

    const sameSide = computeStandings({
      league: league(),
      members: solos(1, 2),
      rows: [row(1, 1, 'win'), row(1, 2, 'win')],
    });
    assert.equal(entryOf(sameSide, 1).points, 3);
  });

  test('ganar a tu propio compañero de pareja no duplica', () => {
    const standings = computeStandings({
      league: league({ team_size: 2 }),
      members: [{ user_id: 1, team_no: 1 }, { user_id: 2, team_no: 1 }, { user_id: 3, team_no: 2 }, { user_id: 4, team_no: 2 }],
      rows: [row(1, 1, 'win'), row(1, 2, 'loss'), row(2, 3, 'win'), row(2, 1, 'loss')],
    });
    assert.equal(entryOf(standings, 1).rival_wins, 0);
    assert.equal(entryOf(standings, 3).rival_wins, 1);
  });

  test('una pareja suma los puntos de sus dos miembros por separado', () => {
    const standings = computeStandings({
      league: league({ team_size: 2, matches_goal: 5 }),
      members: [{ user_id: 1, team_no: 1 }, { user_id: 2, team_no: 1 }, { user_id: 3, team_no: 2 }, { user_id: 4, team_no: 2 }],
      rows: [row(1, 1, 'win'), row(2, 2, 'draw', { goals: 2 })],
    });
    const team = entryOf(standings, 2);
    assert.equal(team.points, 3 + 1 + 2);
    assert.equal(team.matches, 2);
    assert.equal(team.matches_target, 10);
    assert.deepEqual(team.user_ids, [1, 2]);
  });

  test('solo cuentan los primeros N partidos, en orden de fecha', () => {
    const standings = computeStandings({
      league: league({ matches_goal: 2 }),
      members: solos(1),
      rows: [row(3, 1, 'win'), row(1, 1, 'draw'), row(2, 1, 'loss')],
    });
    const player = entryOf(standings, 1);
    assert.equal(player.matches, 2);
    assert.equal(player.points, 1);
  });

  test('el rival cuenta para el doble aunque ya haya agotado sus partidos', () => {
    const standings = computeStandings({
      league: league({ matches_goal: 1 }),
      members: solos(1, 2),
      rows: [row(1, 2, 'draw'), row(2, 2, 'loss'), row(2, 1, 'win')],
    });
    assert.equal(entryOf(standings, 1).rival_wins, 1);
    assert.equal(entryOf(standings, 2).matches, 1);
  });

  test('ignora a quien no es miembro', () => {
    const standings = computeStandings({ league: league(), members: solos(1), rows: [row(1, 1, 'win'), row(1, 9, 'loss')] });
    assert.equal(entryOf(standings, 1).rival_wins, 0);
  });

  test('desempata por victorias y goles, y empate total comparte puesto', () => {
    const standings = computeStandings({
      league: league({ rules: { ...DEFAULT_RULES, double_vs_rivals: false } }),
      members: solos(1, 2, 3, 4),
      rows: [row(1, 1, 'win'), row(2, 2, 'draw', { goals: 2 }), row(3, 3, 'draw', { goals: 2 })],
    });
    assert.equal(entryOf(standings, 1).rank, 1); // 3 puntos, pero con una victoria
    assert.equal(entryOf(standings, 2).rank, 2);
    assert.equal(entryOf(standings, 3).rank, 2);
    assert.equal(entryOf(standings, 4).rank, 4);
  });
});

describe('isLeagueComplete', () => {
  const base = computeStandings({ league: league({ matches_goal: 1 }), members: solos(1, 2), rows: [row(1, 1, 'win')] });
  test('sigue abierta si alguien no ha terminado', () => {
    assert.equal(isLeagueComplete({ standings: base, closingPassed: false }), false);
  });
  test('termina al pasar el plazo o al completar todos', () => {
    assert.equal(isLeagueComplete({ standings: base, closingPassed: true }), true);
    const done = computeStandings({ league: league({ matches_goal: 1 }), members: solos(1, 2), rows: [row(1, 1, 'win'), row(1, 2, 'loss')] });
    assert.equal(isLeagueComplete({ standings: done, closingPassed: false }), true);
  });
});

describe('findOvertaken', () => {
  test('avisa al que baja y nombra a quien le ha pasado', () => {
    const standings = computeStandings({ league: league(), members: solos(1, 2), rows: [row(1, 2, 'win')] });
    const [result] = findOvertaken({ standings, previousRanks: new Map([[1, 1], [2, 2]]) });
    assert.deepEqual(result.entry.user_ids, [1]);
    assert.deepEqual(result.overtaker.user_ids, [2]);
  });
  test('no avisa sin puesto anterior ni si nadie cambia', () => {
    const standings = computeStandings({ league: league(), members: solos(1, 2), rows: [row(1, 2, 'win')] });
    assert.equal(findOvertaken({ standings, previousRanks: new Map() }).length, 0);
    assert.equal(findOvertaken({ standings, previousRanks: new Map([[2, 1], [1, 2]]) }).length, 0);
  });
});
