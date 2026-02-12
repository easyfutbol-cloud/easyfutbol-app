import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, StatusBar, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { colors, spacing } from '../theme';
import { api } from '../api/client';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';

// Helper: evita duplicar /api si tu api.defaults.baseURL ya termina en /api
const apiPath = (p) => {
  const base = String(api?.defaults?.baseURL || '');
  let path = String(p || '');
  if (!path.startsWith('/')) path = `/${path}`;
  if (base.endsWith('/api') && path.startsWith('/api/')) {
    // '/api/admin/...' -> '/admin/...'
    path = path.replace(/^\/api/, '');
  }
  return path;
};

const debugHttpError = (e, context = '') => {
  const status = e?.response?.status;
  const baseURL = e?.config?.baseURL || api?.defaults?.baseURL;
  const url = e?.config?.url;
  const method = (e?.config?.method || '').toUpperCase();
  const data = e?.response?.data;
  console.log(`HTTP ERROR ${context}:`, { status, method, baseURL, url, data });
  return { status, method, baseURL, url, data };
};

export default function AdminCreateMatchScreen() {
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState('');
  const [fields, setFields] = useState([]);
  const [fieldId, setFieldId] = useState('');
  const [fieldName, setFieldName] = useState(''); // alternativo si no eliges uno existente

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 2 * 24 * 3600 * 1000)); // por defecto +2 días
  const [showDate, setShowDate] = useState(false);

  const [time, setTime] = useState(new Date());
  const [showTime, setShowTime] = useState(false);

  const [price, setPrice] = useState('3.90');
  const [capacity, setCapacity] = useState('14');
  const [duration, setDuration] = useState('60');

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Cargar ciudades permitidas
  useEffect(() => {
    const loadCities = async () => {
      try {
        setLoading(true);

        const { data } = await api.get(apiPath('/api/admin/cities'));

        const fallbackCities = [
          'Valladolid',
          'León',
          'Oviedo',
          'Palencia',
          'Salamanca',
          'Gijón',
          'Avilés',
          'Bilbao',
        ];

        const list = Array.isArray(data?.cities)
          ? data.cities
          : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
          ? data
          : fallbackCities;

        console.log('CITIES ADMIN:', list);
        setCities(list);
      } catch (e) {
        const info = debugHttpError(e, 'GET cities');
        console.log('Error cargando ciudades para admin:', info?.data || e.message || e);
        // si falla la API, usamos igualmente el fallback
        setCities([
          'Valladolid',
          'León',
          'Oviedo',
          'Palencia',
          'Salamanca',
          'Gijón',
          'Avilés',
          'Bilbao',
        ]);
      } finally {
        setLoading(false);
      }
    };

    loadCities();
  }, []);

  // Cargar campos al seleccionar ciudad
  useEffect(() => {
    if (!city) return;
    api.get(apiPath('/api/admin/fields'), { params: { city } })
      .then(r => setFields(r.data?.data || []))
      .catch((e) => { debugHttpError(e, 'GET fields'); setFields([]); });
  }, [city]);

  const dateStr = useMemo(() => {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    const d = String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }, [date]);

  const timeStr = useMemo(() => {
    const h = String(time.getHours()).padStart(2,'0');
    const m = String(time.getMinutes()).padStart(2,'0');
    return `${h}:${m}`;
  }, [time]);

  const create = async () => {
    try {
      const cleanTitle = title.trim();
      const cleanFieldName = fieldName.trim();

      if (!cleanTitle) return Alert.alert('Falta título');
      if (!city) return Alert.alert('Selecciona ciudad');
      if (!fieldId && !cleanFieldName) return Alert.alert('Selecciona o escribe un campo');

      // Normalizar precio (aceptar coma o punto)
      const priceNum = Number(String(price).replace(',', '.'));
      const capacityNum = Number(capacity);
      const durationNum = Number(duration);

      if (!price || isNaN(priceNum) || priceNum <= 0) {
        return Alert.alert('Precio inválido', 'Introduce un precio mayor que 0');
      }
      if (!capacity || isNaN(capacityNum) || capacityNum <= 0) {
        return Alert.alert('Capacidad inválida', 'Introduce un número de plazas mayor que 0');
      }
      if (!duration || isNaN(durationNum) || durationNum <= 0) {
        return Alert.alert('Duración inválida', 'Introduce una duración en minutos mayor que 0');
      }

      setCreating(true);

      const body = {
        title: cleanTitle,
        city,
        date: dateStr,          // YYYY-MM-DD (lo que espera el backend)
        time: timeStr,          // HH:mm (24h)
        price_eur: priceNum,    // se usa directamente en matches/:id/pay (Stripe)
        capacity: capacityNum,
        duration_min: durationNum,
      };

      if (fieldId) {
        body.field_id = Number(fieldId);
      } else {
        body.field_name = cleanFieldName;
      }

      const { data } = await api.post(apiPath('/api/admin/matches'), body);

      if (!data?.ok) {
        throw new Error(data?.msg || 'No se pudo crear el partido');
      }

      Alert.alert('Partido creado', `ID: ${data.id}`);

      // Reset básico para poder crear más partidos en la misma ciudad/campo
      setTitle('');
      setFieldId('');
      setFieldName('');
      setPrice('3.90');
      setCapacity('14');
      setDuration('60');
    } catch (e) {
      const info = debugHttpError(e, 'POST create match');
      console.log('Error creando partido admin', info?.data || e.message || e);
      Alert.alert(
        'Error',
        info?.status
          ? `HTTP ${info.status} — ${info.method} ${String(info?.url || '')}\n\n${info?.data?.msg || e?.message || 'No se pudo crear el partido.'}`
          : (e?.message || 'No se pudo crear el partido. Inténtalo de nuevo')
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loading}>Cargando…</Text>
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'interactive'}
      >
        <StatusBar barStyle="light-content" />
        <Text style={styles.title}>Crear Partido</Text>

        <Text style={styles.label}>Título</Text>
        <TextInput
          style={styles.input}
          placeholder="Miércoles Noche"
          placeholderTextColor="#777"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Ciudad</Text>
        <Picker
          selectedValue={city}
          onValueChange={(v) => { setCity(v); setFieldId(''); setFieldName(''); }}
          style={styles.picker}
          dropdownIconColor="#fff"
        >
          <Picker.Item label="Selecciona ciudad" value="" color="#777" />
          {cities.map((c) => (
            <Picker.Item key={c} label={c} value={c} color="#fff" />
          ))}
        </Picker>

        {city ? (
          <>
            <Text style={styles.label}>Campo (elige uno o escribe)</Text>
            <Picker
              selectedValue={fieldId}
              onValueChange={(v) => { setFieldId(v); if (v) setFieldName(''); }}
              style={styles.picker}
              dropdownIconColor="#fff"
            >
              <Picker.Item label="(Nuevo campo…)" value="" color="#777" />
              {fields.map((f) => (
                <Picker.Item
                  key={f.id}
                  label={f.name}
                  value={String(f.id)}
                  color="#fff"
                />
              ))}
            </Picker>

            {!fieldId && (
              <TextInput
                style={styles.input}
                placeholder="Nombre del campo"
                placeholderTextColor="#777"
                value={fieldName}
                onChangeText={setFieldName}
              />
            )}
          </>
        ) : null}

        <Text style={styles.label}>Fecha</Text>
        <TouchableOpacity style={styles.btnSmall} onPress={() => setShowDate(true)}>
          <Text style={styles.btnSmallText}>{dateStr}</Text>
        </TouchableOpacity>
        {showDate && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            themeVariant="dark"
            textColor="#fff"
            onChange={(_, d) => {
              setShowDate(false);
              if (d) setDate(d);
            }}
          />
        )}

        <Text style={styles.label}>Hora</Text>
        <TouchableOpacity style={styles.btnSmall} onPress={() => setShowTime(true)}>
          <Text style={styles.btnSmallText}>{timeStr}</Text>
        </TouchableOpacity>
        {showTime && (
          <DateTimePicker
            value={time}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            themeVariant="dark"
            textColor="#fff"
            onChange={(_, d) => {
              setShowTime(false);
              if (d) setTime(d);
            }}
          />
        )}

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.label}>Precio (€)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
            />
          </View>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.label}>Capacidad</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={capacity}
              onChangeText={setCapacity}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Duración (min)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={duration}
              onChangeText={setDuration}
            />
          </View>
        </View>

        <TouchableOpacity
          style={styles.btn}
          onPress={create}
          disabled={creating || !city || !(fieldId || fieldName) || !title}
        >
          {creating ? <ActivityIndicator /> : <Text style={styles.btnText}>Crear partido</Text>}
        </TouchableOpacity>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.black },
  scrollContent:{ padding:spacing(2), paddingBottom:spacing(3) },
  title:{ color:colors.white, fontSize:22, fontWeight:'800', marginBottom:spacing(2), textAlign:'center' },
  label:{ color:'#ddd', fontWeight:'700', marginTop:spacing(1), marginBottom:4 },
  input:{ backgroundColor:'#111', borderWidth:1, borderColor:'#222', color:'#fff', padding:spacing(1.2), borderRadius:10 },
  picker:{ color:'#fff', backgroundColor:'#111', borderRadius:8 },
  row:{ flexDirection:'row', alignItems:'flex-start', marginTop:spacing(1) },
  btn:{ backgroundColor:colors.orange, paddingVertical:spacing(1.6), borderRadius:12, alignItems:'center', marginTop:spacing(2) },
  btnText:{ color:colors.black, fontWeight:'800', fontSize:16 },
  btnSmall:{ backgroundColor:'#222', paddingVertical:8, paddingHorizontal:12, borderRadius:8, alignSelf:'flex-start' },
  btnSmallText:{ color:'#fff', fontWeight:'700' },
  loading:{ color:colors.gray, textAlign:'center' }
});
