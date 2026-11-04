import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureUsage, FEATURES, isTrackableFeature } from '../src/services/featureUsageRules.js';

const find = (result, key) => result.features.find((feature) => feature.key === key);

test('solo se registran apartados con visitas, además de la base "app"', () => {
  assert.equal(isTrackableFeature('app'), true);
  assert.equal(isTrackableFeature('social'), true);
  assert.equal(isTrackableFeature('match_reviews'), false);
  assert.equal(isTrackableFeature('inventado'), false);
  assert.equal(isTrackableFeature(undefined), false);
  assert.equal(isTrackableFeature({}), false);
});

test('el porcentaje de visitas va sobre los jugadores que abren la app y se calculan días por jugador', () => {
  const result = buildFeatureUsage(
    [
      { feature: 'app', users: 200, user_days: 900 },
      { feature: 'social', users: 50, user_days: 125 },
    ],
    []
  );
  assert.equal(result.active_users, 200);
  assert.equal(find(result, 'social').visit_users, 50);
  assert.equal(find(result, 'social').visit_rate, 25);
  assert.equal(find(result, 'social').days_per_user, 2.5);
  // "app" es la base, no un apartado de la lista.
  assert.equal(find(result, 'app'), undefined);
});

test('un jugador con varias acciones en un apartado cuenta una vez, pero suma en cada acción', () => {
  const result = buildFeatureUsage([], [
    { feature: 'social', action: 'friend_requests', user_id: 1, events: 3 },
    { feature: 'social', action: 'match_invites', user_id: 1, events: 2 },
    { feature: 'social', action: 'friend_requests', user_id: 2, events: '1' },
  ]);
  const social = find(result, 'social');
  assert.equal(social.action_users, 2);
  assert.deepEqual(social.actions[0], { action: 'friend_requests', label: 'Solicitudes de amistad', users: 2, events: 4 });
  assert.deepEqual(social.actions[1], { action: 'match_invites', label: 'Invitaciones a partidos', users: 1, events: 2 });
});

test('sin visitas medidas aún no hay porcentajes y se ordena por acciones', () => {
  const result = buildFeatureUsage([], [
    { feature: 'friend_leagues', action: 'leagues_created', user_id: 1, events: 1 },
    { feature: 'friend_leagues', action: 'leagues_joined', user_id: 2, events: 1 },
    { feature: 'weekly_lineup', action: 'lineup_votes', user_id: 3, events: 5 },
  ]);
  assert.equal(result.active_users, 0);
  assert.equal(result.features[0].key, 'friend_leagues');
  assert.equal(result.features[1].key, 'weekly_lineup');
  assert.equal(result.features[0].visit_rate, null);
  assert.equal(result.features[0].days_per_user, null);
  assert.equal(result.features.length, FEATURES.length);
});

test('se ordena por el alcance mayor entre visitas y acciones', () => {
  const result = buildFeatureUsage(
    [
      { feature: 'app', users: 100, user_days: 100 },
      { feature: 'challenges', users: 10, user_days: 10 },
      { feature: 'social', users: 3, user_days: 3 },
    ],
    [
      { feature: 'match_reviews', action: 'reviews', user_id: 1, events: 1 },
      { feature: 'match_reviews', action: 'reviews', user_id: 2, events: 1 },
      { feature: 'match_reviews', action: 'reviews', user_id: 3, events: 1 },
      { feature: 'match_reviews', action: 'reviews', user_id: 4, events: 1 },
    ]
  );
  assert.deepEqual(result.features.slice(0, 3).map((feature) => feature.key), ['challenges', 'match_reviews', 'social']);
  // Un apartado sin visitas medibles no se presenta como 0 visitas.
  assert.equal(find(result, 'match_reviews').visit_users, null);
});
