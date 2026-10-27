import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../api/client';
import MatchFeedbackCard from './MatchFeedbackCard';

// Portada: pide valorar el último partido jugado (de los últimos 4 días)
// mientras no se haya valorado ni descartado.
export default function MatchFeedbackPrompt({ enabled }) {
  const [match, setMatch] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let active = true;
      api.get('/me/match-feedback/pending')
        .then((res) => { if (active) setMatch(res.data?.match || null); })
        .catch(() => {});
      return () => { active = false; };
    }, [enabled])
  );

  if (!enabled || !match) return null;
  return <MatchFeedbackCard key={match.id} match={match} onDone={() => setMatch(null)} style={{ marginBottom: 16 }} />;
}
