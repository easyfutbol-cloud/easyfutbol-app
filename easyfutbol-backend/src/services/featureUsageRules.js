// Catálogo de apartados medidos y cálculo del panel "Uso de funciones".
// Sin base de datos para poder probarlo con datos a mano.

// Base de los porcentajes: cualquier apertura de la app.
export const APP_FEATURE = 'app';

// visits: la app registra cuándo se abre. actions: se deduce de datos que ya
// existen, así que también hay histórico de antes de medir las visitas.
export const FEATURES = [
  { key: 'social', label: 'Social', visits: true },
  { key: 'friend_leagues', label: 'Ligas entre amigos', visits: true },
  { key: 'social_top', label: 'Top jugadores', visits: true },
  { key: 'player_profiles', label: 'Perfiles de otros jugadores', visits: true },
  { key: 'my_profile', label: 'Mi perfil público', visits: true },
  { key: 'weekly_lineup', label: 'El 8 de la semana', visits: true },
  { key: 'challenges', label: 'Retos', visits: true },
  { key: 'easypoints_shop', label: 'Tienda de EasyPoints', visits: true },
  { key: 'my_season', label: 'Mi temporada', visits: true },
  { key: 'post_match', label: 'Resumen del partido', visits: true },
  { key: 'rankings', label: 'Estadísticas y rankings', visits: true },
  { key: 'achievements', label: 'Logros', visits: true },
  { key: 'tournaments', label: 'Torneos', visits: true },
  { key: 'notifications', label: 'Notificaciones', visits: true },
  { key: 'match_reviews', label: 'Valorar partidos', visits: false },
];

export const ACTION_LABELS = {
  friend_requests: 'Solicitudes de amistad',
  friend_accepts: 'Amistades aceptadas',
  match_invites: 'Invitaciones a partidos',
  friend_groups: 'Grupos creados',
  leagues_created: 'Ligas creadas',
  leagues_joined: 'Se unen a una liga',
  profile_views: 'Perfiles visitados',
  profile_comments: 'Comentarios en perfiles',
  profile_reactions: 'Reacciones a perfiles',
  profile_photos: 'Fotos subidas',
  lineup_votes: 'Votos',
  shop_purchases: 'Compras',
  reviews: 'Valoraciones',
};

const TRACKABLE = new Set([APP_FEATURE, ...FEATURES.filter((feature) => feature.visits).map((feature) => feature.key)]);

export const isTrackableFeature = (feature) => typeof feature === 'string' && TRACKABLE.has(feature);

const pct = (part, total) => (Number(total) ? Math.round((Number(part) / Number(total)) * 1000) / 10 : null);

/**
 * visitRows: [{ feature, users, user_days }]
 * actionRows: [{ feature, action, user_id, events }], una fila por jugador y acción.
 * Devuelve los apartados de más a menos jugadores; un jugador que entra y actúa cuenta una vez.
 */
export function buildFeatureUsage(visitRows, actionRows) {
  const visits = new Map(visitRows.map((row) => [row.feature, row]));
  const activeUsers = Number(visits.get(APP_FEATURE)?.users || 0);

  const features = FEATURES.map((feature) => {
    const rows = actionRows.filter((row) => row.feature === feature.key);
    const breakdown = new Map();
    for (const row of rows) {
      const entry = breakdown.get(row.action) || { action: row.action, label: ACTION_LABELS[row.action] || row.action, users: 0, events: 0 };
      entry.users += 1;
      entry.events += Number(row.events);
      breakdown.set(row.action, entry);
    }
    const visit = visits.get(feature.key);
    const visitUsers = feature.visits ? Number(visit?.users || 0) : null;
    return {
      key: feature.key,
      label: feature.label,
      visit_users: visitUsers,
      visit_rate: feature.visits ? pct(visitUsers, activeUsers) : null,
      days_per_user: visitUsers ? Math.round((Number(visit.user_days) / visitUsers) * 10) / 10 : null,
      action_users: new Set(rows.map((row) => String(row.user_id))).size,
      actions: [...breakdown.values()].sort((a, b) => b.users - a.users || b.events - a.events),
    };
  });

  const reach = (feature) => Math.max(feature.visit_users || 0, feature.action_users);
  features.sort((a, b) => reach(b) - reach(a) || (b.visit_users || 0) - (a.visit_users || 0) || a.label.localeCompare(b.label, 'es'));
  return { active_users: activeUsers, features };
}
