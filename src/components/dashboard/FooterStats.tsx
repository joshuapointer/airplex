'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCountUp } from '@/lib/useCountUp';

export interface FooterStatsProps {
  active: number;
  expired: number;
  revoked: number;
}

export function FooterStats({ active, expired, revoked }: FooterStatsProps) {
  // Only animate on first mount (not on router.refresh re-renders).
  const firstMountRef = useRef(true);
  const shouldAnimate = firstMountRef.current;
  useEffect(() => {
    firstMountRef.current = false;
  }, []);

  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const a = useCountUp({ to: active, disabled: !shouldAnimate || reduced });
  const e = useCountUp({ to: expired, disabled: !shouldAnimate || reduced });
  const r = useCountUp({ to: revoked, disabled: !shouldAnimate || reduced });

  return (
    <p className="text-xs text-np-muted font-mono mt-6 animate-enter-delay-2">
      <span className="count-up-value">{a}</span> active ·{' '}
      <span className="count-up-value">{e}</span> expired ·{' '}
      <span className="count-up-value">{r}</span> revoked ·{' '}
      <Link href="/dashboard/shares" className="text-np-cyan no-underline hover:underline">
        view all →
      </Link>
    </p>
  );
}
