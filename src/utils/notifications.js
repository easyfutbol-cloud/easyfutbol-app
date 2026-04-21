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
  if (!Device.isDevice) {
    console.log('Debes usar un dispositivo físico para recibir notificaciones push');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF5A00',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('No se otorgaron permisos para notificaciones push');
    return null;
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId;

  if (!projectId) {
    console.log('No se encontró el projectId de EAS');
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({
    projectId,
  })).data;

  console.log('Expo push token:', token);
  return token;
}
