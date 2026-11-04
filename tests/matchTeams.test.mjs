import test from 'node:test';
import assert from 'node:assert/strict';
import { countTeamPlayers, groupAttendeesByTeam } from '../src/utils/matchTeams.js';

test('reparte a los jugadores según sus entradas blancas y negras', () => {
  const teams = groupAttendeesByTeam([
    { user_id: 1, username: 'Ana', white_tickets: '1', black_tickets: '0', ticket_color: 'white' },
    { user_id: 2, username: 'Luis', white_tickets: 0, black_tickets: 2, ticket_color: 'black' },
  ]);
  assert.deepEqual(teams.white, [{ id: 1, name: 'Ana', tickets: 1 }]);
  assert.deepEqual(teams.black, [{ id: 2, name: 'Luis', tickets: 2 }]);
  assert.deepEqual(teams.pending, []);
});

test('quien tiene entradas de los dos colores sale en los dos equipos', () => {
  const teams = groupAttendeesByTeam([{ user_id: 3, username: 'Eva', white_tickets: 1, black_tickets: 1, ticket_color: 'mixed' }]);
  assert.equal(teams.white[0].name, 'Eva');
  assert.equal(teams.black[0].name, 'Eva');
  assert.equal(countTeamPlayers(teams), 2);
});

test('sin color queda por confirmar y las entradas de más cuentan en el total', () => {
  const teams = groupAttendeesByTeam([
    { user_id: 4, username: null, white_tickets: 0, black_tickets: 0, ticket_color: 'orange' },
    { user_id: 5, username: 'Leo', white_tickets: 3, black_tickets: 0 },
  ]);
  assert.deepEqual(teams.pending, [{ id: 4, name: 'Jugador', tickets: 1 }]);
  assert.equal(countTeamPlayers(teams), 4);
});

test('sin datos los equipos quedan vacíos', () => {
  assert.deepEqual(groupAttendeesByTeam(null), { white: [], black: [], pending: [] });
});
