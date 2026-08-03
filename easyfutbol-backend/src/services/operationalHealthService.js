const schedulerState = new Map();

export function registerScheduler(name, { maxAgeSeconds }) {
  schedulerState.set(name, {
    name,
    maxAgeSeconds,
    startedAt: new Date(),
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
  });
}

export function markSchedulerSuccess(name) {
  const state = schedulerState.get(name);
  if (!state) return;
  const now = new Date();
  state.lastRunAt = now;
  state.lastSuccessAt = now;
  state.lastError = null;
}

export function markSchedulerFailure(name, error) {
  const state = schedulerState.get(name);
  if (!state) return;
  state.lastRunAt = new Date();
  state.lastError = String(error?.message || error || 'Error desconocido').slice(0, 300);
}

export function getSchedulerHealth(now = new Date()) {
  return [...schedulerState.values()].map((state) => {
    const reference = state.lastRunAt || state.startedAt;
    const ageSeconds = Math.max(0, Math.floor((now.getTime() - reference.getTime()) / 1000));
    const healthy = !state.lastError && ageSeconds <= state.maxAgeSeconds;
    return {
      name: state.name,
      status: healthy ? (state.lastRunAt ? 'up' : 'starting') : 'down',
      lastRunAt: state.lastRunAt?.toISOString() || null,
      lastSuccessAt: state.lastSuccessAt?.toISOString() || null,
      ageSeconds,
      maxAgeSeconds: state.maxAgeSeconds,
      lastError: state.lastError,
    };
  });
}

