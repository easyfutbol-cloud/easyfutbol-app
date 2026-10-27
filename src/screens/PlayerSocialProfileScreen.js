import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { FramedAvatar, PlayerTitleBadge } from '../components/engagement/Cosmetics';
import { SocialAvatar, resolveSocialAvatarUrl } from '../components/social/SocialComponents';
import ProfileShareModal, { FORM_COLORS, FORM_LETTER } from '../components/profile/ProfileShareCard';
import PhotoGrid from '../components/profile/PhotoGrid';

const dateLabel = (value) => new Intl.DateTimeFormat('es-ES', {
  weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit',
}).format(new Date(value));

const PUBLIC_STAT_LABELS = {
  goals: 'Goles', assists: 'Asistencias', saves: 'Paradas',
  mvp_count: 'MVPs', matches_played: 'Partidos', win_rate: '% Victorias',
};
const PUBLIC_STAT_ICONS = {
  goals: 'football-outline', assists: 'git-merge-outline', saves: 'hand-left-outline',
  mvp_count: 'star-outline', matches_played: 'calendar-outline', win_rate: 'trophy-outline',
};

export default function PlayerSocialProfileScreen({ navigation, route }) {
  const [data, setData] = useState(null);
  const [publicData, setPublicData] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [shareCard, setShareCard] = useState(null);
  const userId = route.params?.userId;
  const slug = route.params?.slug;

  const load = useCallback(async () => {
    try {
      // Los enlaces /jugador/<slug> llegan sin userId: primero se resuelve.
      if (!userId && slug) {
        const res = await api.get(`/player-profile/by-slug/${encodeURIComponent(slug)}`);
        navigation.setParams({ userId: res.data.user_id });
        return;
      }
      if (!userId) return;
      const [statsRes, publicRes] = await Promise.all([
        api.get(`/social/users/${userId}/stats`),
        api.get(`/player-profile/${userId}`),
      ]);
      setData(statsRes.data);
      setPublicData(publicRes.data);
    } catch (error) {
      Alert.alert('Perfil', error.response?.data?.msg || 'No se pudo cargar');
    }
  }, [userId, slug, navigation]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!data || !publicData) return <View style={styles.page}><ActivityIndicator color="#ff5a00" style={styles.loader} /></View>;

  const status = data.friendship?.status;
  const runAction = async () => {
    try {
      if (status === 'none') await api.post('/social/requests', { user_id:data.user.id });
      else if (status === 'received') await api.patch(`/social/requests/${data.friendship.friendship_id}/accept`);
      else if (status === 'sent') await api.delete(`/social/requests/${data.friendship.friendship_id}`);
      else await api.delete(`/social/friends/${data.user.id}`);
      await load();
    } catch (error) { Alert.alert('Amistad', error.response?.data?.msg || 'No se pudo completar'); }
  };
  const action = () => {
    if (status !== 'friends') return runAction();
    Alert.alert('Eliminar amistad', `¿Quieres eliminar a ${data.user.name} de tus amigos?`, [
      { text:'Cancelar', style:'cancel' },
      { text:'Eliminar', style:'destructive', onPress:runAction },
    ]);
  };
  const blockUser=()=>Alert.alert('Bloquear usuario',`Dejaréis de ser amigos y ${data.user.name} no podrá encontrarte, enviarte solicitudes ni invitarte.`,[{text:'Cancelar',style:'cancel'},{text:'Bloquear',style:'destructive',onPress:async()=>{try{await api.post(`/social/blocks/${data.user.id}`);Alert.alert('Usuario bloqueado','Puedes desbloquearlo desde Privacidad en Amigos.');navigation.navigate('Social');}catch(error){Alert.alert('Bloquear',error.response?.data?.msg||'No se pudo bloquear');}}}]);
  const sendReport=reason=>api.post('/social/reports',{user_id:data.user.id,reason}).then(()=>Alert.alert('Denuncia enviada','La revisaremos de forma privada. El usuario no recibirá ninguna notificación.')).catch(error=>Alert.alert('Denunciar',error.response?.data?.msg||'No se pudo enviar'));
  const reportUser=()=>Alert.alert('Denunciar usuario','Selecciona el motivo. La denuncia será confidencial.',[{text:'Conducta antideportiva',onPress:()=>sendReport('conduct')},{text:'Acoso o comportamiento ofensivo',onPress:()=>sendReport('harassment')},{text:'Spam',onPress:()=>sendReport('spam')},{text:'Perfil o identidad falsos',onPress:()=>sendReport('identity')},{text:'Cancelar',style:'cancel'}]);

  const postComment = async () => {
    const body = commentText.trim();
    if (!body) return;
    try {
      setPostingComment(true);
      const res = await api.post(`/player-profile/${data.user.id}/comments`, { body });
      setPublicData((prev) => ({ ...prev, comments: [res.data.data, ...(prev.comments || [])] }));
      setCommentText('');
    } catch (error) {
      Alert.alert('Comentario', error.response?.data?.msg || 'No se pudo publicar');
    } finally {
      setPostingComment(false);
    }
  };

  const deleteComment = (comment) => Alert.alert('Borrar comentario', '¿Seguro que quieres borrarlo?', [
    { text:'Cancelar', style:'cancel' },
    { text:'Borrar', style:'destructive', onPress: async () => {
      try {
        await api.delete(`/player-profile/comments/${comment.id}`);
        setPublicData((prev) => ({ ...prev, comments: (prev.comments || []).filter((c) => c.id !== comment.id) }));
      } catch (error) { Alert.alert('Comentario', error.response?.data?.msg || 'No se pudo borrar'); }
    } },
  ]);

  const bannerUri = resolveSocialAvatarUrl(data.user.banner_url);
  const visibleStats = (publicData.visible_stats || []).filter((key) => PUBLIC_STAT_LABELS[key]);
  const heroStats = visibleStats.slice(0, 3);
  const extraStats = visibleStats.slice(3);
  const statValue = (key) => `${publicData.stats?.[key] ?? 0}${key === 'win_rate' ? '%' : ''}`;
  const cosmetics = publicData.user?.cosmetics || {};
  const streak = publicData.streak;
  const form = publicData.recent_form || [];
  const chips = [
    data.user.primary_position ? positionLabel(data.user.primary_position) : null,
    data.user.dominant_foot ? footLabel(data.user.dominant_foot) : null,
    data.user.preferred_location || null,
  ].filter(Boolean);

  const shareProfile = async () => {
    try {
      if (!publicData.is_owner) {
        if (publicData.share_url) await Share.share({ message: `⚽ Mira el perfil de ${data.user.name} en EasyFutbol: ${publicData.share_url}` });
        return;
      }
      const res = await api.get('/player-profile/me/share');
      setShareCard({ url: res.data.url });
    } catch (error) {
      Alert.alert('Compartir', error.response?.data?.msg || 'No se pudo preparar el enlace');
    }
  };
  const canShare = publicData.is_owner || !!publicData.share_url;
  const achievements = publicData.showcase?.achievements || [];
  const weeklyWins = publicData.showcase?.weekly_lineup_wins || 0;
  const hasShowcase = achievements.length > 0 || weeklyWins > 0 || !!data.reputation?.badges?.length;
  const views = publicData.views;
  const viewsDelta = views ? views.last_7_days - views.previous_7_days : 0;

  return <View style={styles.page}>
    <ScreenHeader title="Perfil de jugador" onBack={() => navigation.navigate('Social')} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroBanner}>
          {bannerUri ? <Image source={{ uri:bannerUri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <LinearGradient colors={['#ff6a17', '#7a2a00', '#1a0d05']} start={{ x:0, y:0 }} end={{ x:1, y:1 }} style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={['rgba(23,23,25,0)', 'rgba(23,23,25,.65)', '#171719']} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
          {streak?.current > 0 ? <View style={styles.streakPill}><Ionicons name="flame" size={14} color="#fff" /><Text style={styles.streakPillText}>{streak.current} {streak.current === 1 ? 'semana' : 'semanas'}</Text></View> : null}
        </View>

        <View style={styles.identity}>
          <View style={styles.heroAvatar}>
            <FramedAvatar frame={cosmetics.frame} size={112} ring={5}><SocialAvatar uri={data.user.avatar_url} name={data.user.name} size={112} /></FramedAvatar>
          </View>
          <View style={styles.nameRow}>
            <Text style={[styles.name, publicData.user?.is_plus && styles.plusName]} numberOfLines={1}>{data.user.name}</Text>
            {publicData.user?.is_plus ? <View style={styles.plusBadge}><Text style={styles.plusBadgeText}>PLUS</Text></View> : null}
          </View>
          <PlayerTitleBadge title={cosmetics.title} />
          {chips.length ? <View style={styles.chips}>{chips.map((chip) => <View key={chip} style={styles.chip}><Text style={styles.chipText}>{chip}</Text></View>)}</View> : null}

          {heroStats.length ? (
            <View style={styles.heroStats}>
              {heroStats.map((key, index) => (
                <View key={key} style={[styles.heroStat, index > 0 && styles.heroStatDivider]}>
                  <Text style={styles.heroStatValue}>{statValue(key)}</Text>
                  <Text style={styles.heroStatLabel}>{PUBLIC_STAT_LABELS[key].toUpperCase()}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {views ? (
            <View style={styles.views}>
              <Ionicons name="eye-outline" size={15} color="#ff7a32" />
              <Text style={styles.viewsText}>
                {views.last_7_days === 1 ? '1 persona ha visto tu perfil' : `${views.last_7_days} personas han visto tu perfil`} esta semana
              </Text>
              {viewsDelta !== 0 ? <Text style={[styles.viewsDelta, viewsDelta < 0 && styles.viewsDeltaDown]}>{viewsDelta > 0 ? `+${viewsDelta}` : viewsDelta}</Text> : null}
            </View>
          ) : null}

          <View style={styles.heroActions}>
            {publicData.is_owner ? (
              <TouchableOpacity onPress={() => navigation.navigate('MyPublicProfile')} style={[styles.action, styles.secondary, styles.actionFlex]}>
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.actionText}>Editar perfil</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={action} style={[styles.action, status === 'friends' && styles.secondary, styles.actionFlex]}>
                <Text style={styles.actionText}>{status === 'friends' ? 'Eliminar amistad' : status === 'sent' ? 'Cancelar solicitud' : status === 'received' ? 'Aceptar solicitud' : 'Añadir amigo'}</Text>
              </TouchableOpacity>
            )}
            {canShare ? (
              <TouchableOpacity onPress={shareProfile} style={[styles.action, publicData.is_owner ? null : styles.secondary, styles.actionFlex]} accessibilityRole="button">
                <Ionicons name="share-social" size={16} color="#fff" />
                <Text style={styles.actionText}>{publicData.is_owner ? 'Compartir perfil' : 'Compartir'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {form.length ? <View style={styles.card}>
        <SectionTitle icon="pulse-outline" title="FORMA RECIENTE" />
        <View style={styles.formRow}>
          {[...form].reverse().map((m) => (
            <View key={m.match_id} style={styles.formItem}>
              <View style={[styles.formDot, { backgroundColor: FORM_COLORS[m.result] || '#555' }]}>
                <Text style={styles.formLetter}>{FORM_LETTER[m.result] || '·'}</Text>
                {m.is_mvp ? <View style={styles.formMvp}><Ionicons name="star" size={9} color="#050505" /></View> : null}
              </View>
              {m.goals !== null || m.assists !== null ? (
                <Text style={styles.formMeta}>{[m.goals !== null ? `${m.goals}G` : null, m.assists !== null ? `${m.assists}A` : null].filter(Boolean).join(' · ')}</Text>
              ) : null}
            </View>
          ))}
        </View>
        <Text style={styles.formHint}>Últimos partidos, del más antiguo al más reciente</Text>
      </View> : null}

      {!!extraStats.length && <View style={styles.card}>
        <SectionTitle icon="stats-chart-outline" title="MÁS ESTADÍSTICAS" />
        <View style={styles.publicStatsGrid}>
          {extraStats.map((key) => <View key={key} style={styles.publicStatTile}>
            <Ionicons name={PUBLIC_STAT_ICONS[key]} color="#ff7a32" size={20} />
            <Text style={styles.metricValue}>{statValue(key)}</Text>
            <Text style={styles.metricLabel}>{PUBLIC_STAT_LABELS[key]}</Text>
          </View>)}
        </View>
      </View>}

      {!!publicData.photos?.length && <View style={styles.card}>
        <SectionTitle icon="images-outline" title={`FOTOS (${publicData.photos.length})`} />
        <PhotoGrid photos={publicData.photos} />
      </View>}

      {hasShowcase && <View style={styles.card}>
        <SectionTitle icon="trophy-outline" title="VITRINA" />
        {weeklyWins > 0 ? (
          <TouchableOpacity style={styles.lineupTrophy} onPress={() => navigation.navigate('WeeklyLineupResult')} activeOpacity={0.85}>
            <View style={styles.lineupIcon}><Ionicons name="trophy" size={22} color="#050505" /></View>
            <View style={{ flex:1 }}>
              <Text style={styles.lineupTitle}>{weeklyWins === 1 ? 'Ha estado en El 8 de la semana' : `${weeklyWins} veces en El 8 de la semana`}</Text>
              <Text style={styles.lineupSub}>Elegido por la comunidad</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#777" />
          </TouchableOpacity>
        ) : null}
        {achievements.length ? <View style={styles.medalGrid}>
          {achievements.map((item) => <View key={item.code} style={styles.medal}>
            <View style={styles.medalIcon}><Ionicons name={item.icon} size={20} color="#ff7a32" /></View>
            <Text style={styles.medalTitle} numberOfLines={2}>{item.title}</Text>
          </View>)}
        </View> : null}
        {!!data.reputation?.badges?.length && <View style={styles.badgeWrap}>{data.reputation.badges.map((badge) => <View key={badge.code} style={styles.publicBadge}><Ionicons name={badge.icon} color="#4dbb78" size={16} /><Text style={styles.publicBadgeText}>{badge.label}</Text></View>)}</View>}
        {data.reputation?.attendance_rate !== null && data.reputation?.attendance_rate !== undefined && <Text style={styles.reliabilityText}>{data.reputation.attendance_rate}% de asistencia · {data.reputation.completed_matches} partidos completados</Text>}
      </View>}

      {status === 'friends' && <>
        {!data.stats_private && <View style={styles.card}>
          <SectionTitle icon="swap-horizontal-outline" title="COMPARATIVA" />
          <View style={styles.compareHeader}><Text style={styles.compareName}>Tú</Text><Text style={styles.compareName}>{data.user.name.split(' ')[0]}</Text></View>
          <CompareRow label="Goles" mine={data.my_stats?.goals} theirs={data.stats?.goals} />
          <CompareRow label="Asistencias" mine={data.my_stats?.assists} theirs={data.stats?.assists} />
          <CompareRow label="Partidos ganados" mine={data.my_stats?.wins} theirs={data.stats?.wins} />
        </View>}

        <View style={styles.card}>
          <SectionTitle icon="people-outline" title="VUESTROS PARTIDOS" />
          <View style={styles.togetherGrid}>
            <SmallStat label="Juntos" value={data.together?.matches_together} />
            <SmallStat label="Victorias" value={data.together?.wins} />
            <SmallStat label="% victoria" value={`${Number(data.together?.win_rate || 0)}%`} />
          </View>
          <View style={styles.balanceRow}><Text style={styles.balanceText}>Mismo equipo: {Number(data.together?.same_team || 0)}</Text><Text style={styles.balanceText}>Rivales: {Number(data.together?.rivals || 0)}</Text></View>
          {data.together?.last_match && <TouchableOpacity style={styles.lastMatch} onPress={() => navigation.navigate('Match', { matchId:data.together.last_match.id })}>
            <View><Text style={styles.mutedLabel}>ÚLTIMO PARTIDO COMPARTIDO</Text><Text style={styles.lastMatchTitle}>{data.together.last_match.title}</Text></View>
            <Ionicons name="chevron-forward" color="#777" size={20} />
          </TouchableOpacity>}
        </View>

        <View style={styles.card}>
          <SectionTitle icon="calendar-outline" title="PRÓXIMOS PARTIDOS" />
          {!data.upcoming_matches?.length && <Text style={styles.empty}>No está apuntado a ningún partido próximo.</Text>}
          {data.upcoming_matches?.map((match) => <TouchableOpacity key={match.match_id} style={styles.match} onPress={() => navigation.navigate('Match', { matchId:match.match_id })}>
            <View style={styles.dateBox}><Text style={styles.dateDay}>{new Date(match.starts_at).getDate()}</Text><Text style={styles.dateMonth}>{new Intl.DateTimeFormat('es-ES',{month:'short'}).format(new Date(match.starts_at)).replace('.', '').toUpperCase()}</Text></View>
            <View style={styles.matchInfo}><Text style={styles.matchTitle}>{match.title}</Text><Text style={styles.matchDate}>{dateLabel(match.starts_at)} · {match.spots_remaining} plazas</Text></View>
            <Ionicons name="chevron-forward" color="#ff6a1a" size={20} />
          </TouchableOpacity>)}
        </View>
      </>}

      {status !== 'friends' && !publicData.is_owner && <View style={styles.privateCard}><Ionicons name="lock-closed-outline" color="#777" size={23} /><Text style={styles.privateText}>Hazte amigo para ver sus próximos partidos y vuestro historial juntos.</Text></View>}

      {publicData.comments_enabled && <View style={styles.card}>
        <SectionTitle icon="chatbubble-ellipses-outline" title={`COMENTARIOS (${publicData.comments?.length || 0})`} />

        {publicData.is_owner ? null : publicData.can_comment ? (
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Escribe un comentario..."
              placeholderTextColor="#666"
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity style={styles.commentSendButton} onPress={postComment} disabled={postingComment || !commentText.trim()}>
              {postingComment ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.commentLockedText}>
            Necesitas haber jugado al menos {publicData.min_matches_to_comment} partidos en EasyFutbol para poder comentar.
          </Text>
        )}

        {!publicData.comments?.length ? (
          <Text style={styles.empty}>Todavía no hay comentarios.</Text>
        ) : publicData.comments.map((comment) => (
          <View key={comment.id} style={styles.commentRow}>
            <TouchableOpacity onPress={() => navigation.push('PlayerSocialProfile', { userId: comment.author.id })} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${comment.author.name}`}>
              <SocialAvatar uri={comment.author.avatar_url} name={comment.author.name} size={32} />
            </TouchableOpacity>
            <View style={{ flex:1 }}>
              <Text style={styles.commentAuthor} onPress={() => navigation.push('PlayerSocialProfile', { userId: comment.author.id })}>{comment.author.name}</Text>
              <Text style={styles.commentBody}>{comment.body}</Text>
            </View>
            {comment.can_delete && (
              <TouchableOpacity onPress={() => deleteComment(comment)} style={{ padding:4 }}>
                <Ionicons name="trash-outline" size={16} color="#777" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>}

      {!publicData.is_owner && <View style={styles.safety}><TouchableOpacity style={styles.safetyButton} onPress={reportUser}><Ionicons name="flag-outline" color="#aaa" size={17}/><Text style={styles.safetyText}>Denunciar</Text></TouchableOpacity><TouchableOpacity style={styles.safetyButton} onPress={blockUser}><Ionicons name="ban-outline" color="#d66b6b" size={17}/><Text style={[styles.safetyText,{color:'#d66b6b'}]}>Bloquear</Text></TouchableOpacity></View>}
    </ScrollView>
    {shareCard ? <ProfileShareModal
      visible
      onClose={() => setShareCard(null)}
      name={data.user.name}
      avatarUrl={data.user.avatar_url}
      frame={cosmetics.frame}
      title={cosmetics.title}
      chips={chips}
      stats={heroStats.map((key) => ({ label: PUBLIC_STAT_LABELS[key], value: statValue(key) }))}
      streak={streak}
      form={form}
      shareUrl={shareCard.url}
    /> : null}
  </View>;
}

function SectionTitle({ icon, title }) { return <View style={styles.sectionTitle}><Ionicons name={icon} color="#ff6a1a" size={18} /><Text style={styles.eyebrow}>{title}</Text></View>; }
function SmallStat({ label, value }) { return <View style={styles.smallStat}><Text style={styles.smallValue}>{value ?? 0}</Text><Text style={styles.smallLabel}>{label}</Text></View>; }
function CompareRow({ label, mine, theirs }) { return <View style={styles.compareRow}><Text style={styles.compareValue}>{Number(mine || 0)}</Text><Text style={styles.compareLabel}>{label}</Text><Text style={styles.compareValue}>{Number(theirs || 0)}</Text></View>; }
const positionLabel = (value) => ({goalkeeper:'Portero',defender:'Defensa',midfielder:'Centrocampista',forward:'Delantero'}[value] || 'Jugador');
const footLabel = (value) => ({right:'Diestro',left:'Zurdo',both:'Ambidiestro'}[value] || '');

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#0b0b0d'},loader:{marginTop:80},content:{padding:18,paddingBottom:110},
  hero:{borderRadius:26,backgroundColor:'#171719',borderWidth:1,borderColor:'#29292d',overflow:'hidden',marginBottom:14},
  heroBanner:{height:150,backgroundColor:'#1a1a1a'},
  streakPill:{position:'absolute',top:12,right:12,flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#ff5a00',borderRadius:999,paddingHorizontal:10,paddingVertical:5},streakPillText:{color:'#fff',fontWeight:'900',fontSize:12},
  identity:{alignItems:'center',paddingHorizontal:18,paddingBottom:18,marginTop:-64},heroAvatar:{borderRadius:999,padding:4,backgroundColor:'#171719'},
  nameRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10,maxWidth:'100%'},name:{color:'#fff',fontSize:25,fontWeight:'900',flexShrink:1},plusName:{color:'#F4C95D'},
  plusBadge:{backgroundColor:'#F4C95D',borderRadius:6,paddingHorizontal:6,paddingVertical:2},plusBadgeText:{color:'#1a1405',fontSize:9,fontWeight:'900'},
  chips:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:6,marginTop:12},chip:{backgroundColor:'#222327',borderRadius:999,paddingHorizontal:10,paddingVertical:5,borderWidth:1,borderColor:'#2e3036'},chipText:{color:'#c9cbd0',fontSize:11,fontWeight:'800'},
  heroStats:{flexDirection:'row',alignSelf:'stretch',marginTop:18,backgroundColor:'#1f2024',borderRadius:18,paddingVertical:14},heroStat:{flex:1,alignItems:'center'},heroStatDivider:{borderLeftWidth:1,borderLeftColor:'#2e3036'},
  heroStatValue:{color:'#fff',fontSize:26,fontWeight:'900'},heroStatLabel:{color:'#8d9097',fontSize:9,fontWeight:'900',letterSpacing:.8,marginTop:3},
  heroActions:{flexDirection:'row',gap:10,alignSelf:'stretch',marginTop:16},actionFlex:{flex:1},
  action:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'#ff5a00',borderRadius:14,paddingHorizontal:14,paddingVertical:12},secondary:{backgroundColor:'#28282c'},actionText:{color:'#fff',fontWeight:'900'},
  formRow:{flexDirection:'row',justifyContent:'space-between',marginTop:16},formItem:{alignItems:'center',flex:1},formDot:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},formLetter:{color:'#fff',fontSize:17,fontWeight:'900'},
  formMvp:{position:'absolute',top:-3,right:-3,width:18,height:18,borderRadius:9,backgroundColor:'#ff7a32',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#171719'},
  views:{flexDirection:'row',alignItems:'center',gap:6,marginTop:14,backgroundColor:'rgba(255,90,0,.08)',borderRadius:12,paddingHorizontal:12,paddingVertical:8},viewsText:{color:'#d6d7db',fontSize:12,fontWeight:'700',flexShrink:1},
  viewsDelta:{color:'#3ec46d',fontSize:12,fontWeight:'900'},viewsDeltaDown:{color:'#8d9097'},
  lineupTrophy:{flexDirection:'row',alignItems:'center',gap:12,marginTop:16,padding:12,borderRadius:16,backgroundColor:'rgba(255,90,0,.10)',borderWidth:1,borderColor:'rgba(255,90,0,.35)'},
  lineupIcon:{width:42,height:42,borderRadius:14,backgroundColor:'#ff7a32',alignItems:'center',justifyContent:'center'},lineupTitle:{color:'#fff',fontSize:14,fontWeight:'900'},lineupSub:{color:'#a5a8ae',fontSize:11,marginTop:2},
  medalGrid:{flexDirection:'row',flexWrap:'wrap',marginTop:14,marginHorizontal:-4},medal:{width:'33.333%',alignItems:'center',paddingHorizontal:4,marginBottom:12},
  medalIcon:{width:48,height:48,borderRadius:24,backgroundColor:'#24211f',borderWidth:2,borderColor:'rgba(255,122,50,.55)',alignItems:'center',justifyContent:'center'},medalTitle:{color:'#d6d7db',fontSize:10,fontWeight:'800',textAlign:'center',marginTop:6},
    formMeta:{color:'#a5a8ae',fontSize:10,fontWeight:'800',marginTop:6},formHint:{color:'#66686e',fontSize:10,marginTop:12,textAlign:'center'},
  card:{borderRadius:22,padding:19,backgroundColor:'#171719',borderWidth:1,borderColor:'#29292d',marginBottom:14},sectionTitle:{flexDirection:'row',alignItems:'center',gap:8},eyebrow:{color:'#ff7a32',fontWeight:'900',letterSpacing:1.3,fontSize:11},
  metrics:{flexDirection:'row',marginTop:20},metric:{flex:1,alignItems:'center'},metricValue:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:6},metricLabel:{color:'#888',fontSize:11,fontWeight:'700',marginTop:3},
  publicStatsGrid:{flexDirection:'row',flexWrap:'wrap',marginTop:16},publicStatTile:{width:'33.33%',alignItems:'center',marginBottom:14},
  compareHeader:{flexDirection:'row',justifyContent:'space-between',marginTop:18,paddingHorizontal:3},compareName:{color:'#aaa',fontSize:12,fontWeight:'800',maxWidth:'35%'},compareRow:{flexDirection:'row',alignItems:'center',paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#252528'},compareValue:{color:'#fff',fontSize:18,fontWeight:'900',width:55,textAlign:'center'},compareLabel:{color:'#aaa',fontSize:13,fontWeight:'700',flex:1,textAlign:'center'},
  togetherGrid:{flexDirection:'row',gap:9,marginTop:18},smallStat:{flex:1,backgroundColor:'#202023',paddingVertical:13,borderRadius:14,alignItems:'center'},smallValue:{color:'#fff',fontSize:21,fontWeight:'900'},smallLabel:{color:'#85858c',fontSize:10,fontWeight:'800',marginTop:3,textTransform:'uppercase'},balanceRow:{flexDirection:'row',justifyContent:'space-around',marginTop:15},balanceText:{color:'#aaa',fontSize:12,fontWeight:'700'},
  lastMatch:{marginTop:17,paddingTop:15,borderTopWidth:1,borderTopColor:'#29292c',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},mutedLabel:{color:'#68686e',fontSize:9,fontWeight:'900',letterSpacing:1},lastMatchTitle:{color:'#fff',fontWeight:'800',marginTop:4},
  match:{flexDirection:'row',alignItems:'center',paddingTop:15,marginTop:4,borderTopWidth:1,borderTopColor:'#28282b'},dateBox:{width:45,height:49,borderRadius:13,backgroundColor:'#2a211d',alignItems:'center',justifyContent:'center'},dateDay:{color:'#fff',fontSize:18,fontWeight:'900'},dateMonth:{color:'#ff6a1a',fontSize:9,fontWeight:'900'},matchInfo:{flex:1,marginLeft:12},matchTitle:{color:'#fff',fontWeight:'800',fontSize:14},matchDate:{color:'#777',fontSize:11,marginTop:4,textTransform:'capitalize'},empty:{color:'#777',lineHeight:20,marginTop:16},
  privateCard:{borderRadius:18,padding:18,backgroundColor:'#151517',flexDirection:'row',alignItems:'center',gap:12},privateText:{color:'#898990',lineHeight:20,flex:1,fontSize:13},
  badgeWrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:16},publicBadge:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'rgba(77,187,120,.11)',borderWidth:1,borderColor:'rgba(77,187,120,.25)',borderRadius:12,paddingHorizontal:10,paddingVertical:8},publicBadgeText:{color:'#b9dbc5',fontSize:11,fontWeight:'800'},reliabilityText:{color:'#777',fontSize:11,marginTop:13},
  commentInputRow:{flexDirection:'row',alignItems:'flex-end',gap:8,marginTop:16,marginBottom:6},commentInput:{flex:1,minHeight:38,maxHeight:90,backgroundColor:'#1e1e21',borderRadius:12,borderWidth:1,borderColor:'#2c2c30',color:'#fff',fontSize:13,paddingHorizontal:12,paddingVertical:9},commentSendButton:{width:38,height:38,borderRadius:19,backgroundColor:'#ff5a00',alignItems:'center',justifyContent:'center'},
  commentLockedText:{color:'#888',fontSize:12,lineHeight:18,marginTop:14,marginBottom:6},
  commentRow:{flexDirection:'row',alignItems:'flex-start',gap:10,paddingTop:13,marginTop:4,borderTopWidth:1,borderTopColor:'#232326'},commentAuthor:{color:'#fff',fontSize:12,fontWeight:'800'},commentBody:{color:'#bbb',fontSize:12,marginTop:2,lineHeight:17},
  safety:{flexDirection:'row',justifyContent:'center',gap:9,marginTop:18},safetyButton:{minHeight:42,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:15,borderRadius:12,borderWidth:1,borderColor:'#303035'},safetyText:{color:'#aaa',fontSize:11,fontWeight:'800'},
});
