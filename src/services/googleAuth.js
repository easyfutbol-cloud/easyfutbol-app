// src/services/googleAuth.js (APP)
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

/**
 * CLIENT_ID del cliente OAuth "Expo Google Login"
 * (el que se ve en tu consola de Google).
 */
const CLIENT_ID =
  '1022127212839-c6dt4a8saubabv224jr48kcu9mr6588c.apps.googleusercontent.com';

/**
 * IMPORTANTE:
 * Debe coincidir EXACTAMENTE con la URI de redirección autorizada
 * en tu cliente OAuth de Google.
 */
const EXPO_REDIRECT_URI =
  'https://auth.expo.io/@robertomerchan/easyfutbol-app';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
};

export async function signInWithGoogle() {
  // Forzamos el redirectUri al de Expo (sin usar makeRedirectUri)
  const redirectUri = EXPO_REDIRECT_URI;

  // Google exige un nonce cuando usamos response_type=id_token
  const nonce = Math.random().toString(36).substring(2);

  console.log('Redirect URI Google (FORZADO):', redirectUri);
  console.log('Nonce Google:', nonce);

  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri,
    responseType: 'id_token',
    scopes: ['openid', 'email', 'profile'],
    usePKCE: false,
    extraParams: {
      nonce,
    },
  });

  await request.makeAuthUrlAsync(discovery);

  const result = await request.promptAsync(discovery, {
    useProxy: false,
  });

  if (result.type !== 'success') {
    throw new Error('Login cancelado');
  }

  const idToken = result.params?.id_token;
  if (!idToken) {
    throw new Error('No se recibió idToken de Google');
  }

  return idToken;
}