'use client';

import { useState, useEffect } from 'react';
import type { PlexDirectory } from '@/types/plex';
import { useCsrf } from './CsrfContext';
import { Select } from '@/components/ui/Select';

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
    return <span className="font-mono text-sm text-np-muted">Loading libraries…</span>;
  }

  if (error) {
    return <span className="font-mono text-sm text-np-magenta">{error}</span>;
  }

  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      label="Library"
    >
      <option value="">— Select library —</option>
      {libraries.map((lib) => (
        <option key={lib.key} value={lib.key}>
          {lib.title} ({lib.type})
        </option>
      ))}
    </Select>
  );
}
