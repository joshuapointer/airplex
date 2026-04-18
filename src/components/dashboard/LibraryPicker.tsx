'use client';

import { useState, useEffect } from 'react';
import type { PlexDirectory } from '@/types/plex';
import { useCsrf } from './CsrfContext';

interface LibraryPickerProps {
  value: string;
  onChange: (sectionId: string) => void;
  disabled?: boolean;
}

export function LibraryPicker({ value, onChange, disabled }: LibraryPickerProps) {
  const csrf = useCsrf();
  const [libraries, setLibraries] = useState<PlexDirectory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/admin/libraries', {
      headers: { 'x-airplex-csrf': csrf },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PlexDirectory[]>;
      })
      .then((data) => {
        if (!cancelled) {
          setLibraries(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load libraries');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [csrf]);

  if (loading) {
    return (
      <span style={{ color: 'var(--np-muted)', fontSize: '0.85rem' }}>Loading libraries…</span>
    );
  }

  if (error) {
    return <span style={{ color: 'var(--np-magenta)', fontSize: '0.85rem' }}>{error}</span>;
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--np-muted)',
        borderRadius: 'var(--np-radius-sharp)',
        color: 'var(--np-fg)',
        padding: '0.45rem 0.75rem',
        width: '100%',
        fontSize: '0.9rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <option value="">— Select library —</option>
      {libraries.map((lib) => (
        <option key={lib.key} value={lib.key}>
          {lib.title} ({lib.type})
        </option>
      ))}
    </select>
  );
}
