import { api } from './client';

export async function login(email, password) {
  const { data } = await api.post('/auth/login', { email, password });
  return data; // { ok, user, token }
}

export async function register(name, email, password) {
  const { data } = await api.post('/auth/register', { name, email, password });
  return data; // { ok, user, token }
}
