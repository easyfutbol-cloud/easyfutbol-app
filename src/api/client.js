import axios from 'axios';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({
  baseURL: 'https://api.easyfutbol.es/api',
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
    if (error.response?.status === 401 && !handlingExpiredSession) {
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
