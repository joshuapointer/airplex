'use client';

import { useState } from 'react';
import type { ShareRow } from '@/types/share';

export interface DrawerActionsProps {
  share: ShareRow;
  csrf: string;
  onRefresh: () => void;
}

function relativeFromNow(unixSeconds: number): string {
  const diffMs = Date.now() - unixSeconds * 1000;
  const sec = Math.round(diffMs / 1000);
  const abs = Math.abs(sec);
  const future = sec < 0;
  const fmt = (n: number, unit: Intl.RelativeTimeFormatUnit) => {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    return rtf.format(future ? n : -n, unit);
  };
  if (abs < 60) return fmt(abs, 'second');
  if (abs < 3600) return fmt(Math.round(abs / 60), 'minute');
  if (abs < 86400) return fmt(Math.round(abs / 3600), 'hour');
  if (abs < 2592000) return fmt(Math.round(abs / 86400), 'day');
  if (abs < 31536000) return fmt(Math.round(abs / 2592000), 'month');
  return fmt(Math.round(abs / 31536000), 'year');
}

export function RowDrawerActions({ share, csrf, onRefresh }: DrawerActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const patch = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    try {
      const r = await fetch(`/api/admin/shares/${share.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-airplex-csrf': csrf },
        body: JSON.stringify(body),
      });
      if (r.ok) onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const createdIso = new Date(share.created_at * 1000).toISOString();
  const claimed = share.device_fingerprint_hash !== null;

  return (
    <div role="region" aria-label="Share actions">
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex gap-4 flex-wrap items-center text-xs">
          <span className="text-np-muted" title={createdIso}>
            Created {relativeFromNow(share.created_at)}
          </span>
          <span className="text-np-muted">{claimed ? 'Locked to device' : 'Unclaimed'}</span>
        </div>
        <p className="text-xs text-np-muted m-0">Link was shown at creation.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="btn-ghost text-xs"
          style={{ color: 'var(--np-magenta)', borderColor: 'rgba(255, 40, 140, 0.4)' }}
          disabled={busy !== null}
          onClick={(e) => {
            e.stopPropagation();
            if (!window.confirm('Revoke share?')) return;
            void patch('revoke', { action: 'revoke' });
          }}
        >
          {busy === 'revoke' ? 'Revoking…' : 'Revoke'}
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          style={{ color: 'var(--np-cyan)', borderColor: 'rgba(0, 240, 255, 0.4)' }}
          disabled={busy !== null}
          onClick={(e) => {
            e.stopPropagation();
            void patch('reset', { action: 'reset_device' });
          }}
        >
          {busy === 'reset' ? 'Resetting…' : 'Reset Device'}
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          style={{ color: 'var(--np-green)', borderColor: 'rgba(0, 255, 102, 0.4)' }}
          disabled={busy !== null}
          onClick={(e) => {
            e.stopPropagation();
            void patch('extend', { action: 'extend', ttl_hours: 24 });
          }}
        >
          {busy === 'extend' ? 'Extending…' : 'Extend +24h'}
        </button>
      </div>
    </div>
  );
}
