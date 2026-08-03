import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, StatusBar, Platform, ScrollView, TouchableWithoutFeedback, Keyboard, Switch } from 'react-native';
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

const getLocationSlugFromCity = (cityName = '') => {
  const normalized = String(cityName || '').trim().toLowerCase();
  if (['avilés', 'aviles', 'oviedo', 'gijón', 'gijon', 'asturias'].includes(normalized)) return 'asturias';
  return 'valladolid';
};


const getBackendDateTimeFromLocal = (dateValue, timeValue) => {
  const localMatchDate = new Date(
    dateValue.getFullYear(),
    dateValue.getMonth(),
    dateValue.getDate(),
    timeValue.getHours(),
    timeValue.getMinutes(),
    0,
    0
  );

  const iso = localMatchDate.toISOString();
  return {
    backendDate: iso.slice(0, 10),
    backendTime: iso.slice(11, 16),
  };
};

const getLocalMatchDate = (dateValue, timeValue) => new Date(
  dateValue.getFullYear(),
  dateValue.getMonth(),
  dateValue.getDate(),
  timeValue.getHours(),
  timeValue.getMinutes(),
  0,
  0
);

const getAutomaticPublishDate = (dateValue) => new Date(
  dateValue.getFullYear(),
  dateValue.getMonth(),
  dateValue.getDate() - 6,
  16,
  0,
  0,
  0
);

const formatScheduleDate = (value) => value.toLocaleString('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

const getAutoMatchTitle = (dateValue, fieldDisplayName) => {
  const cleanField = String(fieldDisplayName || '').trim();
  if (!dateValue || !cleanField) return '';

  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];

  return `${dateValue.getDate()} de ${months[dateValue.getMonth()]} - ${cleanField}`;
};

