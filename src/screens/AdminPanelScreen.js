import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';
import { goBackOrFallback } from '../utils/navigation';

const SECTIONS = [
  {
    title: 'Operación',
    items: [
      { label: 'Dashboard', description: 'Actividad y KPIs', icon: 'analytics-outline', route: 'AdminDashboard' },
      { label: 'Partidos', description: 'Gestionar calendario', icon: 'football-outline', route: 'AdminMatches' },
      { label: 'Crear partido', description: 'Nueva convocatoria', icon: 'add-circle-outline', route: 'AdminCreateMatch' },
      { label: 'Programados', description: 'Publicaciones automáticas', icon: 'time-outline', route: 'AdminScheduledMatches' },
    ],
  },
  {
    title: 'Estadísticas',
    items: [
      { label: 'Estadísticas', description: 'Rendimiento de partido', icon: 'stats-chart-outline', route: 'AdminMatchStats' },
      { label: 'Importar datos', description: 'Carga de estadísticas', icon: 'cloud-upload-outline', route: 'AdminMatchStatsImport' },
    ],
  },
  {
    title: 'Comunidad y pagos',
    items: [
      { label: 'Usuarios', description: 'Perfiles y permisos', icon: 'people-outline', route: 'AdminUsers' },
      { label: 'EasyPass', description: 'Saldos y movimientos', icon: 'ticket-outline', route: 'AdminEasyPass' },
      { label: 'Avisos', description: 'Notificaciones a jugadores', icon: 'notifications-outline', route: 'AdminNotify' },
    ],
  },
];

export default function AdminPanelScreen({ navigation }) {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={['#281408', '#11151B']} style={styles.hero}>
          <TouchableOpacity style={styles.back} onPress={() => goBackOrFallback(navigation, 'Profile')}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.heroIcon}><Ionicons name="shield-checkmark" size={28} color={colors.orange} /></View>
          <Text style={styles.eyebrow}>EASYFUTBOL · ADMIN</Text>
          <Text style={styles.title}>Panel de control</Text>
          <Text style={styles.description}>Toda la gestión del club, organizada por áreas.</Text>
        </LinearGradient>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.grid}>
              {section.items.map((item) => (
                <TouchableOpacity key={item.route} activeOpacity={0.78} style={styles.card} onPress={() => navigation.navigate(item.route)}>
                  <View style={styles.cardIcon}><Ionicons name={item.icon} size={22} color={colors.orange} /></View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{item.label}</Text>
                    <Text style={styles.cardDescription}>{item.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(5) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.28)', padding: spacing(2), marginBottom: spacing(3), ...shadows.card },
  back: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: 'rgba(255,90,0,0.14)', alignItems: 'center', justifyContent: 'center', marginTop: spacing(1) },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: 4 },
  description: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75) },
  section: { marginBottom: spacing(2.5) },
  sectionTitle: { color: colors.white, ...typography.heading, marginBottom: spacing(1.25) },
  grid: { gap: spacing(1) },
  card: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), padding: spacing(1.25), backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium },
  cardIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.12)' },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.white, ...typography.bodyStrong },
  cardDescription: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
});
