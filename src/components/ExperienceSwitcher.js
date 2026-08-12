import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isLeagueRoute } from '../navigation/leagueNavigation';

export default function ExperienceSwitcher({ currentRouteName, onSwitch }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  if (currentRouteName !== 'Home' && currentRouteName !== 'LeagueHome') return null;
  const league = isLeagueRoute(currentRouteName);
  const top = (insets.top || (Platform.OS === 'android' ? 24 : 0)) + 8;
  const choose = (route) => { setOpen(false); onSwitch(route); };

  return (
    <>
      <Pressable accessibilityLabel="Cambiar entre EasyFutbol y EasyFutbol League" onPress={() => setOpen(true)} style={[styles.trigger, !league && styles.compactTrigger, { top }]}>
        <View style={[styles.mark, league && styles.leagueMark]} />
        <Text numberOfLines={1} style={[styles.triggerText, !league && styles.compactText]}>{league ? 'EasyFutbol League' : 'EF'}</Text>
        <Ionicons name="chevron-down" size={league ? 14 : 12} color="#aaa" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.panel, { top: top + 46 }]}>
            <Text style={styles.caption}>ELIGE TU EXPERIENCIA</Text>
            <Option icon="football-outline" title="EasyFutbol" subtitle="Partidos y comunidad" selected={!league} onPress={() => choose('Home')} />
            <Option icon="trophy-outline" title="EasyFutbol League" subtitle="Temporada piloto · acceso abierto" selected={league} onPress={() => choose('LeagueHome')} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function Option({ icon, title, subtitle, selected, onPress }) {
  return <Pressable onPress={onPress} style={[styles.option, selected && styles.selected]}>
    <View style={styles.optionIcon}><Ionicons name={icon} size={20} color="#ff5a00" /></View>
    <View style={{ flex: 1 }}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
    {selected && <Ionicons name="checkmark-circle" size={20} color="#ff5a00" />}
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: { position: 'absolute', left: 12, zIndex: 1100, height: 40, maxWidth: 205, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, backgroundColor: 'rgba(15,15,18,0.96)', borderWidth: 1, borderColor: '#303035', borderRadius: 14 },
  compactTrigger: { width: 72, paddingHorizontal: 9, gap: 6, backgroundColor: 'rgba(15,15,18,.9)' },
  mark: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff5a00' },
  leagueMark: { backgroundColor: '#ffb000' },
  triggerText: { flexShrink: 1, color: '#fff', fontSize: 13, fontWeight: '800' },
  compactText: { fontSize: 12, letterSpacing: .4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.64)' },
  panel: { position: 'absolute', left: 12, right: 12, padding: 12, backgroundColor: '#141417', borderWidth: 1, borderColor: '#303035', borderRadius: 20 },
  caption: { color: '#777', fontSize: 10, fontWeight: '900', letterSpacing: 1.2, margin: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: 'transparent' },
  selected: { backgroundColor: 'rgba(255,90,0,.08)', borderColor: 'rgba(255,90,0,.3)' },
  optionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#24160f', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  subtitle: { color: '#888', fontSize: 12, marginTop: 2 },
});
