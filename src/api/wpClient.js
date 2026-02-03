// src/api/wpClient.js
import axios from 'axios';

export const wpApi = axios.create({
  baseURL: 'https://easyfutbol.es/wp-json/easyfutbol/v1',
  timeout: 10000,
});