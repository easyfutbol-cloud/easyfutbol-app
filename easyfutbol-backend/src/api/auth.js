import { api } from './client';

export async function login(identifier, password) {
  const payload = {
    // alias para backends distintos
    identifier,
    login: identifier,
    user: identifier,
    username: identifier,
    email: identifier,
    correo: identifier,
    password,
    pass: password,
    contrasena: password,
    'contraseña': password,
  };

  const { data } = await api.post('/auth/login', payload);
  return data; // { ok, user, token } | { message: 'EMAIL_NOT_VERIFIED' }
}

export async function register(username, email, phone, password) {
  const payload = {
    username,
    user: username,
    name: username,
    nombre: username,
    email,
    phone,
    telefono: phone,
    tel: phone,
    password,
  };

  const { data } = await api.post('/auth/register', payload);
  return data; // { ok, user, token } | { ok: true, needsEmailVerification: true }
}

// Enviar/Reenviar código OTP al correo
export async function resendEmailCode(email) {
  const { data } = await api.post('/auth/email/resend', { email });
  return data; // { ok: true }
}

// Verificar correo con código OTP
export async function verifyEmailCode(email, code) {
  const { data } = await api.post('/auth/email/verify', { email, code });
  return data; // { ok: true }
}
