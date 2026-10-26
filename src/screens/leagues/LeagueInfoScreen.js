import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Divider, L, LeagueScreen, pressedFx, Section, SponsorSlot } from '../../components/leagues/LeagueUI';
import { cities, leaguePitch, leagueSponsor } from '../../data/leaguePreviewData';
import { useLeagueCity, viewCity } from '../../data/leagueCity';
import { CityStatus, cityDetail } from '../../components/leagues/CityPicker';

export default function LeagueInfoScreen({ navigation }) {
  const [openRule, setOpenRule] = useState(0);
  const { favoriteId } = useLeagueCity();
  return (
    <LeagueScreen>
      <LinearGradient colors={['#3A1505', '#1A0F0A', L.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="football" size={200} color="rgba(255,255,255,0.04)" style={styles.heroBall} />
        <Text style={styles.kicker}>FÚTBOL 7 · {cities.length} CIUDADES</Text>
        <Text style={styles.headline}>{leaguePitch.headline}</Text>
        <Text style={styles.intro}>{leaguePitch.intro}</Text>
        <View style={styles.numbers}>
          {leaguePitch.numbers.map((item) => (
            <View key={item.label} style={styles.number}>
              <Text style={styles.numberValue}>{item.value}</Text>
              <Text style={styles.numberLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      <Section title="Formato" style={styles.first}>
        <View style={styles.phases}>
          {leaguePitch.phases.map((phase, index) => (
            <React.Fragment key={phase.title}>
              {index > 0 && <Ionicons name="arrow-forward" size={16} color={L.subtle} />}
              <View style={styles.phase}>
                <Ionicons name={phase.icon} size={20} color={index ? L.gold : L.accent} />
                <Text style={styles.phaseTitle}>{phase.title}</Text>
                <Text style={styles.phaseText}>{phase.detail}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
        <Card style={styles.list}>
          {leaguePitch.schedule.map((item, index) => (
            <View key={item.title}>
              {index > 0 && <Divider />}
              <View style={styles.scheduleRow}>
                <Ionicons name={item.icon} size={18} color={L.accent} />
                <Text style={styles.scheduleTitle}>{item.title}</Text>
                <Text style={styles.scheduleText}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Ciudades">
        <Card style={styles.list}>
          {cities.map((city, index) => (
            <View key={city.id}>
              {index > 0 && <Divider />}
              <Pressable onPress={() => { viewCity(city.id); navigation.navigate('LeagueHome'); }} style={({ pressed }) => [styles.cityRow, pressed && pressedFx]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.cityNameRow}>
                    <Text style={styles.cityName}>{city.name}</Text>
                    {city.id === favoriteId && <Ionicons name="star" size={12} color={L.gold} />}
                  </View>
                  <Text style={styles.cityDetail}>{cityDetail(city)}</Text>
                </View>
                <CityStatus status={city.status} />
              </Pressable>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Qué incluye">
        <View style={styles.grid}>
          {leaguePitch.includes.map((item) => (
            <View key={item.title} style={styles.tile}>
              <View style={styles.tileIcon}><Ionicons name={item.icon} size={18} color={L.accent} /></View>
              <Text style={styles.tileTitle}>{item.title}</Text>
              <Text style={styles.tileText}>{item.detail}</Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="La experiencia en la app">
        <Card style={styles.list}>
          {[
            ['calendar-outline', 'Calendario y fichas de partido', 'LeagueCalendar'],
            ['podium-outline', 'Clasificación en directo', 'LeagueStandings'],
            ['stats-chart-outline', 'Rankings de jugadores', 'LeagueRankings'],
            ['star-outline', 'MVP y 7 de la jornada', 'LeagueHome'],
          ].map(([icon, label, routeName], index) => (
            <View key={label}>
              {index > 0 && <Divider />}
              <Pressable onPress={() => navigation.navigate(routeName)} style={({ pressed }) => [styles.linkRow, pressed && pressedFx]}>
                <Ionicons name={icon} size={18} color={L.soft} />
                <Text style={styles.linkText}>{label}</Text>
                <Ionicons name="chevron-forward" size={16} color={L.subtle} />
              </Pressable>
            </View>
          ))}
        </Card>
      </Section>

      <View style={styles.partnerHead}>
        <Text style={styles.partnerKicker}>PARA MARCAS</Text>
        <Text style={styles.partnerTitle}>{leagueSponsor.name || 'Tu marca'}, en cada jornada</Text>
        <Text style={styles.partnerIntro}>La liga genera contenido cada fin de semana: partidos grabados, estadísticas, MVP y resultados que los jugadores comparten. Estos son los espacios disponibles para una marca colaboradora.</Text>
      </View>
      <Card style={styles.list}>
        {leaguePitch.partnership.map((item, index) => (
          <View key={item.title}>
            {index > 0 && <Divider />}
            <View style={styles.partnerRow}>
              <View style={styles.partnerIcon}><Ionicons name={item.icon} size={18} color={L.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.partnerRowTitle}>{item.title}</Text>
                <Text style={styles.partnerRowText}>{item.detail}</Text>
              </View>
            </View>
          </View>
        ))}
      </Card>
      <Text style={styles.previewLabel}>Así se vería en la app</Text>
      <SponsorSlot />

      <Section title="Reglamento" style={styles.rules}>
        <Card style={styles.list}>
          {leaguePitch.rules.map((rule, index) => {
            const open = openRule === index;
            return (
              <View key={rule.title}>
                {index > 0 && <Divider />}
                <Pressable onPress={() => setOpenRule(open ? -1 : index)} style={styles.ruleHead}>
                  <Text style={styles.ruleTitle}>{rule.title}</Text>
                  <Ionicons name={open ? 'remove' : 'add'} size={18} color={L.muted} />
                </Pressable>
                {open && <Text style={styles.ruleText}>{rule.text}</Text>}
              </View>
            );
          })}
        </Card>
      </Section>

      <View style={styles.closing}>
        <Ionicons name="trophy" size={26} color={L.accent} />
        <Text style={styles.closingTitle}>Una liga que se ve, se juega y se comparte</Text>
        <Text style={styles.closingText}>Formato común para todas las ciudades donde se organice EasyFutbol League.</Text>
      </View>
    </LeagueScreen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 26, padding: 22, marginTop: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,90,0,0.25)' },
  heroBall: { position: 'absolute', right: -50, top: -40 },
  kicker: { color: '#FF8A4C', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  headline: { color: L.text, fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -1, marginTop: 10 },
  intro: { color: L.soft, fontSize: 14, lineHeight: 21, marginTop: 10 },
  numbers: { flexDirection: 'row', marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  number: { flex: 1 },
  numberValue: { color: L.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.8 },
  numberLabel: { color: L.muted, fontSize: 11, fontWeight: '600', marginTop: 1 },

  first: { marginTop: 26 },
  phases: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  phase: { flex: 1, padding: 14, borderRadius: 20, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  phaseTitle: { color: L.text, fontSize: 15, fontWeight: '800', marginTop: 10 },
  phaseText: { color: L.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  list: { paddingVertical: 2, paddingHorizontal: 14 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  scheduleTitle: { color: L.text, fontSize: 14, fontWeight: '700' },
  scheduleText: { flex: 1, color: L.muted, fontSize: 12, textAlign: 'right' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.4%', padding: 14, borderRadius: 20, borderTopColor: L.highlight, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  tileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: L.accentSoft },
  tileTitle: { color: L.text, fontSize: 14, fontWeight: '800', marginTop: 12 },
  tileText: { color: L.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },

  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  cityNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cityName: { color: L.text, fontSize: 15, fontWeight: '800' },
  cityDetail: { color: L.muted, fontSize: 12, marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  linkText: { flex: 1, color: L.text, fontSize: 14, fontWeight: '600' },

  partnerHead: { marginBottom: 14 },
  partnerKicker: { color: L.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  partnerTitle: { color: L.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 6 },
  partnerIntro: { color: L.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  partnerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  partnerIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: L.accentSoft },
  partnerRowTitle: { color: L.text, fontSize: 14, fontWeight: '800' },
  partnerRowText: { color: L.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  previewLabel: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },

  rules: { marginTop: 26 },
  ruleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  ruleTitle: { color: L.text, fontSize: 14, fontWeight: '700' },
  ruleText: { color: L.muted, fontSize: 13, lineHeight: 20, paddingBottom: 14, marginTop: -4 },

  closing: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  closingTitle: { color: L.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 10 },
  closingText: { color: L.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
});
