import axios from 'axios';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// EXPO_PUBLIC_API_URL permite probar contra un backend local
// (EXPO_PUBLIC_API_URL=http://<ip-del-mac>:4000/api npx expo start). Se
// incrusta al empaquetar, así que las builds y OTA sin ella van a producción.
const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'https://api.easyfutbol.es/api',
  timeout: 20000,
});

let handlingExpiredSession = false;
let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

api.interceptors.request.use(async (config) => {
  const raw = await AsyncStorage.getItem('token');
  let token = raw;

  try {
    const parsed = JSON.parse(raw || 'null');
    token = parsed?.access_token || parsed?.token || raw;
  } catch {}

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const sessionExpired =
      error.response?.status === 401 &&
      error.response?.data?.code === 'SESSION_EXPIRED';

    if (sessionExpired && !handlingExpiredSession) {
      handlingExpiredSession = true;

      await AsyncStorage.multiRemove([
        'token',
        'user',
        'refreshToken',
      ]);

      const goToAccess = () => {
        if (typeof unauthorizedHandler === 'function') {
          unauthorizedHandler();
        }

        handlingExpiredSession = false;
      };

      Alert.alert(
        'Sesión caducada',
        'Tu sesión ha caducado. Inicia sesión de nuevo para seguir usando EasyFutbol.',
        [
          {
            text: 'Aceptar',
            onPress: goToAccess,
          },
        ],
        { cancelable: false }
      );
    }

    return Promise.reject(error);
  }
);

export default api;
export { api };
