import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { api } from '../api/client';
import { colors, spacing } from '../theme';

export default function AdminEasyPassScreen() {
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const parsedAmount = useMemo(() => Number(amount), [amount]);
  const isPositive = parsedAmount > 0;
  const isNegative = parsedAmount < 0;
  const canSubmit =
    userId.trim() !== '' &&
    reason.trim() !== '' &&
    Number.isInteger(parsedAmount) &&
    parsedAmount !== 0 &&
    !loading;

  const fillPreset = (presetAmount, presetReason) => {
    setAmount(String(presetAmount));
    setReason(presetReason);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert('Revisa los datos', 'Introduce un ID válido, una cantidad entera distinta de 0 y un motivo.');
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const res = await api.post(`/admin/users/${userId.trim()}/easypass-adjust`, {
        amount: parsedAmount,
        reason: reason.trim(),
      });

      const payload = res?.data;

      if (!payload?.ok) {
        Alert.alert('Error', payload?.msg || 'No se pudo aplicar el ajuste de EasyPass.');
        return;
      }

      const nextResult = payload?.data || null;
      setResult(nextResult);

      Alert.alert(
        'Ajuste aplicado',
        `${parsedAmount > 0 ? 'Se han añadido' : 'Se han descontado'} ${Math.abs(parsedAmount)} EasyPass correctamente.`
      );
    } catch (error) {
      const msg = error?.response?.data?.msg || 'No se pudo aplicar el ajuste de EasyPass.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Control de EasyPass</Text>
      <Text style={styles.subtitle}>
        Ajusta manualmente el saldo de un usuario y deja registrado el motivo.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>ID del usuario</Text>
        <TextInput
          value={userId}
          onChangeText={setUserId}
          placeholder="Ej. 12"
          placeholderTextColor="#777"
          keyboardType="number-pad"
          style={styles.input}
        />

        <Text style={styles.label}>Cantidad de EasyPass</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="Ej. 3 o -1"
          placeholderTextColor="#777"
          keyboardType="numbers-and-punctuation"
          style={styles.input}
        />

        <View style={styles.helperRow}>
          <Text style={[styles.helperText, isPositive && styles.helperPositive]}>
            {isPositive ? `Se sumarán ${parsedAmount} EasyPass` : 'Usa un número positivo para añadir'}
          </Text>
          <Text style={[styles.helperText, isNegative && styles.helperNegative]}>
            {isNegative ? `Se restarán ${Math.abs(parsedAmount)} EasyPass` : 'Usa un número negativo para descontar'}
          </Text>
        </View>

        <Text style={styles.label}>Motivo</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Ej. Compensación por incidencia"
          placeholderTextColor="#777"
          multiline
          style={[styles.input, styles.textarea]}
        />

        <Text style={styles.presetsTitle}>Accesos rápidos</Text>
        <View style={styles.presetsWrap}>
          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => fillPreset(1, 'Compensación por incidencia')}
            activeOpacity={0.85}
          >
            <Text style={styles.presetText}>+1 Incidencia</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => fillPreset(3, 'Regalo promocional EasyFutbol')}
            activeOpacity={0.85}
          >
            <Text style={styles.presetText}>+3 Promo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.presetBtn}
            onPress={() => fillPreset(-1, 'Ajuste por error de reserva')}
            activeOpacity={0.85}
          >
            <Text style={styles.presetText}>-1 Error</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={!canSubmit}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.submitText}>Aplicar ajuste</Text>
          )}
        </TouchableOpacity>
      </View>

      {result ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Resultado</Text>
          <Text style={styles.resultLine}>Usuario: {result?.user?.name || '-'} ({result?.user?.email || '-'})</Text>
          <Text style={styles.resultLine}>ID: {result?.user?.id ?? '-'}</Text>
          <Text style={styles.resultLine}>Ajuste aplicado: {result?.amount ?? 0}</Text>
          <Text style={styles.resultLine}>Motivo: {result?.reason || '-'}</Text>
          <Text style={styles.resultBalance}>Saldo actual: {result?.easyPassBalance ?? 0} EasyPass</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  content: {
    padding: spacing(2),
    paddingBottom: spacing(4),
  },
  title: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#aaaaaa',
    marginTop: spacing(0.75),
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    marginTop: spacing(2),
    backgroundColor: '#111',
    borderRadius: 18,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: '#262626',
  },
  label: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: spacing(0.75),
    marginTop: spacing(1.5),
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2d2d2d',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.white,
    fontSize: 15,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  helperRow: {
    marginTop: spacing(0.75),
    gap: spacing(0.5),
  },
  helperText: {
    color: '#8b8b8b',
    fontSize: 12,
    fontWeight: '700',
  },
  helperPositive: {
    color: '#7CFC98',
  },
  helperNegative: {
    color: '#ff8c8c',
  },
  presetsTitle: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
    marginTop: spacing(2),
    marginBottom: spacing(1),
  },
  presetsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(1),
  },
  presetBtn: {
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#323232',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 12,
  },
  submitBtn: {
    marginTop: spacing(2),
    backgroundColor: colors.orange,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 15,
  },
  resultCard: {
    marginTop: spacing(2),
    backgroundColor: '#111',
    borderRadius: 18,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: '#262626',
  },
  resultTitle: {
    color: colors.orange,
    fontWeight: '900',
    fontSize: 16,
    marginBottom: spacing(1),
  },
  resultLine: {
    color: colors.white,
    fontSize: 14,
    marginBottom: spacing(0.6),
  },
  resultBalance: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
    marginTop: spacing(1),
  },
});
