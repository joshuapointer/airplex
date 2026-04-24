'use client';
import { useEffect, useState } from 'react';

export interface UseCountUpOpts {
  to: number;
  durationMs?: number;
  disabled?: boolean;
}

export function useCountUp({ to, durationMs = 700, disabled }: UseCountUpOpts): number {
  const [value, setValue] = useState<number>(to);

  useEffect(() => {
    if (disabled) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    setValue(from);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.floor(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(to);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, durationMs, disabled]);

  return value;
}