export default function AdminCreateMatchScreen({ navigation }) {
  const [cities, setCities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [city, setCity] = useState('');
  const [fields, setFields] = useState([]);
  const [fieldId, setFieldId] = useState('');
  const [fieldName, setFieldName] = useState(''); // alternativo si no eliges uno existente

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date(Date.now() + 2 * 24 * 3600 * 1000)); // por defecto +2 días
  const [showDate, setShowDate] = useState(false);

  const [time, setTime] = useState(new Date());
  const [showTime, setShowTime] = useState(false);

  const EASY_PASS_COST = 1;
  const [capacity, setCapacity] = useState('14');
  const [duration, setDuration] = useState('60');
  const [hasAftergame, setHasAftergame] = useState(false);
  const selectedLocationSlug = getLocationSlugFromCity(city);
  const selectedLocation = locations.find((item) => String(item.slug) === selectedLocationSlug);
  const selectedLocationId = selectedLocation ? Number(selectedLocation.id) : selectedLocationSlug === 'asturias' ? 2 : 1;
  const selectedLocationName = selectedLocation?.name || (selectedLocationSlug === 'asturias' ? 'Asturias' : 'Valladolid');

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [batch, setBatch] = useState([]);

  // Cargar ciudades permitidas
  useEffect(() => {
    const loadCities = async () => {
      try {
        setLoading(true);

        const { data } = await api.get(apiPath('/api/admin/cities'));

        try {
          const locationsRes = await api.get(apiPath('/api/easypass/locations'));
          const locationList = Array.isArray(locationsRes?.data?.data) ? locationsRes.data.data : [];
          setLocations(locationList);
        } catch (locationsError) {
          debugHttpError(locationsError, 'GET easypass locations');
          setLocations([
            { id: 1, name: 'Valladolid', slug: 'valladolid' },
            { id: 2, name: 'Asturias', slug: 'asturias' },
          ]);
        }

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
        setLocations([{ id: 1, name: 'Valladolid', slug: 'valladolid' }, { id: 2, name: 'Asturias', slug: 'asturias' }]);
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

  const backendDateTime = useMemo(() => getBackendDateTimeFromLocal(date, time), [date, time]);
  const automaticPublishDate = useMemo(() => getAutomaticPublishDate(date), [date]);

  const selectedField = useMemo(
    () => fields.find((item) => String(item.id) === String(fieldId)),
    [fields, fieldId]
  );

  const resolvedFieldName = selectedField?.name || fieldName.trim();

  const autoMatchTitle = useMemo(
    () => getAutoMatchTitle(date, resolvedFieldName),
    [date, resolvedFieldName]
  );

  useEffect(() => {
    setTitle(autoMatchTitle);
  }, [autoMatchTitle]);

  const buildMatch = () => {
      const cleanFieldName = fieldName.trim();
      const cleanTitle = autoMatchTitle.trim();

      if (!cleanTitle) { Alert.alert('Falta título', 'Selecciona la fecha y el campo para generar el título automáticamente.'); return null; }
      if (!city) { Alert.alert('Selecciona ciudad'); return null; }
      if (!fieldId && !cleanFieldName) { Alert.alert('Selecciona o escribe un campo'); return null; }

      const capacityNum = Number(capacity);
      const durationNum = Number(duration);

      if (!capacity || isNaN(capacityNum) || capacityNum <= 0) {
        Alert.alert('Capacidad inválida', 'Introduce un número de plazas mayor que 0'); return null;
      }
      if (!duration || isNaN(durationNum) || durationNum <= 0) {
        Alert.alert('Duración inválida', 'Introduce una duración en minutos mayor que 0'); return null;
      }

      const { backendDate, backendTime } = backendDateTime;
      const body = {
        title: cleanTitle,
        city,
        date: backendDate,      // UTC para que en la app se vea la hora local correcta
        time: backendTime,      // UTC para evitar el desfase de +2h en España
        price_eur: 0,
        easypass_cost: EASY_PASS_COST,
        location_id: selectedLocationId,
        location_slug: selectedLocationSlug,
        capacity: capacityNum,
        duration_min: durationNum,
        has_aftergame: hasAftergame ? 1 : 0,
      };

      if (fieldId) {
        body.field_id = Number(fieldId);
      } else {
        body.field_name = cleanFieldName;
      }

      return body;
  };

  const create = async () => {
    const body = buildMatch();
    if (!body) return;

    if (automatic) {
      const startsAt = getLocalMatchDate(date, time);
      const scheduledItem = {
        ...body,
        starts_at: startsAt.toISOString(),
        publish_at: automaticPublishDate.toISOString(),
        field_label: resolvedFieldName,
        local_starts_label: `${dateStr} · ${timeStr}`,
      };
      setBatch((current) => [...current, scheduledItem]);
      setDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1));
      return;
    }

    try {
      setCreating(true);

      const { data } = await api.post(apiPath('/api/admin/matches'), body);

      if (!data?.ok) {
        throw new Error(data?.msg || 'No se pudo crear el partido');
      }

      Alert.alert('Partido creado', `ID: ${data.id}`);

      // Reset básico para poder crear más partidos en la misma ciudad/campo
      setTitle('');
      setFieldId('');
      setFieldName('');
      setCapacity('14');
      setDuration('60');
      setHasAftergame(false);
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

  const scheduleBatch = async () => {
    if (!batch.length) return;
    try {
      setCreating(true);
      const matches = batch.map(({ field_label, local_starts_label, date: ignoredDate, time: ignoredTime, ...item }) => item);
      const { data } = await api.post(apiPath('/api/admin/scheduled-matches/batch'), { matches });
      Alert.alert('Automatización guardada', `${data?.created || batch.length} partidos se publicarán automáticamente.`);
      setBatch([]);
      navigation?.navigate('AdminScheduledMatches');
    } catch (e) {
      const info = debugHttpError(e, 'POST scheduled matches batch');
      Alert.alert('No se pudo programar', info?.data?.msg || e?.message || 'Inténtalo de nuevo.');
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

        <TouchableOpacity style={styles.scheduledLink} onPress={() => navigation?.navigate('AdminScheduledMatches')}>
          <Text style={styles.scheduledLinkText}>Ver partidos programados →</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Título automático</Text>
        <View style={styles.autoTitleBox}>
          <Text style={autoMatchTitle ? styles.autoTitleText : styles.autoTitlePlaceholder}>
            {autoMatchTitle || 'Selecciona fecha y campo para generar el título'}
          </Text>
        </View>

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
          <View style={styles.locationNoticeBox}>
            <Text style={styles.locationNoticeTitle}>EasyPass del partido</Text>
            <Text style={styles.locationNoticeText}>
              Este partido usará EasyPass de {selectedLocationName}. Los jugadores solo podrán apuntarse con saldo de {selectedLocationName}.
            </Text>
          </View>
        ) : null}

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

        <Text style={styles.label}>Coste</Text>
        <View style={styles.fixedInfoBox}>
          <Text style={styles.fixedInfoText}>Este partido costará 1 EasyPass de {selectedLocationName}</Text>
        </View>
        <Text style={styles.timeHelpText}>
          Hora visible para jugadores: {dateStr} a las {timeStr}. El sistema la guarda internamente como {backendDateTime.backendDate} {backendDateTime.backendTime} para evitar el desfase horario.
        </Text>

        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={styles.label}>Capacidad</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={capacity}
              onChangeText={setCapacity}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <Text style={styles.label}>Duración (min)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={duration}
              onChangeText={setDuration}
            />
          </View>
        </View>

        <View style={styles.switchCard}>
          <View style={styles.switchTextWrap}>
            <Text style={styles.switchTitle}>Aftergame</Text>
            <Text style={styles.switchSubtitle}>
              Activa esta opción si el partido incluye ofertas del aftergame.
            </Text>
          </View>
          <Switch
            value={hasAftergame}
            onValueChange={setHasAftergame}
            trackColor={{ false: '#333', true: colors.orange }}
            thumbColor={hasAftergame ? '#fff' : '#ccc'}
          />
        </View>

        <View style={[styles.switchCard, automatic && styles.automaticCard]}>
          <View style={styles.switchTextWrap}>
            <Text style={styles.switchTitle}>Publicación automática</Text>
            <Text style={styles.switchSubtitle}>
              Añade varios partidos y se publicarán seis días antes a las 16:00.
            </Text>
          </View>
          <Switch
            value={automatic}
            onValueChange={setAutomatic}
            trackColor={{ false: '#333', true: colors.orange }}
            thumbColor={automatic ? '#fff' : '#ccc'}
          />
        </View>

        {automatic ? (
          <View style={styles.scheduleNotice}>
            <Text style={styles.scheduleNoticeLabel}>ESTE PARTIDO SE PUBLICARÁ</Text>
            <Text style={styles.scheduleNoticeValue}>{formatScheduleDate(automaticPublishDate)}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.btn}
          onPress={create}
          disabled={creating || !city || !(fieldId || fieldName) || !autoMatchTitle}
        >
          {creating ? <ActivityIndicator /> : <Text style={styles.btnText}>{automatic ? 'Añadir partido al lote' : 'Crear partido'}</Text>}
        </TouchableOpacity>

        {batch.length ? (
          <View style={styles.batchSection}>
            <Text style={styles.batchTitle}>Lote preparado · {batch.length}</Text>
            {batch.map((item, index) => (
              <View key={`${item.starts_at}-${index}`} style={styles.batchItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.batchItemTitle}>{item.title}</Text>
                  <Text style={styles.batchItemMeta}>{item.local_starts_label} · {item.city}</Text>
                </View>
                <TouchableOpacity onPress={() => setBatch((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  <Text style={styles.removeText}>Quitar</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.confirmBatchButton} disabled={creating} onPress={scheduleBatch}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBatchText}>Programar {batch.length} partidos</Text>}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.black },
  scrollContent:{ padding:spacing(2), paddingBottom:spacing(3) },
  title:{ color:colors.white, fontSize:22, fontWeight:'800', marginBottom:spacing(2), textAlign:'center' },
  scheduledLink:{ alignSelf:'center', borderWidth:1, borderColor:'rgba(255,90,0,0.5)', borderRadius:999, paddingHorizontal:14, paddingVertical:8, marginTop:-8, marginBottom:12 },
  scheduledLinkText:{ color:'#ff8c4d', fontWeight:'800', fontSize:13 },
  label:{ color:'#ddd', fontWeight:'700', marginTop:spacing(1), marginBottom:4 },
  input:{ backgroundColor:'#111', borderWidth:1, borderColor:'#222', color:'#fff', padding:spacing(1.2), borderRadius:10 },
  autoTitleBox:{ backgroundColor:'#141414', borderWidth:1, borderColor:'rgba(255,90,0,0.35)', padding:spacing(1.2), borderRadius:10 },
  autoTitleText:{ color:'#fff', fontWeight:'900', fontSize:15 },
  autoTitlePlaceholder:{ color:'#777', fontWeight:'700', fontSize:14 },
  picker:{ color:'#fff', backgroundColor:'#111', borderRadius:8 },
  fixedInfoBox:{ backgroundColor:'#111', borderWidth:1, borderColor:'#222', padding:spacing(1.2), borderRadius:10 },
  fixedInfoText:{ color:'#fff', fontWeight:'700' },
  locationNoticeBox:{
    backgroundColor:'rgba(255,90,0,0.10)',
    borderWidth:1,
    borderColor:'rgba(255,90,0,0.35)',
    padding:spacing(1.2),
    borderRadius:10,
    marginTop:spacing(1),
  },
  locationNoticeTitle:{ color:colors.orange, fontWeight:'900', marginBottom:4 },
  locationNoticeText:{ color:'#fff', fontWeight:'700', fontSize:13, lineHeight:18 },
  timeHelpText:{ color:'#999', fontSize:12, fontWeight:'700', lineHeight:17, marginTop:6 },
  row:{ flexDirection:'row', alignItems:'flex-start', marginTop:spacing(1) },
  switchCard:{
    backgroundColor:'#111',
    borderWidth:1,
    borderColor:'#222',
    borderRadius:12,
    padding:spacing(1.4),
    marginTop:spacing(1.5),
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between',
  },
  switchTextWrap:{
    flex:1,
    paddingRight:spacing(1),
  },
  switchTitle:{
    color:colors.white,
    fontWeight:'800',
    fontSize:15,
    marginBottom:4,
  },
  switchSubtitle:{
    color:'#bbb',
    fontSize:13,
    lineHeight:18,
  },
  automaticCard:{ borderColor:'rgba(255,90,0,0.6)', backgroundColor:'rgba(255,90,0,0.08)' },
  scheduleNotice:{ backgroundColor:'#17110e', borderRadius:12, padding:13, marginTop:10, borderLeftWidth:3, borderLeftColor:colors.orange },
  scheduleNoticeLabel:{ color:'#a76a48', fontSize:10, fontWeight:'900', letterSpacing:0.8 },
  scheduleNoticeValue:{ color:'#fff', fontSize:15, fontWeight:'900', marginTop:4, textTransform:'capitalize' },
  batchSection:{ marginTop:18, backgroundColor:'#111', borderRadius:16, borderWidth:1, borderColor:'#292929', padding:14 },
  batchTitle:{ color:'#fff', fontSize:17, fontWeight:'900', marginBottom:10 },
  batchItem:{ flexDirection:'row', alignItems:'center', borderTopWidth:1, borderTopColor:'#242424', paddingVertical:11, gap:10 },
  batchItemTitle:{ color:'#fff', fontWeight:'800', fontSize:14 },
  batchItemMeta:{ color:'#999', fontSize:12, marginTop:3 },
  removeText:{ color:'#ff8c73', fontWeight:'800', fontSize:12 },
  confirmBatchButton:{ backgroundColor:'#168b4f', borderRadius:12, paddingVertical:14, alignItems:'center', marginTop:8 },
  confirmBatchText:{ color:'#fff', fontWeight:'900', fontSize:15 },
  btn:{ backgroundColor:colors.orange, paddingVertical:spacing(1.6), borderRadius:12, alignItems:'center', marginTop:spacing(2) },
  btnText:{ color:colors.black, fontWeight:'800', fontSize:16 },
  btnSmall:{ backgroundColor:'#222', paddingVertical:8, paddingHorizontal:12, borderRadius:8, alignSelf:'flex-start' },
  btnSmallText:{ color:'#fff', fontWeight:'700' },
  loading:{ color:colors.gray, textAlign:'center' }
});
