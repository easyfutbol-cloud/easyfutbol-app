/** Navega al padre funcional de la pantalla, sin depender del historial. */
export function goBackOrFallback(navigation, fallbackRoute = 'Home', fallbackParams) {
  navigation?.navigate?.(fallbackRoute, fallbackParams);
}
