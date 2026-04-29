// src/utils/notifications.js
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Pide permisos y devuelve el token de Expo para notificaciones push.
 */
export async function registerForPushNotificationsAsync() {
  try {
    console.log('[PUSH] Inicio registerForPushNotificationsAsync');
    console.log('[PUSH] Platform:', Platform.OS);
    console.log('[PUSH] Device.isDevice:', Device.isDevice);

    if (!Device.isDevice) {
      console.log('[PUSH] Debes usar un dispositivo físico para recibir notificaciones push');
      return null;
    }

    if (Platform.OS === 'android') {
      console.log('[PUSH] Configurando notification channel Android...');
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF5A00',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[PUSH] existingStatus:', existingStatus);

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('[PUSH] finalStatus tras requestPermissionsAsync:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('[PUSH] No se otorgaron permisos para notificaciones push');
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId;

    console.log('[PUSH] projectId:', projectId);

    if (!projectId) {
      console.log('[PUSH] No se encontró el projectId de EAS');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenResponse?.data ?? null;

    console.log('[PUSH] Expo push token:', token);
    return token;
  } catch (error) {
    console.log('[PUSH] Error obteniendo token push:', error?.message || error);
    return null;
  }
}
