import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { WORLDCUP_CONTINENTS } from '../../data/worldcupTeams';
import { api } from '../../api/client';

const BRAND_ORANGE = '#ff5a00';
const BG = '#050505';
const CARD = '#141414';
const BORDER = '#262626';
const MUTED = '#9ca3af';

export default function WorldCupSelectTeamScreen({ navigation }) {
  const [selectedContinentId, setSelectedContinentId] = useState(
    WORLDCUP_CONTINENTS[0]?.id || null
  );
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedContinent = useMemo(
    () => WORLDCUP_CONTINENTS.find((continent) => continent.id === selectedContinentId),
    [selectedContinentId]
  );

  const handleOpenConfirm = (team) => {
    setSelectedTeam(team);
    setConfirmVisible(true);
  };

  const handleSelectTeam = async () => {
    if (!selectedTeam || loading) return;

    try {
      setLoading(true);

      const token = await AsyncStorage.getItem('token');

      if (!token) {
        setConfirmVisible(false);
        Alert.alert('Inicia sesión', 'Debes iniciar sesión para elegir tu selección.');
        return;
      }

      await api.post(
        '/worldcup/select-team',
        { team: selectedTeam.id },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setConfirmVisible(false);

      Alert.alert(
        'Selección elegida',
        `Ahora representas a ${selectedTeam.name} ${selectedTeam.flag}`,
        [
          {
            text: 'Ver Mundial',
            onPress: () => navigation.navigate('WorldCup'),
          },
        ]
      );
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'No se pudo elegir la selección';

      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>MUNDIAL EASYFUTBOL</Text>
          <Text style={styles.title}>Elige tu selección</Text>
          <Text style={styles.subtitle}>
            Tus goles, asistencias, MVP y victorias sumarán para el país que representes.
          </Text>
        </View>

        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Decisión importante</Text>
          <Text style={styles.warningText}>
            Solo puedes elegir una selección y no podrás cambiarla durante la competición.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>1. Elige continente</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.continentList}
        >
          {WORLDCUP_CONTINENTS.map((continent) => {
            const active = continent.id === selectedContinentId;

            return (
              <TouchableOpacity
                key={continent.id}
                style={[styles.continentChip, active && styles.continentChipActive]}
                onPress={() => setSelectedContinentId(continent.id)}
                activeOpacity={0.85}
              >
                <Text style={[styles.continentText, active && styles.continentTextActive]}>
                  {continent.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionTitle}>2. Elige país</Text>
        <View style={styles.teamsGrid}>
          {(selectedContinent?.teams || []).map((team) => (
            <TouchableOpacity
              key={team.id}
              style={styles.teamCard}
              onPress={() => handleOpenConfirm(team)}
              activeOpacity={0.88}
            >
              <Text style={styles.flag}>{team.flag}</Text>
              <Text style={styles.teamName}>{team.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal transparent visible={confirmVisible} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalFlag}>{selectedTeam?.flag}</Text>
            <Text style={styles.modalTitle}>¿Representar a {selectedTeam?.name}?</Text>
            <Text style={styles.modalText}>
              Esta elección será definitiva durante el Mundial EasyFutbol.
            </Text>

            <TouchableOpacity
              style={[styles.confirmButton, loading && styles.disabledButton]}
              onPress={handleSelectTeam}
              activeOpacity={0.9}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirmar selección</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setConfirmVisible(false)}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  kicker: {
    color: BRAND_ORANGE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 10,
  },
  subtitle: {
    color: '#d1d5db',
    fontSize: 15,
    lineHeight: 22,
  },
  warningBox: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 90, 0, 0.45)',
    backgroundColor: 'rgba(255, 90, 0, 0.1)',
    marginBottom: 22,
  },
  warningTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 5,
  },
  warningText: {
    color: '#f3f4f6',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  continentList: {
    gap: 10,
    paddingBottom: 20,
  },
  continentChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  continentChipActive: {
    backgroundColor: BRAND_ORANGE,
    borderColor: BRAND_ORANGE,
  },
  continentText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  continentTextActive: {
    color: '#fff',
  },
  teamsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  teamCard: {
    width: '48%',
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 118,
    justifyContent: 'center',
  },
  flag: {
    fontSize: 36,
    marginBottom: 10,
  },
  teamName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 26,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  modalFlag: {
    fontSize: 56,
    marginBottom: 12,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalText: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 22,
  },
  confirmButton: {
    width: '100%',
    backgroundColor: BRAND_ORANGE,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  disabledButton: {
    opacity: 0.65,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  cancelButton: {
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: MUTED,
    fontSize: 15,
    fontWeight: '800',
  },
});