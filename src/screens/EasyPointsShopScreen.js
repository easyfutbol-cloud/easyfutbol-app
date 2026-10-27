import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { SocialAvatar } from '../components/social/SocialComponents';
import { FramedAvatar, PlayerTitleBadge } from '../components/engagement/Cosmetics';
import { colors, spacing } from '../theme';

const SECTIONS = [
  { type: 'frame', title: 'Marcos de avatar', hint: 'Un aro de color alrededor de tu foto.' },
  { type: 'title', title: 'Títulos', hint: 'Aparecen debajo de tu nombre en tu perfil.' },
];

function ItemTile({ item, balance, me, busy, onPress }) {
  const missing = item.price - balance;
  const label = item.equipped ? 'Puesto' : item.owned ? 'Ponérmelo' : missing > 0 ? `Faltan ${missing}` : `Canjear · ${item.price}`;
  return (
    <TouchableOpacity style={[styles.tile, item.equipped && styles.tileOn]} onPress={() => onPress(item)} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${item.name}. ${label}`}>
      <View style={styles.tilePreview}>
        {item.type === 'frame' ? (
          <FramedAvatar frame={item} size={52}><SocialAvatar uri={me.avatar_url} name={me.name} size={52} /></FramedAvatar>
        ) : (
          <PlayerTitleBadge title={{ label: item.name }} style={{ marginTop: 0 }} />
        )}
      </View>
      <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
      <View style={[styles.tileAction, item.equipped && styles.tileActionOn, !item.owned && missing > 0 && styles.tileActionLocked]}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : (
          <>
            {!item.owned ? <Ionicons name={missing > 0 ? 'lock-closed' : 'sparkles'} size={11} color={missing > 0 ? '#8d9097' : '#050505'} /> : null}
            <Text style={[styles.tileActionText, (item.equipped || (!item.owned && missing <= 0)) && styles.tileActionTextDark]}>{label}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function EasyPointsShopScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [me, setMe] = useState({});
  const [busyCode, setBusyCode] = useState(null);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('user');
      if (raw) setMe(JSON.parse(raw));
    } catch {}
    try {
      const res = await api.get('/easypoints/shop');
      setData(res.data);
    } catch (e) {
      Alert.alert('Tienda', e?.response?.data?.msg || 'No se pudo cargar la tienda');
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (item, request) => {
    try {
      setBusyCode(item.code);
      await request();
      await load();
    } catch (e) {
      Alert.alert(item.name, e?.response?.data?.msg || 'No se pudo completar');
    } finally {
      setBusyCode(null);
    }
  };

  const onPressItem = (item) => {
    if (item.equipped) {
      run(item, () => api.post('/easypoints/equip', { type: item.type, code: null }));
    } else if (item.owned) {
      run(item, () => api.post('/easypoints/equip', { type: item.type, code: item.code }));
    } else if (item.price > data.balance) {
      Alert.alert(item.name, `Te faltan ${item.price - data.balance} EasyPoints. Completa retos para conseguirlos.`);
    } else {
      Alert.alert(`Canjear ${item.name}`, `Cuesta ${item.price} EasyPoints. Te quedarán ${data.balance - item.price}.`, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Canjear', onPress: () => run(item, () => api.post(`/easypoints/shop/${item.code}/buy`)) },
      ]);
    }
  };

  const back = (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" style={styles.back} onPress={() => navigation.goBack()}>
      <Ionicons name="chevron-back" size={22} color="#fff" />
    </TouchableOpacity>
  );

  if (!data) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.orange} /></View>;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader eyebrow="EASYPOINTS" title="Personaliza tu perfil" description="Canjea tus EasyPoints por marcos y títulos." action={back} />

      <View style={styles.preview}>
        <FramedAvatar frame={data.equipped?.frame} size={84}><SocialAvatar uri={me.avatar_url} name={me.name} size={84} /></FramedAvatar>
        <Text style={styles.previewName}>{me.name || 'Tu nombre'}</Text>
        <PlayerTitleBadge title={data.equipped?.title} />
        <View style={styles.balancePill}>
          <Ionicons name="sparkles" size={14} color={colors.orange} />
          <Text style={styles.balanceText}>{data.balance} EasyPoints</Text>
        </View>
      </View>

      {SECTIONS.map((section) => (
        <View key={section.type} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionHint}>{section.hint}</Text>
          <View style={styles.grid}>
            {data.items.filter((item) => item.type === section.type).map((item) => (
              <ItemTile key={item.code} item={item} balance={data.balance} me={me} busy={busyCode === item.code} onPress={onPressItem} />
            ))}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.earn} onPress={() => navigation.navigate('Challenges')} accessibilityRole="button">
        <Ionicons name="flag-outline" size={16} color={colors.orange} />
        <Text style={styles.earnText}>Ver retos para ganar más EasyPoints</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(2), paddingBottom: 120 },
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191c22', borderWidth: 1, borderColor: '#30343c' },
  preview: { alignItems: 'center', backgroundColor: '#15171c', borderRadius: 24, paddingVertical: 22, borderWidth: 1, borderColor: '#252830', marginBottom: 22 },
  previewName: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 12 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: 'rgba(255,90,0,.1)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  balanceText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  section: { marginBottom: 20 },
  sectionTitle: { color: '#fff', fontSize: 19, fontWeight: '900' },
  sectionHint: { color: '#7d8088', fontSize: 12, marginTop: 3, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, minWidth: 100, backgroundColor: '#15171c', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: '#252830', alignItems: 'center' },
  tileOn: { borderColor: colors.orange },
  tilePreview: { height: 66, alignItems: 'center', justifyContent: 'center' },
  tileName: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 6 },
  tileAction: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: colors.orange, minHeight: 26 },
  tileActionOn: { backgroundColor: '#fff' },
  tileActionLocked: { backgroundColor: '#24272e' },
  tileActionText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  tileActionTextDark: { color: '#050505' },
  earn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  earnText: { color: colors.orange, fontWeight: '800', fontSize: 13 },
});
