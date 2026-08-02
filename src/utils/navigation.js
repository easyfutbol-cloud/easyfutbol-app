/**
 * Regresa dentro de la rama actual y usa una ruta segura cuando la pantalla
 * fue abierta como raíz (menú, enlace directo o restauración de estado).
 */
export function goBackOrFallback(navigation, fallbackRoute = 'Home', fallbackParams) {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
    return;
  }

  navigation?.navigate?.(fallbackRoute, fallbackParams);
}
