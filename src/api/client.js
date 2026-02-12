import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({
  baseURL: 'https://api.easyfutbol.es/api', // IP local de tu Mac + puerto del backend
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  const raw = await AsyncStorage.getItem('token');
  let token = raw;
  try { const p = JSON.parse(raw || 'null'); token = p?.access_token || p?.token || raw; } catch {}
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
export { api };
