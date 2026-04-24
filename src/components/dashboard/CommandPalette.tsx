'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  group: 'navigate' | 'act';
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusedShareId: string | null;
  csrf: string;
}

export function CommandPalette({ open, onOpenChange, focusedShareId, csrf }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Capture previously-focused element on mount; restore on unmount.
  useEffect(() => {
    prevFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    return () => {
      prevFocusRef.current?.focus?.();
    };
  }, []);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const patchShare = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      const r = await fetch(`/api/admin/shares/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-airplex-csrf': csrf },
        body: JSON.stringify(body),
      });
      if (r.ok) router.refresh();
    },
    [csrf, router],
  );

  const actions = useMemo<PaletteAction[]>(() => {
    const nav: PaletteAction[] = [
      {
        id: 'nav-home',
        label: 'Go to Home',
        hint: '⏎',
        group: 'navigate',
        onSelect: () => {
          close();
          router.push('/dashboard');
        },
      },
      {
        id: 'nav-shares',
        label: 'Go to Shares',
        hint: '⏎',
        group: 'navigate',
        onSelect: () => {
          close();
          router.push('/dashboard/shares');
        },
      },
      {
        id: 'nav-new',
        label: 'New Share',
        hint: '⏎',
        group: 'navigate',
        onSelect: () => {
          close();
          router.push('/dashboard/shares/new');
        },
      },
    ];

    const act: PaletteAction[] = [
      {
        id: 'act-revoke',
        label: focusedShareId ? 'Revoke focused share' : 'Revoke focused share (none selected)',
        hint: '⏎',
        group: 'act',
        disabled: !focusedShareId,
        onSelect: async () => {
          if (!focusedShareId) return;
          close();
          await patchShare(focusedShareId, { action: 'revoke' });
        },
      },
      {
        id: 'act-reset',
        label: focusedShareId ? 'Reset device on focused share' : 'Reset device (none selected)',
        hint: '⏎',
        group: 'act',
        disabled: !focusedShareId,
        onSelect: async () => {
          if (!focusedShareId) return;
          close();
          await patchShare(focusedShareId, { action: 'reset_device' });
        },
      },
      {
        id: 'act-extend',
        label: focusedShareId ? 'Extend focused share +24h' : 'Extend +24h (none selected)',
        hint: '⏎',
        group: 'act',
        disabled: !focusedShareId,
        onSelect: async () => {
          if (!focusedShareId) return;
          close();
          await patchShare(focusedShareId, { action: 'extend', ttl_hours: 24 });
        },
      },
    ];

    return [...nav, ...act];
  }, [focusedShareId, close, router, patchShare]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  // Clamp selected when filtered list shrinks.
  useEffect(() => {
    if (selected >= filtered.length) setSelected(Math.max(0, filtered.length - 1));
  }, [filtered, selected]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filtered.length === 0) return;
        setSelected((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filtered.length === 0) return;
        setSelected((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const action = filtered[selected];
        if (action && !action.disabled) {
          void action.onSelect();
        }
        return;
      }
    },
    [filtered, selected, close],
  );

  if (!open) return null;

  // Group filtered actions in order: navigate group first, then act.
  const navItems = filtered.filter((a) => a.group === 'navigate');
  const actItems = filtered.filter((a) => a.group === 'act');

  // Flat index for aria-selected mapping (filtered order is nav-first, so renderIndex matches).
  let flatIdx = 0;

  return (
    <div className="cmdk-backdrop" tabIndex={-1} onClick={close} onKeyDown={handleKeyDown}>
      <div
        className="cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="cmdk-input"
          type="text"
          placeholder="Type a command..."
          autoFocus
          aria-label="Command"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
        />
        <ul className="cmdk-list" role="listbox" tabIndex={-1}>
          {navItems.length > 0 && <li className="cmdk-group-label">Navigate</li>}
          {navItems.map((a) => {
            const idx = flatIdx++;
            return (
              <li
                key={a.id}
                className="cmdk-item"
                role="option"
                aria-selected={idx === selected}
                aria-disabled={a.disabled || undefined}
                data-disabled={a.disabled ? 'true' : undefined}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => {
                  if (!a.disabled) void a.onSelect();
                }}
              >
                <span>{a.label}</span>
                {a.hint && <span className="cmdk-hint">{a.hint}</span>}
              </li>
            );
          })}
          {actItems.length > 0 && <li className="cmdk-group-label">Act on focused share</li>}
          {actItems.map((a) => {
            const idx = flatIdx++;
            return (
              <li
                key={a.id}
                className="cmdk-item"
                role="option"
                aria-selected={idx === selected}
                aria-disabled={a.disabled || undefined}
                data-disabled={a.disabled ? 'true' : undefined}
                onMouseEnter={() => setSelected(idx)}
                onClick={() => {
                  if (!a.disabled) void a.onSelect();
                }}
              >
                <span>{a.label}</span>
                {a.hint && <span className="cmdk-hint">{a.hint}</span>}
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li
              className="cmdk-item"
              role="option"
              aria-selected={false}
              aria-disabled="true"
              data-disabled="true"
            >
              <span>No matches</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
