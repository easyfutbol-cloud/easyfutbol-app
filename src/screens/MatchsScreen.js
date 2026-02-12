// src/screens/MatchsScreen.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  ImageBackground,
} from 'react-native';
import api from '../api/client';
import { colors, spacing } from '../theme';

// Helper: formatea el día (sin la hora)
function formatDayLabel(dateObj) {
  if (!dateObj) return '';
  const label = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Agrupa los partidos por día
function groupMatchesByDay(matches) {
  const groups = {};

  matches.forEach((match) => {
    if (!match.starts_at) return;
    const dateObj = new Date(match.starts_at);
    if (Number.isNaN(dateObj.getTime())) return;

    const key = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
    const title = formatDayLabel(dateObj);

    if (!groups[key]) {
      groups[key] = { title, data: [] };
    }
    groups[key].data.push(match);
  });

  // Pasamos de objeto a array y ordenamos por fecha
  return Object.keys(groups)
    .sort()
    .map((key) => groups[key]);
}

export default function MatchsScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMatches = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.get('/matches', { params: { only_open: 1 } });
      const payload = res.data;
      const data = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];
      const now = new Date();
      const upcoming = data.filter((m) => {
        if (!m.starts_at) return false;
        const d = new Date(m.starts_at);
        if (Number.isNaN(d.getTime())) return false;
        return d >= now;
      });

      setMatches(upcoming);
      console.log('PARTIDOS API (futuros):', upcoming.length, upcoming.map((m) => m.id));
    } catch (e) {
      console.log('Error cargando partidos desde API:', e.message);
      setMatches([]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadMatches(false);
  }, []);

  const onRefresh = useCallback(() => {
    loadMatches(true);
  }, []);

  const sections = useMemo(() => groupMatchesByDay(matches), [matches]);

  const renderItem = ({ item }) => {
    const startsAt = item.starts_at;
    const dateObj = startsAt ? new Date(startsAt) : null;

    const timeLabel = dateObj
      ? dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '';

    const fieldName = item.field_name || '';
    const city = item.city || '';

    const handlePress = () => {
      navigation.navigate('Match', { matchId: item.id });
    };

    return (
      <TouchableOpacity style={styles.cardWrapper} activeOpacity={0.9} onPress={handlePress}>
        <ImageBackground
          source={{
            uri: 'https://images.pexels.com/photos/114296/pexels-photo-114296.jpeg?auto=compress&cs=tinysrgb&w=800',
          }}
          style={styles.cardBackground}
          imageStyle={styles.cardImage}
        >
          <View style={styles.cardOverlay}>
            <Text style={styles.title}>{item.title}</Text>

            {!!timeLabel && <Text style={styles.meta}>{timeLabel}</Text>}

            {(fieldName || city) && (
              <Text style={styles.meta}>
                {fieldName}
                {fieldName && city ? ' · ' : ''}
                {city}
              </Text>
            )}

            <View style={styles.ctaRow}>
              <TouchableOpacity style={styles.ctaButton} onPress={handlePress}>
                <Text style={styles.ctaText}>Reservar ahora</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }) => (
    <View style={styles.sectionHeaderContainer}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.orange} />
          <Text style={styles.loadingText}>Cargando partidos…</Text>
        </View>
      </View>
    );
  }

  if (!loading && matches.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No hay partidos disponibles</Text>
          <Text style={styles.emptyText}>
            Cuando creemos nuevos partidos en EasyFutbol aparecerán aquí.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingVertical: spacing(1) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
    paddingHorizontal: spacing(2),
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(3),
  },
  sectionHeaderContainer: {
    marginTop: spacing(2),
    marginBottom: spacing(0.5),
  },
  sectionHeaderText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  cardWrapper: {
    marginBottom: spacing(1.5),
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardBackground: {
    height: 140,
    justifyContent: 'flex-end',
  },
  cardImage: {
    borderRadius: 16,
    opacity: 0.35,
  },
  cardOverlay: {
    flex: 1,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
    justifyContent: 'space-between',
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  meta: {
    color: '#f0f0f0',
    fontSize: 13,
  },
  ctaRow: {
    marginTop: spacing(1.5),
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  ctaButton: {
    backgroundColor: colors.orange,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.75),
    borderRadius: 999,
  },
  ctaText: {
    color: colors.black,
    fontWeight: '700',
    fontSize: 14,
  },
  loadingText: {
    color: colors.gray,
    marginTop: spacing(1),
  },
  emptyTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing(1),
  },
  emptyText: {
    color: '#aaa',
    textAlign: 'center',
    fontSize: 14,
  },
});