// Perfiles de liga personalizables: los capitanes editan el de su equipo y cada
// jugador el suyo. Ningún cambio se publica hasta que un administrador lo aprueba.
// En la demo se guarda en el dispositivo; cuando la liga tenga backend, estas
// funciones pasarán a llamar a la API.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'league_profiles_v2';

// El usuario de la demo es el capitán de este equipo y este es su jugador.
export const DEMO_CAPTAIN_TEAM_ID = 'nar';
export const DEMO_PLAYER_ID = 'nar-5';

export const TEAM_FIELDS = [
  { key: 'crestUri', label: 'Escudo', type: 'image' },
  { key: 'bannerUri', label: 'Banner', type: 'image' },
  { key: 'name', label: 'Nombre' },
  { key: 'short', label: 'Abreviatura' },
  { key: 'color', label: 'Color del equipo', type: 'color' },
  { key: 'motto', label: 'Lema' },
  { key: 'bio', label: 'Presentación' },
  { key: 'founded', label: 'Año de fundación' },
  { key: 'instagram', label: 'Instagram' },
];

export const PLAYER_FIELDS = [
  { key: 'photoUri', label: 'Foto', type: 'image' },
  { key: 'nickname', label: 'Apodo' },
  { key: 'number', label: 'Dorsal' },
  { key: 'position', label: 'Posición' },
  { key: 'foot', label: 'Pie dominante' },
  { key: 'bio', label: 'Presentación' },
  { key: 'instagram', label: 'Instagram' },
];

export const PROFILE_FIELDS = TEAM_FIELDS;
export const fieldsFor = (kind) => (kind === 'player' ? PLAYER_FIELDS : TEAM_FIELDS);
export const fieldLabel = (key, kind = 'team') => fieldsFor(kind).find((field) => field.key === key)?.label || key;

const SEED_REQUESTS = [
  {
    id: 'seed-tit',
    kind: 'team',
    targetId: 'tit',
    teamId: 'tit',
    status: 'pending',
    submittedBy: 'Lucas Delgado',
    submittedAt: '2026-10-05T18:30:00.000Z',
    changes: { color: '#F59E0B', motto: 'Nadie nos para en la segunda parte', founded: '2019', instagram: 'titanesfc.vll' },
  },
  {
    id: 'seed-carmona',
    kind: 'player',
    targetId: 'tit-9',
    teamId: 'tit',
    status: 'pending',
    submittedBy: 'Manu Carmona',
    submittedAt: '2026-10-06T09:10:00.000Z',
    changes: { nickname: 'Carmo', number: '7', foot: 'Zurdo', bio: 'Delantero de área. Si hay un balón suelto, es mío.' },
  },
];

const subject = (kind, id) => `${kind}:${id}`;

let state = { profiles: {}, requests: SEED_REQUESTS };
let ready = false;
let loading = null;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener(state));
}

function commit(next) {
  state = next;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

export function loadTeamProfiles() {
  if (ready) return Promise.resolve(state);
  if (!loading) {
    loading = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const saved = JSON.parse(raw);
          state = { profiles: saved.profiles || {}, requests: saved.requests || [] };
        }
      })
      .catch(() => {})
      .finally(() => {
        ready = true;
        emit();
      });
  }
  return loading;
}

// Suscribe el componente a los cambios para que escudos, fotos, colores y nombres se refresquen al aprobar.
export function useTeamProfiles() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    loadTeamProfiles();
    setSnapshot(state);
    return () => listeners.delete(setSnapshot);
  }, []);
  return { ...snapshot, ready };
}

export const approvedProfile = (teamId) => state.profiles[subject('team', teamId)] || {};
export const approvedPlayerProfile = (playerId) => state.profiles[subject('player', playerId)] || {};

const sortRecent = (list) => list.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

export const requestsFor = (kind, targetId) =>
  sortRecent(state.requests.filter((request) => request.kind === kind && request.targetId === targetId));

export const pendingFor = (kind, targetId) =>
  state.requests.find((request) => request.kind === kind && request.targetId === targetId && request.status === 'pending');

export const teamRequests = (teamId) => requestsFor('team', teamId);
export const pendingRequest = (teamId) => pendingFor('team', teamId);

export const pendingCount = () => state.requests.filter((request) => request.status === 'pending').length;

// Solo puede haber una solicitud pendiente por perfil: una nueva sustituye a la anterior.
export function submitProfileRequest(kind, targetId, teamId, changes, submittedBy) {
  const others = state.requests.filter((request) => !(request.kind === kind && request.targetId === targetId && request.status === 'pending'));
  const request = {
    id: `${kind}-${targetId}-${Date.now()}`,
    kind,
    targetId,
    teamId,
    status: 'pending',
    submittedBy,
    submittedAt: new Date().toISOString(),
    changes,
  };
  commit({ ...state, requests: [request, ...others] });
  return request;
}

export const submitTeamRequest = (teamId, changes, submittedBy) => submitProfileRequest('team', teamId, teamId, changes, submittedBy);

export function withdrawRequest(requestId) {
  commit({ ...state, requests: state.requests.filter((request) => request.id !== requestId) });
}

// El administrador puede aprobar todos los cambios, solo algunos o ninguno.
export function reviewRequest(requestId, approvedKeys, note) {
  const request = state.requests.find((item) => item.id === requestId);
  if (!request) return;
  const key = subject(request.kind, request.targetId);
  const accepted = Object.fromEntries(Object.entries(request.changes).filter(([field]) => approvedKeys.includes(field)));
  const total = Object.keys(request.changes).length;
  const status = approvedKeys.length === 0 ? 'rejected' : approvedKeys.length === total ? 'approved' : 'partial';
  commit({
    profiles: { ...state.profiles, [key]: { ...state.profiles[key], ...accepted } },
    requests: state.requests.map((item) =>
      item.id === requestId ? { ...item, status, approvedKeys, note: note?.trim() || null, reviewedAt: new Date().toISOString() } : item
    ),
  });
}

export function resetTeamProfilesDemo() {
  commit({ profiles: {}, requests: SEED_REQUESTS });
}

export const STATUS_LABEL = {
  pending: 'Pendiente de revisión',
  approved: 'Aprobada',
  partial: 'Aprobada parcialmente',
  rejected: 'Rechazada',
};

export function timeAgo(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
