'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShareRow } from '@/types/share';
import type { ShareStatus } from '@/types/share';
import { useCsrf } from './CsrfContext';

interface ShareCardProps {
  share: Omit<ShareRow, 'token_hash'>;
  status: ShareStatus;
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ShareCard({ share, status }: ShareCardProps) {
  const csrf = useCsrf();
  const router = useRouter();

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extendHours, setExtendHours] = useState('48');

  async function patch(body: Record<string, unknown>) {
    const action = body.action as string;
    setLoading(action);
    setError(null);
    try {
      const r = await fetch(`/api/admin/shares/${share.id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-airplex-csrf': csrf,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const json = (await r.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${r.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(null);
    }
  }

  const statusText = status.revoked
    ? 'Revoked'
    : status.expired
      ? 'Expired'
      : status.exhausted
        ? 'Exhausted'
        : 'Active';

  const statusColor = status.revoked
    ? 'var(--np-magenta)'
    : status.expired || status.exhausted
      ? 'var(--np-muted)'
      : 'var(--np-green)';

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--np-muted)',
        borderRadius: 'var(--np-radius-soft)',
        padding: '1.5rem',
        backdropFilter: 'blur(8px)',
        maxWidth: '640px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h2
          style={{
            fontFamily: 'var(--np-font-display)',
            color: 'var(--np-fg)',
            fontSize: '1.2rem',
            fontWeight: 700,
            marginBottom: '0.25rem',
          }}
        >
          {share.title}
        </h2>
        <span
          style={{
            color: statusColor,
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {statusText}
        </span>
      </div>

      {/* Fields */}
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '0.35rem 1.25rem',
          fontSize: '0.85rem',
          marginBottom: '1.5rem',
        }}
      >
        <Dt>Recipient</Dt>
        <Dd>{share.recipient_label}</Dd>

        {share.recipient_note && (
          <>
            <Dt>Note</Dt>
            <Dd>{share.recipient_note}</Dd>
          </>
        )}

        <Dt>Media type</Dt>
        <Dd>{share.plex_media_type}</Dd>

        <Dt>Created</Dt>
        <Dd>{formatDate(share.created_at)}</Dd>

        <Dt>Expires</Dt>
        <Dd>{formatDate(share.expires_at)}</Dd>

        <Dt>Plays</Dt>
        <Dd>
          {share.play_count}
          {share.max_plays !== null ? ` / ${share.max_plays}` : ' (unlimited)'}
        </Dd>

        <Dt>Device locked</Dt>
        <Dd>{status.claimed ? 'Yes' : 'No'}</Dd>

        {share.revoked_at !== null && (
          <>
            <Dt>Revoked at</Dt>
            <Dd>{formatDate(share.revoked_at)}</Dd>
          </>
        )}
      </dl>

      {/* Actions */}
      {error && (
        <p style={{ color: 'var(--np-magenta)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {!status.revoked && (
          <button
            onClick={() => patch({ action: 'revoke' })}
            disabled={loading !== null}
            style={actionBtnStyle('var(--np-magenta)', loading !== null)}
          >
            {loading === 'revoke' ? 'Revoking…' : 'Revoke'}
          </button>
        )}

        {status.claimed && !status.revoked && (
          <button
            onClick={() => patch({ action: 'reset_device' })}
            disabled={loading !== null}
            style={actionBtnStyle('var(--np-cyan)', loading !== null)}
          >
            {loading === 'reset_device' ? 'Resetting…' : 'Reset Device'}
          </button>
        )}

        {!status.revoked && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="number"
              min={1}
              max={168}
              value={extendHours}
              onChange={(e) => setExtendHours(e.target.value)}
              style={{
                width: '70px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--np-muted)',
                borderRadius: 'var(--np-radius-sharp)',
                color: 'var(--np-fg)',
                padding: '0.3rem 0.5rem',
                fontSize: '0.85rem',
              }}
            />
            <span style={{ color: 'var(--np-muted)', fontSize: '0.8rem' }}>hrs</span>
            <button
              onClick={() => patch({ action: 'extend', ttl_hours: Number(extendHours) })}
              disabled={loading !== null || !extendHours}
              style={actionBtnStyle('var(--np-green)', loading !== null)}
            >
              {loading === 'extend' ? 'Extending…' : 'Extend'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt style={{ color: 'var(--np-muted)', fontWeight: 500 }}>{children}</dt>;
}

function Dd({ children }: { children: React.ReactNode }) {
  return <dd style={{ color: 'var(--np-fg)', margin: 0 }}>{children}</dd>;
}

function actionBtnStyle(accentColor: string, disabled: boolean): React.CSSProperties {
  return {
    padding: '0.4rem 0.9rem',
    background: 'transparent',
    border: `1px solid ${disabled ? 'var(--np-muted)' : accentColor}`,
    borderRadius: 'var(--np-radius-sharp)',
    color: disabled ? 'var(--np-muted)' : accentColor,
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
