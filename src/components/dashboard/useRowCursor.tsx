'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface RowCursorState {
  focusedId: string | null;
  setFocused: (id: string | null) => void;
  index: number;
  setIndex: (i: number) => void;
  ids: readonly string[];
}

const RowCursorContext = createContext<RowCursorState | null>(null);

export function ShareRowCursorProvider({
  ids,
  children,
}: {
  ids: readonly string[];
  children: ReactNode;
}) {
  const [index, setIndexState] = useState<number>(-1);

  const setIndex = useCallback(
    (i: number) => {
      const clamped = ids.length === 0 ? -1 : Math.max(-1, Math.min(ids.length - 1, i));
      setIndexState(clamped);
    },
    [ids.length],
  );

  const setFocused = useCallback(
    (id: string | null) => {
      if (id === null) {
        setIndexState(-1);
        return;
      }
      const i = ids.indexOf(id);
      if (i >= 0) setIndexState(i);
    },
    [ids],
  );

  const focusedId = index >= 0 && index < ids.length ? ids[index] : null;

  const value = useMemo<RowCursorState>(
    () => ({ focusedId, setFocused, index, setIndex, ids }),
    [focusedId, setFocused, index, setIndex, ids],
  );

  return <RowCursorContext.Provider value={value}>{children}</RowCursorContext.Provider>;
}

export function useRowCursor(): RowCursorState {
  const ctx = useContext(RowCursorContext);
  if (!ctx) {
    // Safe fallback for consumers mounted outside a provider (e.g. CommandPaletteMount before ShareList mounts):
    return { focusedId: null, setFocused: () => {}, index: -1, setIndex: () => {}, ids: [] };
  }
  return ctx;
}
