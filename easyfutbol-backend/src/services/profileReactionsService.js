// Reacciones del perfil: un catálogo cerrado de emojis positivos (no hay
// texto libre que moderar). Cada jugador da cada emoji una vez por perfil.
export const PROFILE_REACTIONS = [
  { key: 'fire', emoji: '🔥', label: 'Crack' },
  { key: 'goal', emoji: '⚽', label: 'Golazo' },
  { key: 'magic', emoji: '✨', label: 'Magia' },
  { key: 'wall', emoji: '🧱', label: 'Muro' },
  { key: 'lungs', emoji: '💪', label: 'Pulmón' },
  { key: 'teammate', emoji: '🤝', label: 'Buen compañero' },
  { key: 'clap', emoji: '👏', label: 'Bravo' },
  { key: 'king', emoji: '👑', label: 'Clase' },
];
const BY_KEY = new Map(PROFILE_REACTIONS.map((r) => [r.key, r]));
export const isValidReaction = (key) => BY_KEY.has(String(key));
export const reactionFor = (key) => BY_KEY.get(String(key)) || null;

// Para reaccionar basta con haber jugado un partido: frena cuentas vacías
// sin cerrar la puerta a quien acaba de empezar.
export const MIN_MATCHES_TO_REACT = 1;

/** Recuento por emoji (en el orden del catálogo), los míos y los últimos que han reaccionado. */
export async function getProfileReactions(db, profileUserId, viewerId) {
  const [counts] = await db.query(
    'SELECT emoji, COUNT(*) AS total FROM player_profile_reactions WHERE profile_user_id=? GROUP BY emoji',
    [profileUserId]
  );
  const [mine] = await db.query(
    'SELECT emoji FROM player_profile_reactions WHERE profile_user_id=? AND reactor_user_id=?',
    [profileUserId, viewerId]
  );
  const [recent] = await db.query(
    `SELECT u.id, u.name, u.avatar_url, MAX(r.created_at) AS last_at
     FROM player_profile_reactions r JOIN users u ON u.id = r.reactor_user_id
     WHERE r.profile_user_id=?
     GROUP BY u.id, u.name, u.avatar_url ORDER BY last_at DESC LIMIT 5`,
    [profileUserId]
  );
  const countByKey = new Map(counts.map((row) => [row.emoji, Number(row.total)]));
  const items = PROFILE_REACTIONS.map((r) => ({ ...r, count: countByKey.get(r.key) || 0 }));
  const [[{ people }]] = await db.query(
    'SELECT COUNT(DISTINCT reactor_user_id) AS people FROM player_profile_reactions WHERE profile_user_id=?',
    [profileUserId]
  );
  return {
    items,
    mine: mine.map((row) => row.emoji).filter(isValidReaction),
    total: items.reduce((sum, r) => sum + r.count, 0),
    people: Number(people),
    recent: recent.map((u) => ({ id: u.id, name: u.name, avatar_url: u.avatar_url })),
  };
}
