import { Expo } from 'expo-server-sdk';

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

export async function sendPushNotification(tokens = [], { title, body, data = {} }) {
  const messages = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.log('Token Expo inválido:', token);
      continue;
    }

    messages.push({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    });
  }

  if (!messages.length) {
    return [];
  }

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error enviando push chunk:', error);
    }
  }

  return tickets;
}