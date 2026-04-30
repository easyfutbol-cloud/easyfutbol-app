import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

const API_BASE_URL = 'https://api.easyfutbol.es/api/kpis';

export default function AdminDashboardScreen() {
  const [activeTab, setActiveTab] = useState('week');
  const [weeklyData, setWeeklyData] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [playersData, setPlayersData] = useState([]);
  const [weekdayData, setWeekdayData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const fetchJson = async (url) => {
    const response = await fetch(url);
    const rawText = await response.text();

    let json;
    try {
      json = JSON.parse(rawText);
    } catch (parseError) {
      console.log('Respuesta no JSON de KPIs:', rawText.slice(0, 300));
      throw new Error(`El servidor no devolvió JSON. Status: ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(json?.error || `Error cargando KPIs. Status: ${response.status}`);
    }

    return json;
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const [week, month, players, weekdays] = await Promise.all([
        fetchJson(`${API_BASE_URL}/dashboard?period=week`),
        fetchJson(`${API_BASE_URL}/dashboard?period=month`),
        fetchJson(`${API_BASE_URL}/players`),
        fetchJson(`${API_BASE_URL}/weekday-repeat`),
      ]);

      setWeeklyData(week);
      setMonthlyData(month);
      setPlayersData(Array.isArray(players?.players) ? players.players : []);
      setWeekdayData(Array.isArray(weekdays?.weekdays) ? weekdays.weekdays : []);
    } catch (err) {
      console.log('Error cargando KPIs:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value, decimals = 0) => Number(value || 0).toFixed(decimals);
  const formatPercent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

  const renderTabButton = (key, label) => {
    const isActive = activeTab === key;

    return (
      <TouchableOpacity
        onPress={() => setActiveTab(key)}
        style={{
          flex: 1,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: isActive ? '#ff5a00' : '#1a1a1a',
          marginHorizontal: 4,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderKpiCard = (label, value) => (
    <View
      style={{
        width: '48%',
        backgroundColor: '#111',
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#252525',
      }}
    >
      <Text style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{value}</Text>
    </View>
  );

  const renderSummary = (data, title) => {
    const topJugadores = Array.isArray(data?.top_jugadores) ? data.top_jugadores : [];

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 14 }}>
          {title}
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {renderKpiCard('Usuarios únicos', formatNumber(data?.usuarios_unicos))}
          {renderKpiCard('Partidos con stats', formatNumber(data?.partidos_jugados))}
          {renderKpiCard('Frecuencia media', formatNumber(data?.frecuencia_media, 2))}
          {renderKpiCard('Repeat rate', formatPercent(data?.repeat_rate))}
          {renderKpiCard('Goles', formatNumber(data?.goles))}
          {renderKpiCard('Asistencias', formatNumber(data?.asistencias))}
          {renderKpiCard('MVPs', formatNumber(data?.mvps))}
        </View>

        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 12, marginBottom: 10 }}>
          Top jugadores
        </Text>

        {topJugadores.length === 0 ? (
          <Text style={{ color: '#aaa' }}>Todavía no hay datos en este periodo.</Text>
        ) : (
          topJugadores.map((item, index) => renderPlayerRow(item, index))
        )}
      </ScrollView>
    );
  };

  const renderPlayerRow = (item, index) => (
    <View
      key={`${item?.id || index}-${index}`}
      style={{
        backgroundColor: '#111',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#252525',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
          #{index + 1} {item?.name || 'Jugador'} · ID {item?.jugador_id || item?.id || '-'}
        </Text>
        <Text style={{ color: '#ff5a00', fontWeight: '800' }}>
          {item?.partidos || 0} partidos
        </Text>
      </View>

      <Text style={{ color: '#aaa', marginTop: 6, fontSize: 13 }}>
        {item?.goles || 0} G · {item?.asistencias || 0} A · {item?.mvps || 0} MVP
      </Text>

      <Text style={{ color: '#777', marginTop: 5, fontSize: 12 }}>
        Partidos jugados: {item?.match_ids || 'Sin partidos'}
      </Text>
    </View>
  );

  const renderWeekdayRow = (item, index) => (
    <View
      key={`${item?.weekday_number || index}-${item?.weekday_name || 'dia'}`}
      style={{
        backgroundColor: '#111',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#252525',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>
          {item?.weekday_name || 'Día'}
        </Text>
        <Text style={{ color: '#ff5a00', fontWeight: '900', fontSize: 16 }}>
          {formatPercent(item?.repeat_rate)}
        </Text>
      </View>

      <Text style={{ color: '#aaa', marginTop: 8, fontSize: 13 }}>
        {item?.repetidores || 0} repetidores de {item?.usuarios_unicos || 0} jugadores únicos
      </Text>

      <Text style={{ color: '#777', marginTop: 5, fontSize: 12 }}>
        {item?.registros || 0} participaciones registradas en stats
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={{ color: '#fff', marginTop: 12 }}>Cargando KPIs...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', padding: 20, justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 10 }}>
          No se pudo cargar el dashboard
        </Text>
        <Text style={{ color: '#ff5a00', fontSize: 15, marginBottom: 16 }}>{error}</Text>
        <TouchableOpacity
          onPress={loadDashboard}
          style={{ backgroundColor: '#ff5a00', padding: 14, borderRadius: 12, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000', padding: 18 }}>
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 14 }}>
        Dashboard KPIs
      </Text>

      <View style={{ flexDirection: 'row', marginBottom: 18 }}>
        {renderTabButton('week', 'Semanal')}
        {renderTabButton('month', 'Mensual')}
        {renderTabButton('players', 'Jugadores')}
        {renderTabButton('weekdays', 'Días')}
      </View>

      {activeTab === 'week' && renderSummary(weeklyData, 'Resumen semanal')}
      {activeTab === 'month' && renderSummary(monthlyData, 'Resumen mensual')}
      {activeTab === 'players' && (
        <FlatList
          data={playersData}
          keyExtractor={(item, index) => String(item?.jugador_id || item?.id || index)}
          ListHeaderComponent={
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 14 }}>
              Jugadores con más partidos
            </Text>
          }
          ListEmptyComponent={<Text style={{ color: '#aaa' }}>Todavía no hay jugadores para mostrar.</Text>}
          renderItem={({ item, index }) => renderPlayerRow(item, index)}
          showsVerticalScrollIndicator={false}
        />
      )}
      {activeTab === 'weekdays' && (
        <FlatList
          data={weekdayData}
          keyExtractor={(item, index) => String(item?.weekday_number || index)}
          ListHeaderComponent={
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 14 }}>
              Repetición por día
            </Text>
          }
          ListEmptyComponent={<Text style={{ color: '#aaa' }}>Todavía no hay datos por día para mostrar.</Text>}
          renderItem={({ item, index }) => renderWeekdayRow(item, index)}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}