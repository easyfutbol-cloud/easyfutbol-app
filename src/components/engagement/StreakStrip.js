import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';

// Tira de la portada con la racha y los EasyPoints; lleva a Retos.
export default function StreakStrip({ navigation, enabled }) {
  const [data, setData] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let active = true;
      api.get('/easypoints/me')
        .then((res) => { if (active) setData(res.data); })
        .catch(() => {});
      return () => { active = false; };
    }, [enabled])
  );

  if (!enabled || !data) return null;
  const { streak, balance, challenges = [] } = data;
  const pending = challenges.filter((c) => !c.completed).length;
  const headline = streak.current
    ? `${streak.current} ${streak.current === 1 ? 'semana' : 'semanas'} seguidas`
    : 'Empieza tu racha';
  const sub = streak.at_risk
    ? 'Juega esta semana para no perderla'
    : streak.current
      ? 'Racha a salvo esta semana'
      : 'Juega un partido esta semana';

  return (
    <TouchableOpacity style={[styles.strip, streak.at_risk && styles.stripRisk]} onPress={() => navigation.navigate('Challenges')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${headline}. ${balance} EasyPoints. Abrir retos`}>
      <View style={styles.flame}><Ionicons name="flame" size={22} color={streak.current ? '#ff5a00' : '#6d7078'} /></View>
      <View style={styles.copy}>
        <Text style={styles.title}>{headline}</Text>
        <Text style={[styles.sub, streak.at_risk && styles.subRisk]}>{sub}{pending ? ` · ${pending} retos por hacer` : ''}</Text>
      </View>
      <View style={styles.points}>
        <Text style={styles.pointsValue}>{balance}</Text>
        <Text style={styles.pointsLabel}>EASYPOINTS</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#777" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#15171c', borderWidth: 1, borderColor: 'rgba(255,90,0,.28)', marginBottom: 16 },
  stripRisk: { borderColor: 'rgba(255,90,0,.7)' },
  flame: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,90,0,.12)', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { color: '#fff', fontSize: 15, fontWeight: '900' },
  sub: { color: '#8d9097', fontSize: 11, marginTop: 2 },
  subRisk: { color: '#ff7a32', fontWeight: '700' },
  points: { alignItems: 'flex-end' },
  pointsValue: { color: '#fff', fontSize: 17, fontWeight: '900' },
  pointsLabel: { color: '#70737a', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
});
