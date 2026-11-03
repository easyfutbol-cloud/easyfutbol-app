import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  DEFAULT_LEAGUE_RULES,
  entryName,
  exampleMatchText,
  isAdminUser,
  leaderGapText,
  presetKeyFor,
  shuffleTeams,
  syncTeams,
  teamsAreComplete,
  toggleTeamMember,
} from '../src/utils/friendLeagueRules.js';
import { DEMO_LEAGUE_DETAIL } from '../src/utils/friendLeagueDemo.js';

describe('isAdminUser', () => {
  test('solo reconoce a los administradores', () => {
    assert.equal(isAdminUser({ role: 'admin' }), true);
    assert.equal(isAdminUser({ is_admin: 1 }), true);
    assert.equal(isAdminUser({ role: 'user' }), false);
    assert.equal(isAdminUser(null), false);
  });
});

describe('presetKeyFor', () => {
  test('reconoce la plantilla y detecta la personalización', () => {
    assert.equal(presetKeyFor(DEFAULT_LEAGUE_RULES), 'classic');
    assert.equal(presetKeyFor({ ...DEFAULT_LEAGUE_RULES, goal: 7 }), null);
  });
});

describe('entryName', () => {
  test('usa el apodo o el primer nombre', () => {
    assert.equal(entryName({ players: [{ name: 'Ana López' }, { name: 'Roberto', nickname: 'Beto' }] }), 'Ana y Beto');
  });
});

describe('leaderGapText', () => {
  const standings = [{ rank: 1, points: 10, matches: 2 }, { rank: 2, points: 9, matches: 2 }, { rank: 3, points: 4, matches: 1 }];
  test('dice la distancia al líder o la ventaja', () => {
    assert.equal(leaderGapText(standings[2], standings), 'A 6 puntos del líder');
    assert.equal(leaderGapText(standings[0], standings), '1 punto de ventaja');
  });
  test('distingue el empate en cabeza y la liga sin partidos', () => {
    const tied = [{ rank: 1, points: 5, matches: 1 }, { rank: 1, points: 5, matches: 1 }];
    assert.equal(leaderGapText(tied[0], tied), 'Empatado en cabeza');
    const empty = [{ rank: 1, points: 0, matches: 0 }, { rank: 1, points: 0, matches: 0 }];
    assert.equal(leaderGapText(empty[0], empty), 'Todavía no se ha jugado ningún partido');
  });
});

describe('exampleMatchText', () => {
  test('enseña el doble solo si está activado', () => {
    assert.match(exampleMatchText(DEFAULT_LEAGUE_RULES), /6 puntos, o 9 si es contra un rival/);
    assert.equal(exampleMatchText({ ...DEFAULT_LEAGUE_RULES, double_vs_rivals: false }), 'Ganar con 2 goles y 1 asistencia: 6 puntos.');
  });
});

describe('liga de ejemplo', () => {
  test('sus puntos cuadran con las reglas y va ordenada', () => {
    const { rules } = DEMO_LEAGUE_DETAIL.league;
    let previous = Infinity;
    for (const entry of DEMO_LEAGUE_DETAIL.standings) {
      const expected = entry.wins * rules.win + entry.rival_wins * rules.win + entry.draws * rules.draw + entry.losses * rules.loss
        + entry.goals * rules.goal + entry.assists * rules.assist + entry.saves * rules.save + entry.mvps * rules.mvp;
      assert.equal(entry.points, expected, entry.name);
      assert.equal(entry.wins + entry.draws + entry.losses, entry.matches, entry.name);
      assert.ok(entry.points < previous);
      previous = entry.points;
    }
  });
});

describe('reparto de equipos', () => {
  test('toggle mete en el primer hueco y saca si ya estaba', () => {
    const one = toggleTeamMember([[], []], 1, 2);
    assert.deepEqual(one, [[1], []]);
    const full = toggleTeamMember([[1, 2], []], 3, 2);
    assert.deepEqual(full, [[1, 2], [3]]);
    assert.deepEqual(toggleTeamMember(full, 1, 2), [[2], [3]]);
  });
  test('sync quita a quien ya no está y lista a los que no tienen equipo', () => {
    assert.deepEqual(syncTeams([[1, 9], [3]], [1, 3, 4, 5], 2), { teams: [[1], [3]], unassigned: [4, 5] });
    assert.deepEqual(syncTeams([[1, 2], [3, 4]], [1, 2], 2), { teams: [[1, 2]], unassigned: [] });
  });
  test('el azar reparte a todos en equipos del tamaño justo', () => {
    const teams = shuffleTeams([1, 2, 3, 4, 5, 6], 3);
    assert.equal(teams.length, 2);
    assert.ok(teamsAreComplete(teams, 3));
    assert.deepEqual(teams.flat().sort(), [1, 2, 3, 4, 5, 6]);
  });
  test('los equipos incompletos o uno solo no valen para empezar', () => {
    assert.equal(teamsAreComplete([[1, 2], [3]], 2), false);
    assert.equal(teamsAreComplete([[1, 2]], 2), false);
  });
});
