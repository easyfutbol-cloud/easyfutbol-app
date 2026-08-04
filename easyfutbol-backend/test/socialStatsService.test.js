import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSocialMatches } from '../src/services/socialStatsService.js';

test('las estadísticas sociales no dependen de goles ni asistencias', () => {
  const rows=[
    {match_id:1,result:'win',relationship:'teammate',starts_at:new Date(Date.now()-86400000)},
    {match_id:2,result:'draw',relationship:'rival',starts_at:new Date(Date.now()-43200000)},
  ];
  const base=summarizeSocialMatches(rows);
  const decorated=summarizeSocialMatches(rows.map(row=>({...row,goals:99,assists:99})));
  assert.deepEqual(decorated,base);
  assert.equal(base.matches_together,2);
  assert.equal(base.same_team,1);
  assert.equal(base.rivals,1);
});

test('la compatibilidad conserva una base prudente cuando aún no jugaron juntos', () => {
  const stats=summarizeSocialMatches([]);
  assert.equal(stats.matches_together,0);
  assert.equal(stats.compatibility,35);
  assert.equal(stats.win_rate,0);
});

test('una racha de victorias aumenta la compatibilidad con evidencia suficiente', () => {
  const now=Date.now();
  const wins=Array.from({length:12},(_,index)=>({match_id:index+1,result:'win',relationship:'teammate',starts_at:new Date(now-index*86400000)}));
  const losses=wins.map(row=>({...row,result:'loss'}));
  assert.ok(summarizeSocialMatches(wins).compatibility>summarizeSocialMatches(losses).compatibility);
});
