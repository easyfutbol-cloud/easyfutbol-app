import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import PlayerStatsShareModal from './PlayerStatsShareCard';
import RepeatMatchCard from './retention/RepeatMatchCard';
import { MIN_MATCHES_FOR_REVIEW, maybeAskForReview } from '../utils/storeReview';

// Solo saltan solas las tarjetas de partidos recientes: un acta publicada
// semanas después no debería interrumpir al abrir la app.
const MAX_AGE_MS = 72 * 60 * 60 * 1000;
const seenKey = (matchId) => `postMatchCardSeen:${matchId}`;

export async function wasPostMatchCardSeen(matchId) {
  try {
    return Boolean(await AsyncStorage.getItem(seenKey(matchId)));
  } catch {
    return false;
  }
}

export async function markPostMatchCardSeen(matchId) {
  try {
    await AsyncStorage.setItem(seenKey(matchId), '1');
  } catch {}
}

// Se monta en la portada. Cuando el acta de tu último partido ya está
// publicada, abre directamente tu tarjeta de estadísticas (una vez por
// partido). `onSettled` avisa cuando ya no va a mostrar nada, para que los
// popups de la portada esperen su turno y no se abran dos modales a la vez.
export default function PostMatchCardHost({ enabled, onSettled, navigation }) {
  const [card, setCard] = useState(null);
  const checkingRef = useRef(false);
  const settledRef = useRef(false);

  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;
    onSettled?.();
  }, [onSettled]);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    let found = false;
    try {
      if (!(await AsyncStorage.getItem('user'))) return;
      // Pedimos unos pocos para saber también si ya lleva partidos suficientes para pedir valoración.
      const history = await api.get('/stats/me/history', { params: { limit: MIN_MATCHES_FOR_REVIEW } });
      const recent = history.data?.data || [];
      const last = recent[0];
      if (!last?.match_id) return;
      const startsAt = new Date(last.starts_at).getTime();
      if (!Number.isFinite(startsAt) || Date.now() - startsAt > MAX_AGE_MS) return;
      if (await wasPostMatchCardSeen(last.match_id)) return;

      const summary = await api.get(`/matches/${last.match_id}/post-match`);
      const data = summary.data?.data;
      if (!data?.personal) return;
      await markPostMatchCardSeen(last.match_id);
      found = true;
      setCard({ match: data.match, personal: data.personal, nextMatch: data.next_match || null, matchesPlayed: recent.length });
    } catch {
      // Sin red o sin acta: ya saldrá en la siguiente apertura.
    } finally {
      checkingRef.current = false;
      if (!found) settle();
    }
  }, [settle]);

  useEffect(() => {
    if (!enabled) return undefined;
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [enabled, check]);

  const dismiss = useCallback(() => {
    setCard(null);
    settle();
  }, [settle]);

  const close = useCallback(() => {
    const closing = card;
    dismiss();
    // Tras cerrar la tarjeta, y con margen para que termine la animación del modal.
    if (closing) setTimeout(() => maybeAskForReview(closing), 600);
  }, [card, dismiss]);

  // Si se apunta al partido de la semana que viene no le interrumpimos con la valoración.
  const repeat = useCallback((next) => {
    dismiss();
    navigation?.navigate('Match', { matchId: Number(next.id) });
  }, [dismiss, navigation]);

  if (!card) return null;
  const { match, personal, nextMatch } = card;
  return (
    <PlayerStatsShareModal
      visible={Boolean(enabled)}
      onClose={close}
      title="¡Ya están tus estadísticas!"
      footer={nextMatch && navigation ? <RepeatMatchCard match={nextMatch} onPress={repeat} /> : null}
      name={personal.name}
      avatarUrl={personal.avatar_url}
      goals={personal.goals}
      assists={personal.assists}
      isMvp={personal.is_mvp}
      date={match?.starts_at}
    />
  );
}
