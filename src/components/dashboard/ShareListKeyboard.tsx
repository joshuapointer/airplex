'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRowCursor } from './useRowCursor';
import { useCsrf } from './CsrfContext';

export interface ShareListKeyboardProps {
  onToggleDrawer?: (id: string) => void;
}

export function ShareListKeyboard({ onToggleDrawer }: ShareListKeyboardProps) {
  const { focusedId, index, setIndex, ids } = useRowCursor();
  const router = useRouter();
  const csrf = useCsrf();

  useEffect(() => {
    const isTextInputFocused = () => {
      const t = document.activeElement;
      if (!t) return false;
      const tag = t.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (t as HTMLElement).isContentEditable
      );
    };

    const handler = async (e: KeyboardEvent) => {
      if (isTextInputFocused()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'j') {
        e.preventDefault();
        setIndex(index + 1);
        return;
      }
      if (e.key === 'k') {
        e.preventDefault();
        setIndex(index - 1);
        return;
      }
      if (e.key === 'n') {
        e.preventDefault();
        router.push('/dashboard/shares/new');
        return;
      }

      if (!focusedId) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        if (onToggleDrawer) onToggleDrawer(focusedId);
        else router.push(`/dashboard/shares/${focusedId}`);
        return;
      }
      if (e.key === 'r') {
        e.preventDefault();
        if (!window.confirm('Revoke share?')) return;
        const r = await fetch(`/api/admin/shares/${focusedId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'x-airplex-csrf': csrf },
          body: JSON.stringify({ action: 'revoke' }),
        });
        if (r.ok) router.refresh();
        return;
      }
      if (e.key === 'e') {
        e.preventDefault();
        const raw = window.prompt('Extend by how many hours?', '24');
        if (!raw) return;
        const ttl_hours = Number(raw);
        if (!Number.isFinite(ttl_hours) || ttl_hours < 1) return;
        const r = await fetch(`/api/admin/shares/${focusedId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', 'x-airplex-csrf': csrf },
          body: JSON.stringify({ action: 'extend', ttl_hours }),
        });
        if (r.ok) router.refresh();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedId, index, ids, setIndex, router, csrf, onToggleDrawer]);

  return null;
}
