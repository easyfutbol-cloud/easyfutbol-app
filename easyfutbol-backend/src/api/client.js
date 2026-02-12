import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Base URL del backend para la APP en producción
const baseURL = 'https://api.easyfutbol.es/api';

export const api = axios.create({ baseURL, timeout: 20000 });

// Añadimos automáticamente el token de sesión en cada petición
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  try {
    const method = (config.method || 'GET').toUpperCase();
    const url = `${config.baseURL || ''}${config.url || ''}`;
    console.log('➡️ API REQUEST:', method, url);
  } catch (e) {
    console.log('➡️ API REQUEST (sin construir URL legible)', config.method, config.url);
  }

  return config;
});
