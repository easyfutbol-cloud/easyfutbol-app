import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { SocialAvatar } from '../components/social/SocialComponents';
import {
  ADMIN_DEFAULT_LEAGUE_MEMBERS, ADMIN_MAX_LEAGUE_MEMBERS, ADMIN_MEMBERS_OPTIONS, ADMIN_MEMBERS_STEP, ADMIN_MIN_LEAGUE_MEMBERS, DEFAULT_LEAGUE_RULES, DURATION_OPTIONS, FORMATS, LEAGUE_PRESETS, MAX_LEAGUE_MEMBERS, MATCHES_MAX, MATCHES_MIN, MATCHES_OPTIONS,
  POINTS_MAX, POINTS_MIN, RULE_FIELDS, exampleMatchText, isAdminUser, presetKeyFor,
} from '../utils/friendLeagueRules';

// Crear una liga o cambiar una que aún no ha empezado. Al empezar, las reglas quedan fijas.
export default function FriendLeagueEditScreen({ navigation, route }) {
  const leagueId = route.params?.leagueId ? Number(route.params.leagueId) : null;
  const [loading, setLoading] = useState(Boolean(leagueId));
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [teamSize, setTeamSize] = useState(1);
  const [matchesGoal, setMatchesGoal] = useState(10);
  const [durationDays, setDurationDays] = useState(60);
  const [rules, setRules] = useState(DEFAULT_LEAGUE_RULES);
  const [friends, setFriends] = useState([]);
  const [selected, setSelected] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [adminMaxMembers, setAdminMaxMembers] = useState(ADMIN_DEFAULT_LEAGUE_MEMBERS);
  const maxMembers = isAdmin ? adminMaxMembers : MAX_LEAGUE_MEMBERS;

  useEffect(() => {
    AsyncStorage.getItem('user').then((raw) => {
      if (raw && isAdminUser(JSON.parse(raw))) setIsAdmin(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (leagueId) {
      api.get(`/friend-leagues/${leagueId}`).then(({ data }) => {
        setName(data.league.name);
        setTeamSize(data.league.team_size);
        setMatchesGoal(data.league.matches_goal);
        setDurationDays(data.league.duration_days);
        setRules(data.league.rules);
        setIsPublic(Boolean(data.league.is_public));
        setAdminMaxMembers(data.league.max_members || ADMIN_DEFAULT_LEAGUE_MEMBERS);
      }).catch((error) => {
        Alert.alert('Liga', error.response?.data?.msg || 'No se pudo cargar la liga');
        navigation.goBack();
      }).finally(() => setLoading(false));
    } else {
      api.get('/social/friends?limit=50').then(({ data }) => setFriends(data?.items || [])).catch(() => setFriends([]));
    }
  }, [leagueId, navigation]);

  const presetKey = presetKeyFor(rules);
  const setPoints = (key, delta) => setRules((current) => ({
    ...current,
    [key]: Math.min(POINTS_MAX, Math.max(POINTS_MIN, current[key] + delta)),
  }));
  const toggleFriend = (id) => {
    if (!selected.includes(id) && selected.length + 1 >= maxMembers) {
      Alert.alert('Liga', `Una liga puede tener hasta ${maxMembers} jugadores, contándote a ti.`);
      return;
    }
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const save = async () => {
    const body = { name: name.trim(), team_size: teamSize, matches_goal: matchesGoal, duration_days: durationDays, rules, ...(isAdmin ? { is_public: isPublic, max_members: adminMaxMembers } : {}) };
    setSaving(true);
    try {
      if (leagueId) {
        await api.patch(`/friend-leagues/${leagueId}`, body);
        navigation.goBack();
      } else {
        const { data } = await api.post('/friend-leagues', { ...body, friend_ids: selected });
        navigation.replace('FriendLeagueDetail', { leagueId: data.id });
      }
    } catch (error) {
      Alert.alert('Liga', error.response?.data?.msg || 'No se pudo guardar la liga');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.page}><ActivityIndicator color="#ff5a00" style={styles.loader}/></View>;

  return <View style={styles.page}>
    <View style={styles.header}>
      <ScreenHeader
        eyebrow="LIGA ENTRE AMIGOS"
        title={leagueId ? 'Editar liga' : 'Nueva liga'}
        description="Las reglas quedan fijas al empezar."
        action={<TouchableOpacity accessibilityLabel="Volver" style={styles.backButton} onPress={() => navigation.goBack()}><Ionicons name="arrow-back" color="#fff" size={20}/></TouchableOpacity>}
      />
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Section icon="create-outline" title="Nombre">
        <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Los del jueves" placeholderTextColor="#666" style={styles.input}/>
      </Section>

      {isAdmin ? <View style={[styles.section, styles.doubleCard]}>
        <View style={styles.publicIcon}><Ionicons name="earth" color="#7fb0ff" size={18}/></View>
        <View style={styles.doubleCopy}>
          <Text style={styles.ruleLabel}>Liga pública</Text>
          <Text style={styles.doubleBody}>Todos pueden verla y unirse, con un enlace para compartir. Solo pueden crearla los administradores y es individual.</Text>
        </View>
        <Switch value={isPublic} onValueChange={(value) => { setIsPublic(value); if (value) setTeamSize(1); }} trackColor={{ true: '#ff5a00', false: '#3a3a40' }} thumbColor="#fff"/>
      </View> : null}

      {isAdmin ? <Section icon="resize-outline" title="Máximo de jugadores" hint={`Cuenta al creador y a los invitados. Se puede cambiar hasta que empiece la liga. Solo los administradores pueden elegirlo.`}>
        <View style={styles.spread}>
          <View style={styles.row}>
            {ADMIN_MEMBERS_OPTIONS.map((value) => <Choice key={value} label={String(value)} active={adminMaxMembers === value} onPress={() => setAdminMaxMembers(value)}/>)}
          </View>
          <Stepper
            value={adminMaxMembers}
            onMinus={() => setAdminMaxMembers(Math.max(ADMIN_MIN_LEAGUE_MEMBERS, adminMaxMembers - ADMIN_MEMBERS_STEP))}
            onPlus={() => setAdminMaxMembers(Math.min(ADMIN_MAX_LEAGUE_MEMBERS, adminMaxMembers + ADMIN_MEMBERS_STEP))}
          />
        </View>
      </Section> : null}

      <Section icon="people-outline" title="Cómo se juega" hint={teamSize > 1 ? 'Cada uno juega sus partidos por su cuenta y se suman los puntos del equipo. No hace falta coincidir.' : null}>
        <View style={styles.formats}>
          {FORMATS.map((format) => {
            const active = teamSize === format.size;
            const locked = isPublic && format.size !== 1;
            return <TouchableOpacity key={format.size} disabled={locked} onPress={() => setTeamSize(format.size)} style={[styles.format, active && styles.choiceOn, locked && styles.formatLocked]} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <Ionicons name={format.icon} color={active ? '#fff' : '#a5a8ae'} size={22}/>
              <Text style={[styles.choiceText, active && styles.choiceTextOn]}>{format.label}</Text>
            </TouchableOpacity>;
          })}
        </View>
      </Section>

      <Section icon="football-outline" title="Partidos de la liga" hint={`A cada jugador le cuentan sus próximos ${matchesGoal} partidos desde que empiece la liga.`}>
        <View style={styles.spread}>
          <View style={styles.row}>
            {MATCHES_OPTIONS.map((value) => <Choice key={value} label={String(value)} active={matchesGoal === value} onPress={() => setMatchesGoal(value)}/>)}
          </View>
          <Stepper value={matchesGoal} onMinus={() => setMatchesGoal(Math.max(MATCHES_MIN, matchesGoal - 1))} onPlus={() => setMatchesGoal(Math.min(MATCHES_MAX, matchesGoal + 1))}/>
        </View>
      </Section>

      <Section icon="time-outline" title="Tiempo para jugarlos" hint="Al acabar el plazo gana quien tenga más puntos, aunque alguien no haya jugado todos sus partidos.">
        <View style={styles.row}>
          {DURATION_OPTIONS.map((value) => <Choice key={value} label={`${value} días`} active={durationDays === value} onPress={() => setDurationDays(value)}/>)}
        </View>
      </Section>

      <Section icon="trophy-outline" title="Puntos">
        <View style={styles.presets}>
          {LEAGUE_PRESETS.map((preset) => {
            const active = presetKey === preset.key;
            return <TouchableOpacity key={preset.key} onPress={() => setRules((current) => ({ ...current, ...preset.values }))} style={[styles.preset, active && styles.presetOn]} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <Text style={[styles.presetTitle, active && styles.choiceTextOn]}>{preset.label}</Text>
              <Text style={[styles.presetHint, active && styles.presetHintOn]}>{preset.hint}</Text>
            </TouchableOpacity>;
          })}
        </View>
        {!presetKey ? <Text style={styles.custom}>Reglas personalizadas</Text> : null}
        {RULE_FIELDS.map((field, index) => <View key={field.key} style={[styles.ruleRow, index > 0 && styles.divider]}>
          <View style={styles.ruleIcon}><Ionicons name={field.icon} color="#ff7a32" size={16}/></View>
          <Text style={styles.ruleLabel}>{field.label}</Text>
          {rules[field.key] === 0 ? <Text style={styles.ruleOff}>No cuenta</Text> : null}
          <Stepper value={rules[field.key]} onMinus={() => setPoints(field.key, -1)} onPlus={() => setPoints(field.key, 1)}/>
        </View>)}
        <View style={styles.example}>
          <Ionicons name="bulb-outline" color="#ffb020" size={16}/>
          <Text style={styles.exampleText}>{exampleMatchText(rules)}</Text>
        </View>
      </Section>

      <View style={[styles.section, styles.doubleCard]}>
        <View style={styles.doubleIcon}><Ionicons name="flash" color="#ffb020" size={18}/></View>
        <View style={styles.doubleCopy}>
          <Text style={styles.ruleLabel}>Victoria doble contra rivales</Text>
          <Text style={styles.doubleBody}>Ganar a alguien de la liga que juega enfrente vale el doble de puntos de victoria. Contra tu compañero no cuenta.</Text>
        </View>
        <Switch value={rules.double_vs_rivals} onValueChange={(value) => setRules((current) => ({ ...current, double_vs_rivals: value }))} trackColor={{ true: '#ff5a00', false: '#3a3a40' }} thumbColor="#fff"/>
      </View>

      {!leagueId ? <Section icon="person-add-outline" title={selected.length ? `Invitar amigos · ${selected.length}` : 'Invitar amigos'} hint={friends.length ? `Hasta ${maxMembers} jugadores en la liga, contándote a ti.` : 'Aún no tienes amigos en EasyFutbol. Podrás invitarlos cuando los añadas.'}>
        {friends.map((friend, index) => {
          const active = selected.includes(friend.id);
          return <TouchableOpacity key={friend.id} style={[styles.friend, index > 0 && styles.divider]} onPress={() => toggleFriend(friend.id)} accessibilityRole="checkbox" accessibilityState={{ checked: active }}>
            <SocialAvatar uri={friend.avatar_url} name={friend.name} size={34}/>
            <Text numberOfLines={1} style={[styles.friendName, friend.is_plus ? styles.plusName : null]}>{friend.name}</Text>
            <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} color={active ? '#ff5a00' : '#555'} size={23}/>
          </TouchableOpacity>;
        })}
      </Section> : null}

      <TouchableOpacity disabled={saving} style={[styles.save, saving && styles.saveBusy]} onPress={save} accessibilityRole="button">
        {saving ? <ActivityIndicator color="#fff"/> : <Text style={styles.saveText}>{leagueId ? 'Guardar cambios' : 'Crear liga'}</Text>}
      </TouchableOpacity>
    </ScrollView>
  </View>;
}

function Section({ icon, title, hint, children }) {
  return <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} color="#ff7a32" size={16}/>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    {children}
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>;
}

function Choice({ label, active, onPress }) {
  return <TouchableOpacity onPress={onPress} style={[styles.choice, active && styles.choiceOn]} accessibilityRole="button" accessibilityState={{ selected: active }}>
    <Text style={[styles.choiceText, active && styles.choiceTextOn]}>{label}</Text>
  </TouchableOpacity>;
}

function Stepper({ value, onMinus, onPlus }) {
  return <View style={styles.stepper}>
    <TouchableOpacity onPress={onMinus} style={styles.stepButton} hitSlop={6} accessibilityLabel="Restar"><Ionicons name="remove" color="#fff" size={16}/></TouchableOpacity>
    <Text style={[styles.stepValue, value < 0 && styles.stepNegative]}>{value}</Text>
    <TouchableOpacity onPress={onPlus} style={styles.stepButton} hitSlop={6} accessibilityLabel="Sumar"><Ionicons name="add" color="#fff" size={16}/></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0b0b0d' },
  header: { paddingHorizontal: 16 },
  loader: { marginTop: 80 },
  content: { padding: 16, paddingTop: 2, paddingBottom: 110, gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#202024', alignItems: 'center', justifyContent: 'center' },
  section: { padding: 14, borderRadius: 19, backgroundColor: '#17171a', borderWidth: 1, borderColor: '#26262b' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 11 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  hint: { color: '#85878d', fontSize: 12, marginTop: 10, lineHeight: 17 },
  input: { height: 48, borderRadius: 13, paddingHorizontal: 14, backgroundColor: '#212125', color: '#fff', fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
  spread: { gap: 11, alignItems: 'flex-start' },
  formats: { flexDirection: 'row', gap: 8 },
  format: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: 12, borderRadius: 14, backgroundColor: '#212125' },
  formatLocked: { opacity: 0.35 },
  publicIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(127,176,255,.14)', alignItems: 'center', justifyContent: 'center' },
  choice: { minHeight: 38, paddingHorizontal: 13, borderRadius: 12, backgroundColor: '#212125', alignItems: 'center', justifyContent: 'center' },
  choiceOn: { backgroundColor: '#ff5a00' },
  choiceText: { color: '#a5a8ae', fontSize: 13, fontWeight: '900' },
  choiceTextOn: { color: '#fff' },
  presets: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  preset: { flex: 1, padding: 10, minHeight: 62, borderRadius: 13, backgroundColor: '#212125' },
  presetOn: { backgroundColor: '#ff5a00' },
  presetTitle: { color: '#d4d4d7', fontSize: 12, fontWeight: '900' },
  presetHint: { color: '#85878d', fontSize: 10, fontWeight: '600', marginTop: 3 },
  presetHintOn: { color: 'rgba(255,255,255,.85)' },
  custom: { color: '#ff8b4b', fontSize: 11, fontWeight: '800', marginTop: 2, marginBottom: 2 },
  divider: { borderTopWidth: 1, borderTopColor: '#26262b' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  ruleIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,90,0,.13)', alignItems: 'center', justifyContent: 'center' },
  ruleLabel: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  ruleOff: { color: '#7c7e85', fontSize: 11, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stepButton: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#2c2c31', alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 28, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '900' },
  stepNegative: { color: '#e5484d' },
  example: { flexDirection: 'row', gap: 8, padding: 11, marginTop: 8, borderRadius: 12, backgroundColor: 'rgba(255,176,32,.09)' },
  exampleText: { flex: 1, color: '#e7d7b4', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  doubleCard: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  doubleIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,176,32,.13)', alignItems: 'center', justifyContent: 'center' },
  doubleCopy: { flex: 1 },
  doubleBody: { color: '#85878d', fontSize: 12, marginTop: 3, lineHeight: 16 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  friendName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  plusName: { color: '#F4C95D' },
  save: { marginTop: 6, height: 54, borderRadius: 16, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  saveBusy: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
