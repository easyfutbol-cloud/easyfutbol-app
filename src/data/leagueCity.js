// Ciudad favorita (la tuya, se recuerda) y ciudad que se está viendo (puedes ojear otras).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { DEFAULT_CITY_ID, getCity } from './leaguePreviewData';

const STORAGE_KEY = 'league_favorite_city_v1';
const NOTIFY_KEY = 'league_city_alerts_v1';

let state = { favoriteId: DEFAULT_CITY_ID, viewingId: DEFAULT_CITY_ID, alerts: [] };
let loading = null;
const listeners = new Set();

function update(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener(state));
}

function load() {
  if (!loading) {
    loading = Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(NOTIFY_KEY)])
      .then(([favorite, alerts]) => {
        const patch = {};
        if (favorite && getCity(favorite).id === favorite) {
          patch.favoriteId = favorite;
          patch.viewingId = favorite;
        }
        if (alerts) patch.alerts = JSON.parse(alerts);
        update(patch);
      })
      .catch(() => {});
  }
  return loading;
}

export function useLeagueCity() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    load();
    setSnapshot(state);
    return () => listeners.delete(setSnapshot);
  }, []);
  return {
    ...snapshot,
    favorite: getCity(snapshot.favoriteId),
    viewing: getCity(snapshot.viewingId),
    isBrowsing: snapshot.viewingId !== snapshot.favoriteId,
  };
}

// La liga (o ciudad próximamente) que muestran ahora mismo las pantallas.
export function useLeague() {
  return useLeagueCity().viewing;
}

export const viewCity = (id) => update({ viewingId: id });

export function setFavoriteCity(id) {
  update({ favoriteId: id, viewingId: id });
  AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
}

export function toggleCityAlert(id) {
  const alerts = state.alerts.includes(id) ? state.alerts.filter((item) => item !== id) : [...state.alerts, id];
  update({ alerts });
  AsyncStorage.setItem(NOTIFY_KEY, JSON.stringify(alerts)).catch(() => {});
}
