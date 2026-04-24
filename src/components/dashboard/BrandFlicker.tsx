'use client';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'airpointer.brandFlicker.done';
const LEGACY_KEY = 'airplex.brandFlicker.done';

/** One-time migration: copy legacy sessionStorage flag to the new key. */
function migrateLegacyKey(): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing !== null) return;
    const legacy = window.sessionStorage.getItem(LEGACY_KEY);
    if (legacy === null) return;
    window.sessionStorage.setItem(STORAGE_KEY, legacy);
    window.sessionStorage.removeItem(LEGACY_KEY);
  } catch {
    /* sessionStorage unavailable — non-fatal */
  }
}

export function BrandFlicker({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    migrateLegacyKey();
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {
      /* sessionStorage unavailable */
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setActive(true);
    const id = window.setTimeout(() => {
      setActive(false);
      try {
        window.sessionStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* noop */
      }
    }, 60_000);
    return () => window.clearTimeout(id);
  }, []);
  return <span className={active ? 'brand-flicker' : undefined}>{children}</span>;
}
