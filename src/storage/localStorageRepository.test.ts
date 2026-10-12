import { beforeEach, describe, expect, it } from 'bun:test';
import { createLocalStorageRepository, STORAGE_KEYS, type KeyValueStore } from './localStorageRepository';
import { EMPTY_SEED } from './seeds';
import { DEFAULT_SEED } from './seeds';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('localStorageRepository', () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => { store = memoryStore(); });

  it('falls back to the seed when nothing is stored', () => {
    const repo = createLocalStorageRepository(store, EMPTY_SEED);
    expect(repo.getHistory()).toEqual([]);
    expect(repo.getRoutines()).toEqual([]);
    expect(repo.getActiveWorkout()).toBeNull();
    expect(repo.getSettings().weightUnit).toBe('lbs');
  });

  it('does not write to storage just by reading defaults', () => {
    createLocalStorageRepository(store, DEFAULT_SEED).getHistory();
    expect(store.data.size).toBe(0);
  });

  it('round-trips data and merges partial stored settings over defaults', () => {
    const repo = createLocalStorageRepository(store, EMPTY_SEED);
    store.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({ weightUnit: 'kg' }));
    const s = repo.getSettings();
    expect(s.weightUnit).toBe('kg');
    expect(s.soundEnabled).toBe(true);
  });

  it('uses the same keys as the original app', () => {
    const repo = createLocalStorageRepository(store, EMPTY_SEED);
    repo.saveHistory([]);
    expect(store.data.has('irontrack_history_v2')).toBe(true);
  });

  it('survives corrupt JSON', () => {
    store.setItem(STORAGE_KEYS.HISTORY, '{not json');
    expect(createLocalStorageRepository(store, EMPTY_SEED).getHistory()).toEqual([]);
  });

  it('clears the active workout when saved as null', () => {
    const repo = createLocalStorageRepository(store, EMPTY_SEED);
    repo.saveActiveWorkout({ id: 'w', name: 'w', startTime: 1, exercises: [] });
    expect(repo.getActiveWorkout()?.id).toBe('w');
    repo.saveActiveWorkout(null);
    expect(repo.getActiveWorkout()).toBeNull();
  });

  it('exports and re-imports a backup', () => {
    const a = createLocalStorageRepository(store, DEFAULT_SEED);
    const json = a.exportJSON();
    expect(Object.keys(JSON.parse(json))).toEqual(
      ['settings', 'exercises', 'routines', 'history', 'prs', 'spreadsheetCSV', 'progression', 'exportedAt']
    );
    const b = createLocalStorageRepository(memoryStore(), EMPTY_SEED);
    expect(b.importJSON(json)).toBe(true);
    expect(b.getHistory().length).toBe(DEFAULT_SEED.history.length);
  });

  it('rejects invalid backups', () => {
    expect(createLocalStorageRepository(store, EMPTY_SEED).importJSON('nope')).toBe(false);
  });

  it('reset removes everything', () => {
    const repo = createLocalStorageRepository(store, EMPTY_SEED);
    repo.saveHistory([]); repo.saveSettings(repo.getSettings());
    repo.reset();
    expect(store.data.size).toBe(0);
  });
});
