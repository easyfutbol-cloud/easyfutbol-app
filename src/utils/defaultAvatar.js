// Foto por defecto para los jugadores que aún no han subido la suya.
export const DEFAULT_AVATAR = require('../../assets/default-avatar.png');

export const avatarSource = (uri) => (uri ? { uri } : DEFAULT_AVATAR);
