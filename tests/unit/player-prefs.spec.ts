import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_PREFS,
  loadPlayerPrefs,
  savePlayerPrefs,
} from '@/components/player/usePlayerPrefs';

// jsdom isn't active (node env) — mock a minimal localStorage-backed window.
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

function getStorage(): MemStorage {
  return (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage;
}

describe('player prefs persistence', () => {
  beforeEach(() => {
    const storage = new MemStorage();
    vi.stubGlobal('window', { localStorage: storage });
  });

  it('returns defaults when nothing stored', () => {
    expect(loadPlayerPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('round-trips prefs', () => {
    savePlayerPrefs({ volume: 0.4, muted: true, rate: 1.5, captionsLang: 'en' });
    expect(loadPlayerPrefs()).toEqual({
      volume: 0.4,
      muted: true,
      rate: 1.5,
      captionsLang: 'en',
    });
  });

  it('clamps bad volume to default', () => {
    savePlayerPrefs({ volume: 99, muted: false, rate: 1, captionsLang: null });
    expect(loadPlayerPrefs().volume).toBe(1);
  });

  it('clamps out-of-range rate to default', () => {
    savePlayerPrefs({ volume: 1, muted: false, rate: 10, captionsLang: null });
    expect(loadPlayerPrefs().rate).toBe(1);
  });

  it('recovers from corrupt JSON', () => {
    getStorage().setItem('airpointer.player.prefs.v1', '{not-json');
    expect(loadPlayerPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('rejects non-object stored payload', () => {
    getStorage().setItem('airpointer.player.prefs.v1', '"string-not-obj"');
    expect(loadPlayerPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('migrates legacy airplex.* key to airpointer.* on first read', () => {
    const storage = getStorage();
    storage.setItem(
      'airplex.player.prefs.v1',
      JSON.stringify({ volume: 0.2, muted: true, rate: 1.25, captionsLang: 'fr' }),
    );
    // New key absent — migration copies the legacy value.
    expect(loadPlayerPrefs()).toEqual({
      volume: 0.2,
      muted: true,
      rate: 1.25,
      captionsLang: 'fr',
    });
    // Legacy key cleared after migration.
    expect(storage.getItem('airplex.player.prefs.v1')).toBeNull();
    expect(storage.getItem('airpointer.player.prefs.v1')).not.toBeNull();
  });
});
