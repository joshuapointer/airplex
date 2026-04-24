'use client';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'airplex.brandFlicker.done';

export function BrandFlicker({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
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
