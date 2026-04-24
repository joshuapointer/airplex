'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'airplex.player.prefs.v1';

export interface PlayerPrefs {
  volume: number;
  muted: boolean;
  rate: number;
  captionsLang: string | null;
}

export const DEFAULT_PREFS: PlayerPrefs = {
  volume: 1,
  muted: false,
  rate: 1,
  captionsLang: null,
};

function clamp01(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1;
}

function clampRate(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0.25 && n <= 4 ? n : 1;
}

export function loadPlayerPrefs(): PlayerPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const obj = JSON.parse(raw) as Partial<PlayerPrefs> | null;
    if (!obj || typeof obj !== 'object') return DEFAULT_PREFS;
    return {
      volume: clamp01(obj.volume),
      muted: !!obj.muted,
      rate: clampRate(obj.rate),
      captionsLang: typeof obj.captionsLang === 'string' ? obj.captionsLang : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePlayerPrefs(prefs: PlayerPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota / disabled storage — non-fatal */
  }
}

export function usePlayerPrefs(): [PlayerPrefs, (patch: Partial<PlayerPrefs>) => void, boolean] {
  const [prefs, setPrefs] = useState<PlayerPrefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    setPrefs(loadPlayerPrefs());
    hydratedRef.current = true;
    setHydrated(true);
  }, []);

  const update = useCallback((patch: Partial<PlayerPrefs>) => {
    setPrefs((prev) => {
      const next: PlayerPrefs = {
        volume: patch.volume !== undefined ? clamp01(patch.volume) : prev.volume,
        muted: patch.muted !== undefined ? !!patch.muted : prev.muted,
        rate: patch.rate !== undefined ? clampRate(patch.rate) : prev.rate,
        captionsLang:
          patch.captionsLang !== undefined
            ? typeof patch.captionsLang === 'string'
              ? patch.captionsLang
              : null
            : prev.captionsLang,
      };
      if (hydratedRef.current) savePlayerPrefs(next);
      return next;
    });
  }, []);

  return [prefs, update, hydrated];
}
