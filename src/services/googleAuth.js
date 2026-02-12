// src/services/googleAuth.js
import { makeRedirectUri, startAsync } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// Client ID del tipo "Aplicación web" en Google Cloud
// Puedes sobreescribirlo con EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en tu .env
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '1022127212839-c6dt4a8saubabv224jr48kcu9mr6588c.apps.googleusercontent.com';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
};

// 👇 ESTA es la función que espera AccessScreen
export async function signInWithGoogle() {
  // Usamos el proxy de Expo (funciona en Expo Go y en dev)
  const redirectUri = makeRedirectUri({
    useProxy: true,
  });

  const state = Math.random().toString(36).slice(2);
  const nonce = Math.random().toString(36).slice(2);

  console.log('Redirect URI Google:', redirectUri);
  console.log('Nonce Google:', nonce);

  const params = new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account',
  }).toString();

  const authUrl = `${discovery.authorizationEndpoint}?${params}`;

  const result = await startAsync({
    authUrl,
    returnUrl: redirectUri,
  });

  console.log('Resultado Google AuthSession:', result);

  if (result.type !== 'success' || !result.params?.id_token) {
    throw new Error('Login cancelado o sin id_token');
  }

  // Devolvemos el id_token porque es lo que usa AccessScreen
  return result.params.id_token;
}