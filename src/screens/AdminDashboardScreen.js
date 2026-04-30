import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import axios from 'axios';

export default function DashboardScreen() {
  const [data, setData] = useState(null);

  useEffect(() => {
    axios.get('https://TU_API/api/kpis/dashboard')
      .then(res => setData(res.data))
      .catch(err => console.log(err));
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