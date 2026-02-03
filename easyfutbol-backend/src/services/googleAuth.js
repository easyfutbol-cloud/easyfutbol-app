// src/services/googleAuth.js (backend)
import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '1022127212839-c6dt4a8saubabv224jr48kcu9mr6588c.apps.googleusercontent.com';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * Verifica un idToken de Google recibido desde la app móvil.
 * Devuelve el payload (email, sub, nombre, foto, etc.) si es válido.
 * Lanza un error si el token no es válido o no está emitido para nuestro CLIENT_ID.
 */
export async function verifyGoogleToken(idToken) {
  if (!idToken) {
    throw new Error('Falta idToken de Google');
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Token de Google sin payload');
    }

    return payload;
  } catch (err) {
    console.error('Error verificando token de Google:', err);
    throw new Error('Token de Google inválido');
  }
}