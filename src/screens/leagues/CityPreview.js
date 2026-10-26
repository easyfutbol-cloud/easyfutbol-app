import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Divider, L, LeagueScreen, pressedFx, Section } from '../../components/leagues/LeagueUI';
import { CityStatus, cityDetail } from '../../components/leagues/CityPicker';
import { cities, CITY_STATUS, leaguePitch } from '../../data/leaguePreviewData';
import { setFavoriteCity, toggleCityAlert, useLeagueCity, viewCity } from '../../data/leagueCity';

// Portada de una ciudad donde la liga aún no está en juego.
export default function CityPreview({ city, navigation }) {
  const { favoriteId, alerts } = useLeagueCity();
  const registration = city.status === 'registration';
  const color = CITY_STATUS[city.status].color;
  const alertOn = alerts.includes(city.id);
  const liveCities = cities.filter((item) => item.status === 'live');

  return (
    <LeagueScreen onExit={() => navigation.navigate('AdminPanel')}>
      <View style={styles.hero}>
        <LinearGradient colors={[`${color}33`, 'rgba(18,20,25,0.2)', L.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Ionicons name="location" size={180} color="rgba(255,255,255,0.04)" style={styles.heroIcon} />
        <CityStatus status={city.status} />
        <Text style={styles.city}>{city.name}</Text>
        <Text style={styles.heroText}>
          {registration
            ? `La EasyFutbol League llega a ${city.name}. Inscribe a tu equipo antes de que se completen las plazas.`
            : `Estamos preparando la liga de ${city.name}. Activa el aviso y te contamos cuándo se abren las inscripciones.`}
        </Text>
        <View style={styles.facts}>
          <Fact icon="calendar-outline" label="Inicio" value={city.start} />
          <Fact icon="people-outline" label="Plazas" value={`${city.teamsMax || 8} equipos`} />
        </View>
      </View>

      {registration && (
        <Card style={styles.signup}>
          <View style={styles.signupHead}>
            <Text style={styles.signupTitle}>Equipos inscritos</Text>
            <Text style={styles.signupCount}><Text style={{ color: L.text }}>{city.teamsRegistered}</Text>/{city.teamsMax}</Text>
          </View>
          <View style={styles.slots}>
            {Array.from({ length: city.teamsMax }).map((_, index) => (
              <View key={index} style={[styles.slot, index < city.teamsRegistered && styles.slotTaken]}>
                <Ionicons name={index < city.teamsRegistered ? 'shield' : 'add'} size={14} color={index < city.teamsRegistered ? L.gold : L.subtle} />
              </View>
            ))}
          </View>
          <Text style={styles.signupHint}>Quedan {city.teamsMax - city.teamsRegistered} plazas · {city.venue}</Text>
          <Pressable
            onPress={() => Alert.alert('Inscribir equipo', `En la liga real, aquí el capitán rellena la inscripción de su equipo para ${city.name}.`)}
            style={({ pressed }) => [styles.primary, pressed && pressedFx]}
          >
            <Ionicons name="shield-checkmark-outline" size={17} color="#fff" />
            <Text style={styles.primaryText}>Inscribir a mi equipo</Text>
          </Pressable>
        </Card>
      )}

      <View style={styles.actions}>
        <Pressable onPress={() => toggleCityAlert(city.id)} style={({ pressed }) => [styles.secondary, alertOn && styles.secondaryOn, pressed && pressedFx]}>
          <Ionicons name={alertOn ? 'notifications' : 'notifications-outline'} size={17} color={alertOn ? L.accentLight : L.text} />
          <Text style={[styles.secondaryText, alertOn && { color: L.accentLight }]}>{alertOn ? 'Te avisaremos' : 'Avísame'}</Text>
        </Pressable>
        {favoriteId !== city.id && (
          <Pressable onPress={() => setFavoriteCity(city.id)} style={({ pressed }) => [styles.secondary, pressed && pressedFx]}>
            <Ionicons name="star-outline" size={17} color={L.gold} />
            <Text style={styles.secondaryText}>Es mi ciudad</Text>
          </Pressable>
        )}
      </View>

      <Section title="Qué tendrá la liga" style={styles.firstSection}>
        <Card style={styles.list}>
          {leaguePitch.includes.slice(0, 4).map((item, index) => (
            <View key={item.title}>
              {index > 0 && <Divider />}
              <View style={styles.include}>
                <View style={styles.includeIcon}><Ionicons name={item.icon} size={16} color={L.accentLight} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.includeTitle}>{item.title}</Text>
                  <Text style={styles.includeText}>{item.detail}</Text>
                </View>
              </View>
            </View>
          ))}
        </Card>
        <Pressable onPress={() => navigation.navigate('LeagueAbout')} style={styles.more}>
          <Text style={styles.moreText}>Ver cómo funciona la liga</Text>
          <Ionicons name="arrow-forward" size={13} color={L.accentLight} />
        </Pressable>
      </Section>

      <Section title="Ligas en juego">
        {liveCities.map((item) => (
          <Pressable key={item.id} onPress={() => viewCity(item.id)} style={({ pressed }) => [styles.liveCity, pressed && pressedFx]}>
            <View style={styles.liveIcon}><Ionicons name="football" size={17} color={L.accentLight} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.liveName}>{item.name}</Text>
              <Text style={styles.liveDetail}>{cityDetail(item)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={L.muted} />
          </Pressable>
        ))}
      </Section>
    </LeagueScreen>
  );
}

function Fact({ icon, label, value }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={16} color={L.muted} />
      <View>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 22, borderRadius: 26, overflow: 'hidden', backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, borderTopColor: L.highlight, marginTop: 4 },
  heroIcon: { position: 'absolute', right: -40, top: -30 },
  city: { color: L.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.6, marginTop: 14 },
  heroText: { color: L.soft, fontSize: 14, lineHeight: 21, marginTop: 6 },
  facts: { flexDirection: 'row', gap: 10, marginTop: 20 },
  fact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.25)' },
  factLabel: { color: L.muted, fontSize: 10, fontWeight: '700' },
  factValue: { color: L.text, fontSize: 14, fontWeight: '800', marginTop: 1 },

  signup: { marginTop: 12 },
  signupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  signupTitle: { color: L.text, fontSize: 16, fontWeight: '800' },
  signupCount: { color: L.muted, fontSize: 20, fontWeight: '900' },
  slots: { flexDirection: 'row', gap: 6, marginTop: 14 },
  slot: { flex: 1, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.14)' },
  slotTaken: { borderStyle: 'solid', borderColor: 'rgba(251,191,36,0.3)', backgroundColor: 'rgba(251,191,36,0.1)' },
  signupHint: { color: L.muted, fontSize: 12, marginTop: 10 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: L.accent },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: L.line },
  secondaryOn: { backgroundColor: L.accentSoft, borderColor: 'rgba(255,90,0,0.3)' },
  secondaryText: { color: L.text, fontSize: 13, fontWeight: '800' },

  firstSection: { marginTop: 28 },
  list: { paddingVertical: 2, paddingHorizontal: 14 },
  include: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13 },
  includeIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: L.accentSoft },
  includeTitle: { color: L.text, fontSize: 14, fontWeight: '800' },
  includeText: { color: L.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 12 },
  moreText: { color: L.accentLight, fontSize: 13, fontWeight: '800' },

  liveCity: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 8, borderRadius: 18, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, borderTopColor: L.highlight },
  liveIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: L.accentSoft },
  liveName: { color: L.text, fontSize: 15, fontWeight: '800' },
  liveDetail: { color: L.muted, fontSize: 12, marginTop: 2 },
});
