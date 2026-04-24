import type { FormEvent } from 'react';

export function armCurtainOnSubmit(
  e: FormEvent<HTMLFormElement>,
  opts?: { durationMs?: number },
): void {
  if (typeof window === 'undefined') return;

  // Reduced-motion: bypass entirely.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const form = e.currentTarget;
  if (form.dataset.curtainArmed === '1') return; // idempotent
  form.dataset.curtainArmed = '1';

  e.preventDefault();
  document.documentElement.dataset.curtain = 'up';

  const duration = opts?.durationMs ?? 320;
  window.setTimeout(() => {
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }, duration);
}
