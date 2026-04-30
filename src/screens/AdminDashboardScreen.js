import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';

export default function AdminDashboardScreen() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const response = await fetch('https://easyfutbol.es/api/kpis/dashboard');
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json?.error || 'Error cargando KPIs');
        }

        setData(json);
      } catch (err) {  
        console.log('Error cargando KPIs:', err.message);
      }
    };

    loadDashboard();
  }, []);

  if (!data) return <ActivityIndicator size="large" color="#ff5a00" />;

  return (
    <View style={{ flex: 1, backgroundColor: '#000', padding: 20 }}>
      
      <Text style={{ color: '#fff', fontSize: 24, marginBottom: 20 }}>
        Dashboard
      </Text>

      {/* KPIs */}
      <Text style={{ color: '#ff5a00' }}>Usuarios únicos: {data.usuarios_unicos}</Text>
      <Text style={{ color: '#ff5a00' }}>Frecuencia: {data.frecuencia_media.toFixed(2)}</Text>
      <Text style={{ color: '#ff5a00' }}>Repeat Rate: {(data.repeat_rate * 100).toFixed(1)}%</Text>
      <Text style={{ color: '#ff5a00' }}>Ocupación media: {data.ocupacion_media.toFixed(1)}</Text>

      {/* Top jugadores */}
      <Text style={{ color: '#fff', marginTop: 20, fontSize: 18 }}>
        Top jugadores
      </Text>

      <FlatList
        data={data.top_jugadores}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <Text style={{ color: '#fff' }}>
            {item.name} - {item.partidos} partidos
          </Text>
        )}
      />
    </View>
  );
}