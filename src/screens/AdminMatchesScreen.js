

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://api.easyfutbol.es';

const STATUS_LABELS = {
  draft: 'Borrador',
  open: 'Abierto',
  full: 'Completo',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
  finished: 'Finalizado',
};

function formatDate(dateString) {
  if (!dateString) return 'Sin fecha';

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(timeString) {
  if (!timeString) return '--:--';
  return String(timeString).slice(0, 5);
}

export default function AdminMatchesScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchMatches = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const token = await AsyncStorage.getItem('token');

      if (!token) {
        setError('No se encontró la sesión. Inicia sesión de nuevo.');
        setMatches([]);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/matches`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'No se pudieron cargar los partidos');
      }

      setMatches(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Error cargando partidos');
      setMatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMatches();
    }, [fetchMatches])
  );

  const handleEditPress = (match) => {
    navigation.navigate('AdminMatchEdit', {
      matchId: match.id,
      matchTitle: match.title,
    });
  };

  const handleCreatePress = () => {
    if (navigation?.navigate) {
      navigation.navigate('AdminCreateMatch');
    } else {
      Alert.alert('Pantalla no disponible', 'Aún no está conectada la pantalla de crear partido.');
    }
  };

  const handleStatsPress = (match) => {
    navigation.navigate('AdminMatchStatsImport', {
      matchId: match.id,
      matchTitle: match.title,
    });
  };
  const handleRosterPress = (match) => navigation.navigate('AdminMatchRoster', { matchId:match.id,matchTitle:match.title });
  const duplicateMatch = (match) => Alert.alert('Duplicar partido',`Se creará una copia de ${match.title} exactamente una semana después.`,[{text:'Cancelar',style:'cancel'},{text:'Duplicar',onPress:async()=>{try{const token=await AsyncStorage.getItem('token');const response=await fetch(`${API_BASE_URL}/api/admin/matches/${match.id}/duplicate`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error(data?.error||'No se pudo duplicar');Alert.alert('Partido duplicado','La copia ya aparece en el listado.');fetchMatches();}catch(error){Alert.alert('Duplicar',error.message);}}}]);

  const renderMatchCard = ({ item }) => {
    const statusLabel = STATUS_LABELS[item.status] || item.status || 'Sin estado';

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.card}
        onPress={() => handleEditPress(item)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.title}>{item.title || 'Partido sin nombre'}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.metaText}>
          {formatDate(item.match_date)} · {formatTime(item.start_time)} - {formatTime(item.end_time)}
        </Text>

        <Text style={styles.metaText}>
          {item.city || 'Sin ciudad'} · {item.field_name || 'Sin campo'}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Plazas</Text>
            <Text style={styles.statValue}>{item.total_slots ?? '-'}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Libres</Text>
            <Text style={styles.statValue}>{item.available_slots ?? '-'}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Espera</Text>
            <Text style={styles.statValue}>{item.waitlist_count ?? 0}</Text>
          </View>
        </View>

        {Number(item.risk)===1&&<View style={styles.riskCard}><Text style={styles.riskTitle}>RIESGO DE NO COMPLETARSE</Text><Text style={styles.riskText}>Faltan {item.available_slots} jugadores y quedan menos de 48 horas.</Text></View>}

        <TouchableOpacity style={styles.rosterButton} onPress={() => handleRosterPress(item)}><Text style={styles.rosterButtonText}>Ver quién viene y colores · {item.confirmed_count||0}</Text></TouchableOpacity>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.editButton} onPress={() => handleEditPress(item)}>
            <Text style={styles.editButtonText}>Editar partido</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statsButton} onPress={() => handleStatsPress(item)}>
            <Text style={styles.statsButtonText}>Cargar estadísticas</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.duplicateButton} onPress={()=>duplicateMatch(item)}><Text style={styles.duplicateText}>Duplicar una semana después</Text></TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Cargando partidos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Text style={styles.screenTitle}>Administrar partidos</Text>
        <Text style={styles.screenSubtitle}>
          Aquí puedes revisar y editar los partidos ya creados.
        </Text>

        <TouchableOpacity style={styles.createButton} onPress={handleCreatePress}>
          <Text style={styles.createButtonText}>Crear nuevo partido</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scheduledButton} onPress={() => navigation.navigate('AdminScheduledMatches')}>
          <Text style={styles.scheduledButtonText}>Ver partidos programados</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchMatches()}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={matches}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMatchCard}
        contentContainerStyle={matches.length === 0 ? styles.emptyListContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchMatches(true)}
            tintColor="#ff5a00"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No hay partidos disponibles</Text>
            <Text style={styles.emptySubtitle}>
              Cuando existan partidos creados, aparecerán aquí para editarlos.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#fff',
    fontSize: 16,
  },
  topSection: {
    marginBottom: 18,
  },
  screenTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  screenSubtitle: {
    color: '#b3b3b3',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#ff5a00',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  scheduledButton: {
    borderWidth: 1,
    borderColor: '#ff5a00',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  scheduledButtonText: {
    color: '#ff8c4d',
    fontSize: 15,
    fontWeight: '800',
  },
  errorBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#ff5a00',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff5a00',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyState: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#9c9c9c',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  statusBadge: {
    backgroundColor: 'rgba(255, 90, 0, 0.16)',
    borderWidth: 1,
    borderColor: '#ff5a00',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: '#ff8c4d',
    fontSize: 12,
    fontWeight: '700',
  },
  metaText: {
    color: '#c2c2c2',
    fontSize: 14,
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 16,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#181818',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252525',
  },
  statLabel: {
    color: '#9f9f9f',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#ff5a00',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  statsButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ff5a00',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  statsButtonText: {
    color: '#ff8c4d',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  rosterButton:{backgroundColor:'#f1f1f1',borderRadius:12,paddingVertical:13,alignItems:'center',marginBottom:10},rosterButtonText:{color:'#111',fontWeight:'900',fontSize:13},duplicateButton:{paddingVertical:12,alignItems:'center',marginTop:4},duplicateText:{color:'#888',fontSize:11,fontWeight:'800'},riskCard:{backgroundColor:'rgba(244,201,93,.09)',borderWidth:1,borderColor:'rgba(244,201,93,.3)',borderRadius:12,padding:11,marginBottom:11},riskTitle:{color:'#f4c95d',fontSize:9,fontWeight:'900',letterSpacing:.8},riskText:{color:'#aaa07f',fontSize:10,marginTop:4},
});
