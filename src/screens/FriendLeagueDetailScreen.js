import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import PlayerCard from '../components/profile/PlayerCard';
import { SocialAvatar } from '../components/social/SocialComponents';
import { LeagueHero, LeaguePodium, LeagueRules, StandingRow } from '../components/social/FriendLeagueParts';
import FriendLeagueShareModal from '../components/social/FriendLeagueShareCard';
import { DEMO_LEAGUE_DETAIL } from '../utils/friendLeagueDemo';
import { formatLabel, playerShortName, shuffleTeams, syncTeams, teamsAreComplete, toggleTeamMember } from '../utils/friendLeagueRules';

const TEAM_CARD_WIDTH = 104;

export default function FriendLeagueDetailScreen({ navigation, route }) {
  const demo = route.params?.demo === true;
  const paramId = Number(route.params?.leagueId) || null;
  // Desde un enlace de unión llega el código, y con él se busca la liga.
  const code = route.params?.code;
  const [codeId, setCodeId] = useState(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const leagueId = paramId || codeId;
  const [data, setData] = useState(demo ? DEMO_LEAGUE_DETAIL : null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rawTeams, setRawTeams] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [friends, setFriends] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const back = () => navigation.navigate('Social', { tab: 'leagues' });
  useEffect(() => { setCodeId(null); }, [code]);
  const load = useCallback(async () => {
    if (demo) { setRefreshing(false); return; }
    try {
      let id = paramId;
      if (!id && code) {
        const found = await api.get(`/friend-leagues/by-code/${encodeURIComponent(code)}`);
        id = found.data.id;
        setCodeId(id);
      }
      const response = await api.get(`/friend-leagues/${id}`);
      setData(response.data);
      setNeedsAuth(false);
    } catch (error) {
      if (error.response?.status === 401) { setNeedsAuth(true); return; }
      Alert.alert('Liga', error.response?.data?.msg || 'No se pudo cargar la liga');
      navigation.navigate('Social', { tab: 'leagues' });
    } finally {
      setRefreshing(false);
    }
  }, [demo, paramId, code, navigation]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const acceptedMembers = useMemo(() => (data?.members || []).filter((member) => member.status === 'accepted'), [data?.members]);
  const acceptedIds = useMemo(() => acceptedMembers.map((member) => member.user_id), [acceptedMembers]);
  const teamSize = data?.league?.team_size || 1;
  const { teams, unassigned } = useMemo(() => syncTeams(rawTeams, acceptedIds, teamSize), [rawTeams, acceptedIds, teamSize]);
  const memberById = useMemo(() => new Map((data?.members || []).map((member) => [member.user_id, member])), [data?.members]);

  const run = async (task, errorMessage) => {
    setBusy(true);
    try { await task(); await load(); }
    catch (error) { Alert.alert('Liga', error.response?.data?.msg || errorMessage); }
    finally { setBusy(false); }
  };

  if (needsAuth) return <View style={[styles.page, styles.authPage]}>
    <Ionicons name="trophy" color="#ff5a00" size={44}/>
    <Text style={styles.authTitle}>Inicia sesión para ver esta liga</Text>
    <Text style={styles.authBody}>Después vuelve a abrir el enlace para unirte.</Text>
    <TouchableOpacity style={styles.authButton} onPress={() => navigation.navigate('Access')} accessibilityRole="button"><Text style={styles.primaryText}>Iniciar sesión</Text></TouchableOpacity>
  </View>;
  if (!data) return <View style={styles.page}><ActivityIndicator color="#ff5a00" style={styles.loader}/></View>;
  const { league, me, members, standings } = data;
  const isDraft = league.status === 'draft';
  const invited = me.status === 'invited';
  const invitedCount = members.length - acceptedMembers.length;
  const canStart = teamSize === 1 ? acceptedIds.length >= 2 : !unassigned.length && teamsAreComplete(teams, teamSize);
  const openPlayer = demo ? null : (userId) => navigation.navigate('PlayerSocialProfile', { userId });

  const respond = (accept) => run(async () => {
    await api.post(`/friend-leagues/${leagueId}/respond`, { accept });
    if (!accept) back();
  }, 'No se pudo responder a la invitación');

  const join = () => run(() => api.post(`/friend-leagues/${leagueId}/join`), 'No se pudo unir a la liga');
  const shareLink = () => Share.share({ message: `🏆 Únete a la liga "${league.name}" en EasyFutbol: ${data.join_url}` }).catch(() => {});

  const openInvite = async () => {
    try {
      const response = await api.get('/social/friends?limit=50');
      const inside = new Set(members.map((member) => member.user_id));
      setFriends((response.data?.items || []).filter((friend) => !inside.has(friend.id)));
      setInviteOpen(true);
    } catch { Alert.alert('Liga', 'No se pudieron cargar tus amigos'); }
  };
  const invite = (friend) => run(async () => {
    await api.post(`/friend-leagues/${leagueId}/invite`, { user_ids: [friend.id] });
    setFriends((current) => current.filter((item) => item.id !== friend.id));
  }, 'No se pudo enviar la invitación');

  const removeMember = (member) => Alert.alert('Quitar de la liga', `¿Quieres quitar a ${member.name}?`, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Quitar', style: 'destructive', onPress: () => run(() => api.delete(`/friend-leagues/${leagueId}/members/${member.user_id}`), 'No se pudo quitar al jugador') },
  ]);

  const start = () => Alert.alert('Empezar la liga', invitedCount
    ? `Las reglas quedarán fijas y ${invitedCount === 1 ? 'el invitado que no ha aceptado se quedará fuera' : `los ${invitedCount} invitados que no han aceptado se quedarán fuera`}.`
    : 'Las reglas quedarán fijas y desde ahora contarán vuestros partidos.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Empezar', onPress: () => run(() => api.post(`/friend-leagues/${leagueId}/start`, teamSize > 1 ? { teams } : {}), 'No se pudo empezar la liga') },
  ]);

  const leaveOrDelete = () => {
    const owner = me.is_owner;
    Alert.alert(owner ? 'Eliminar liga' : 'Salir de la liga', owner ? 'Se eliminará la liga para todos sus jugadores.' : 'Dejarás de competir y saldrás de la clasificación.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: owner ? 'Eliminar' : 'Salir', style: 'destructive', onPress: async () => {
        try {
          if (owner) await api.delete(`/friend-leagues/${leagueId}`);
          else await api.post(`/friend-leagues/${leagueId}/leave`);
          back();
        } catch (error) { Alert.alert('Liga', error.response?.data?.msg || 'No se pudo completar'); }
      } },
    ]);
  };

  const myEntry = standings.find((entry) => entry.players.some((player) => player.user_id === me.user_id));
  const myLine = myEntry?.players.find((player) => player.user_id === me.user_id);
  const canLeave = !demo && !me.is_owner && me.status === 'accepted' && league.status !== 'finished' && (isDraft || teamSize === 1);

  return <View style={styles.page}>
    <View style={styles.header}>
      <ScreenHeader
        eyebrow={league.is_public ? 'LIGA PÚBLICA' : 'LIGA ENTRE AMIGOS'}
        title={league.name}
        description={`${formatLabel(teamSize)} · ${league.matches_goal} partidos · ${league.duration_days} días`}
        action={<TouchableOpacity accessibilityLabel="Volver a mis ligas" style={styles.iconButton} onPress={back}><Ionicons name="arrow-back" color="#fff" size={20}/></TouchableOpacity>}
      />
    </View>
    <ScrollView contentContainerStyle={styles.content} refreshControl={demo ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#ff5a00"/>}>
      {invited ? <View style={styles.inviteCard}>
        <Text style={styles.inviteTitle}>Te han invitado a esta liga</Text>
        <Text style={styles.inviteBody}>Si aceptas, los demás jugadores verán tus resultados, goles, asistencias, paradas y MVP de los partidos de la liga.</Text>
        <View style={styles.inviteActions}>
          <TouchableOpacity disabled={busy} style={styles.primary} onPress={() => respond(true)}><Text style={styles.primaryText}>Aceptar</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy} style={styles.secondary} onPress={() => respond(false)}><Text style={styles.secondaryText}>Rechazar</Text></TouchableOpacity>
        </View>
      </View> : <LeagueHero league={league} myEntry={myEntry} myLine={myLine} standings={standings} acceptedCount={acceptedMembers.length} invitedCount={invitedCount}/>}

      {data.can_join && !invited ? <View style={styles.joinCard}>
        <Text style={styles.inviteTitle}>Únete a esta liga</Text>
        <Text style={styles.inviteBody}>Si te unes, cualquiera podrá ver tus resultados, goles, asistencias, paradas y MVP de los partidos de la liga.</Text>
        <TouchableOpacity disabled={busy} style={styles.joinButton} onPress={join} accessibilityRole="button"><Ionicons name="add" color="#fff" size={20}/><Text style={styles.primaryText}>Unirme</Text></TouchableOpacity>
      </View> : null}

      {data.join_url ? <TouchableOpacity style={styles.linkButton} onPress={shareLink} accessibilityRole="button">
        <Ionicons name="link" color="#ff7a32" size={18}/>
        <Text style={styles.linkText}>Enviar enlace de unión</Text>
      </TouchableOpacity> : null}

      {demo ? <Text style={styles.demoNote}>Así se ve una liga en marcha. Los jugadores y los puntos son inventados.</Text> : null}

      {!isDraft && standings.length ? <>
        <LeaguePodium standings={standings} myUserId={me.user_id} onOpenPlayer={openPlayer}/>

        {teamSize > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
          {standings.flatMap((entry) => entry.players).map((player) => <TouchableOpacity key={player.user_id} activeOpacity={0.85} onPress={() => openPlayer?.(player.user_id)} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${player.name}`}>
            <PlayerCard compact card={player.card} name={player.name} nickname={player.nickname} avatarUrl={player.avatar_url} subtitle={`${player.points} pts`} nameColor={player.is_plus ? '#F4C95D' : undefined} width={TEAM_CARD_WIDTH}/>
          </TouchableOpacity>)}
        </ScrollView> : null}

        <SectionTitle title="CLASIFICACIÓN" icon="share-social-outline" action="Compartir" onPress={() => setShareOpen(true)}/>
        <View style={styles.card}>
          {standings.map((entry, index) => {
            const key = entry.players[0].user_id;
            const open = expanded === key;
            return <View key={key} style={index > 0 && styles.divider}>
              <StandingRow entry={entry} mine={entry === myEntry} open={open} teamSize={teamSize} onToggle={() => setExpanded(open ? null : key)}/>
            </View>;
          })}
        </View>
        <Text style={styles.hint}>Toca una fila para ver el detalle. El rayo marca las victorias contra rivales de la liga.</Text>
      </> : null}

      {isDraft && !invited ? <>
        <SectionTitle title={data.max_members ? `JUGADORES · ${members.length}/${data.max_members}` : 'JUGADORES'} icon={me.is_owner ? 'person-add-outline' : null} action={me.is_owner ? 'Invitar' : null} onPress={openInvite}/>
        <View style={styles.card}>
          {members.map((member, index) => <View key={member.user_id} style={[styles.memberRow, index > 0 && styles.divider]}>
            <SocialAvatar uri={member.avatar_url} name={member.name} size={38}/>
            <View style={styles.rowCopy}>
              <Text numberOfLines={1} style={[styles.rowName, member.is_plus ? styles.plusName : null]}>{member.name}</Text>
              <View style={styles.memberStatus}>
                <View style={[styles.statusDot, { backgroundColor: member.status === 'accepted' ? '#70c98a' : '#ffb020' }]}/>
                <Text style={styles.rowMeta}>{member.user_id === league.owner_id ? 'Creador' : member.status === 'accepted' ? 'Ha aceptado' : 'Invitación pendiente'}</Text>
              </View>
            </View>
            {me.is_owner && member.user_id !== me.user_id ? <TouchableOpacity onPress={() => removeMember(member)} hitSlop={8} accessibilityLabel={`Quitar a ${member.name}`}><Ionicons name="close-circle-outline" color="#777" size={22}/></TouchableOpacity> : null}
          </View>)}
        </View>

        {me.is_owner && teamSize > 1 ? <>
          <SectionTitle title={teamSize === 2 ? 'PAREJAS' : 'TRÍOS'} icon="shuffle" action="Al azar" onPress={() => setRawTeams(shuffleTeams(acceptedIds, teamSize))}/>
          {acceptedIds.length % teamSize !== 0 ? <Text style={styles.warning}>Con {acceptedIds.length} jugadores no salen {teamSize === 2 ? 'parejas' : 'tríos'} completos.</Text> : null}
          {teams.map((team, index) => <View key={index} style={[styles.team, team.length === teamSize && styles.teamFull]}>
            <View style={styles.teamHeader}>
              <Text style={styles.teamLabel}>Equipo {index + 1}</Text>
              <Text style={styles.teamCount}>{team.length}/{teamSize}</Text>
            </View>
            <View style={styles.teamPlayers}>
              {team.map((id) => <TeamChip key={id} active name={memberById.get(id)?.name} onPress={() => setRawTeams(toggleTeamMember(teams, id, teamSize))}/>)}
              {!team.length ? <Text style={styles.rowMeta}>Toca un jugador de abajo</Text> : null}
            </View>
          </View>)}
          {unassigned.length ? <View style={styles.team}>
            <Text style={styles.teamLabel}>Sin equipo</Text>
            <View style={[styles.teamPlayers, styles.unassigned]}>
              {unassigned.map((id) => <TeamChip key={id} name={memberById.get(id)?.name} onPress={() => setRawTeams(toggleTeamMember(teams, id, teamSize))}/>)}
            </View>
          </View> : null}
        </> : null}

        {me.is_owner
          ? <TouchableOpacity disabled={!canStart || busy} style={[styles.start, (!canStart || busy) && styles.startOff]} onPress={start} accessibilityRole="button"><Ionicons name="play" color="#fff" size={16}/><Text style={styles.primaryText}>Empezar la liga</Text></TouchableOpacity>
          : <Text style={styles.waiting}>Esperando a que el creador empiece la liga.</Text>}
        {me.is_owner && !canStart ? <Text style={styles.hint}>{teamSize === 1 ? 'Necesitas que al menos un amigo acepte.' : 'Necesitas al menos dos equipos completos, con todos colocados.'}</Text> : null}
      </> : null}

      <SectionTitle title="CÓMO SE PUNTÚA" icon={isDraft && me.is_owner ? 'pencil' : null} action={isDraft && me.is_owner ? 'Editar' : null} onPress={() => navigation.navigate('FriendLeagueEdit', { leagueId })}/>
      <LeagueRules rules={league.rules} matchesGoal={league.matches_goal}/>

      {demo ? <TouchableOpacity style={styles.demoCta} onPress={() => navigation.replace('FriendLeagueEdit')} accessibilityRole="button"><Ionicons name="add" color="#fff" size={20}/><Text style={styles.primaryText}>Crear mi liga</Text></TouchableOpacity> : null}
      {me.is_owner || canLeave ? <TouchableOpacity style={styles.danger} onPress={leaveOrDelete}><Text style={styles.dangerText}>{me.is_owner ? 'Eliminar liga' : 'Salir de la liga'}</Text></TouchableOpacity> : null}
    </ScrollView>

    <Modal visible={inviteOpen} transparent animationType="slide" onRequestClose={() => setInviteOpen(false)}>
      <View style={styles.overlay}><View style={styles.sheet}>
        <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Invitar amigos</Text><TouchableOpacity onPress={() => setInviteOpen(false)} accessibilityLabel="Cerrar"><Ionicons name="close" color="#fff" size={26}/></TouchableOpacity></View>
        <ScrollView>
          {!friends.length ? <Text style={styles.hint}>No quedan amigos por invitar.</Text> : null}
          {friends.map((friend) => <TouchableOpacity key={friend.id} disabled={busy} style={styles.memberRow} onPress={() => invite(friend)} accessibilityRole="button">
            <SocialAvatar uri={friend.avatar_url} name={friend.name} size={38}/>
            <Text numberOfLines={1} style={[styles.rowName, styles.rowCopy, friend.is_plus ? styles.plusName : null]}>{friend.name}</Text>
            <Ionicons name="add-circle" color="#ff5a00" size={24}/>
          </TouchableOpacity>)}
        </ScrollView>
      </View></View>
    </Modal>
    {shareOpen ? <FriendLeagueShareModal visible onClose={() => setShareOpen(false)} league={league} standings={standings}/> : null}
  </View>;
}

function SectionTitle({ title, icon, action, onPress }) {
  return <View style={styles.sectionRow}>
    <Text style={styles.section}>{title}</Text>
    {action ? <TouchableOpacity style={styles.sectionAction} onPress={onPress} accessibilityRole="button"><Ionicons name={icon} color="#ff7a32" size={15}/><Text style={styles.sectionActionText}>{action}</Text></TouchableOpacity> : null}
  </View>;
}

function TeamChip({ name, active, onPress }) {
  return <TouchableOpacity style={[styles.chip, active && styles.chipOn]} onPress={onPress} accessibilityRole="button">
    <Text numberOfLines={1} style={[styles.chipText, active && styles.chipTextOn]}>{playerShortName({ name })}</Text>
    <Ionicons name={active ? 'close' : 'add'} color={active ? '#fff' : '#a5a8ae'} size={14}/>
  </TouchableOpacity>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0b0b0d' },
  header: { paddingHorizontal: 16 },
  loader: { marginTop: 80 },
  content: { padding: 16, paddingTop: 2, paddingBottom: 110 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#202024', alignItems: 'center', justifyContent: 'center' },
  inviteCard: { padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,90,0,.10)', borderWidth: 1, borderColor: 'rgba(255,90,0,.4)', marginBottom: 4 },
  inviteTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  inviteBody: { color: '#c9cbd0', fontSize: 13, lineHeight: 18, marginTop: 6 },
  inviteActions: { flexDirection: 'row', gap: 8, marginTop: 13 },
  primary: { flex: 1, height: 44, borderRadius: 13, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  secondary: { paddingHorizontal: 18, height: 44, borderRadius: 13, borderWidth: 1, borderColor: '#3b3e46', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#a8abb2', fontSize: 13, fontWeight: '800' },
  authPage: { alignItems: 'center', justifyContent: 'center', padding: 28 },
  authTitle: { color: '#fff', fontSize: 19, fontWeight: '900', textAlign: 'center', marginTop: 14 },
  authBody: { color: '#a5a8ae', fontSize: 13, textAlign: 'center', marginTop: 6 },
  authButton: { marginTop: 18, height: 48, paddingHorizontal: 26, borderRadius: 14, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  joinCard: { padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,90,0,.10)', borderWidth: 1, borderColor: 'rgba(255,90,0,.4)', marginBottom: 12 },
  joinButton: { flexDirection: 'row', gap: 5, marginTop: 13, height: 46, borderRadius: 13, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  linkButton: { flexDirection: 'row', gap: 8, height: 46, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,122,50,.5)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  linkText: { color: '#ff8b4b', fontSize: 14, fontWeight: '900' },
  demoNote: { color: '#a5a8ae', fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: 14 },
  demoCta: { flexDirection: 'row', gap: 6, marginTop: 20, height: 52, borderRadius: 15, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  cards: { gap: 10, paddingTop: 16, paddingRight: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10, minHeight: 24 },
  section: { color: '#9b9ba1', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  sectionActionText: { color: '#ff7a32', fontSize: 12, fontWeight: '900' },
  card: { backgroundColor: '#17171a', borderRadius: 18, borderWidth: 1, borderColor: '#26262b', overflow: 'hidden' },
  divider: { borderTopWidth: 1, borderTopColor: '#26262b' },
  rowCopy: { flex: 1 },
  rowName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  plusName: { color: '#F4C95D' },
  rowMeta: { color: '#85878d', fontSize: 11, fontWeight: '600' },
  hint: { color: '#7c7e85', fontSize: 12, lineHeight: 17, marginTop: 9 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11 },
  memberStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  warning: { color: '#ffb020', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  team: { padding: 12, borderRadius: 15, backgroundColor: '#17171a', borderWidth: 1, borderColor: '#26262b', marginBottom: 8 },
  teamFull: { borderColor: 'rgba(255,90,0,.45)' },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  teamLabel: { color: '#c9cbd0', fontSize: 12, fontWeight: '800' },
  teamCount: { color: '#85878d', fontSize: 11, fontWeight: '800' },
  teamPlayers: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, minHeight: 32, alignItems: 'center' },
  unassigned: { marginTop: 9 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 160, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: '#26262b' },
  chipOn: { backgroundColor: '#ff5a00' },
  chipText: { color: '#d4d4d7', fontSize: 12, fontWeight: '800', flexShrink: 1 },
  chipTextOn: { color: '#fff' },
  start: { flexDirection: 'row', gap: 7, marginTop: 18, height: 52, borderRadius: 15, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  startOff: { opacity: 0.4 },
  waiting: { color: '#c9cbd0', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 18 },
  danger: { alignItems: 'center', padding: 16, marginTop: 16 },
  dangerText: { color: '#d55d5d', fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.72)' },
  sheet: { maxHeight: '75%', padding: 18, paddingBottom: 34, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#17171a' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
});
