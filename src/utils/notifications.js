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
    shouldSetBadge: true,
  }),
});

/**
 * Pide permisos y devuelve el token de Expo para notificaciones push.
 */
export async function configureNotificationChannels(){
  if(Platform.OS!=='android')return;
  const channels=[['default','General',Notifications.AndroidImportance.DEFAULT],['matches','Partidos',Notifications.AndroidImportance.MAX],['social','Actividad social',Notifications.AndroidImportance.DEFAULT],['easypass','EasyPass',Notifications.AndroidImportance.HIGH],['news','Novedades',Notifications.AndroidImportance.DEFAULT]];
  await Promise.all(channels.map(([id,name,importance])=>Notifications.setNotificationChannelAsync(id,{name,importance,vibrationPattern:[0,250,250,250],lightColor:'#FF5A00'})));
}

export async function getNotificationPermissionStatus(){const result=await Notifications.getPermissionsAsync();return result.status;}
export async function syncNotificationBadge(count){try{await Notifications.setBadgeCountAsync(Math.max(0,Number(count)||0));}catch{}}

export async function registerForPushNotificationsAsync({requestPermission=true}={}) {
  try {
    console.log('[PUSH] Inicio registerForPushNotificationsAsync');
    console.log('[PUSH] Platform:', Platform.OS);
    console.log('[PUSH] Device.isDevice:', Device.isDevice);

    if (!Device.isDevice) {
      console.log('[PUSH] Debes usar un dispositivo físico para recibir notificaciones push');
      return null;
    }

    await configureNotificationChannels();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('[PUSH] existingStatus:', existingStatus);

    let finalStatus = existingStatus;

    if (existingStatus !== 'granted' && requestPermission) {
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

    console.log('[PUSH] Token Expo obtenido correctamente');
    return token;
  } catch (error) {
    console.log('[PUSH] Error obteniendo token push:', error?.message || error);
    return null;
  }
}
