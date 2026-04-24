'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ShareRow } from '@/types/share';
import type { ShareStatus } from '@/types/share';
import { useCsrf } from './CsrfContext';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Badge, type BadgeStatus } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { AmbientBackdrop } from '@/components/ui/transmission';

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

  const badgeStatus: BadgeStatus = status.revoked
    ? 'revoked'
    : status.expired || status.exhausted
      ? 'expired'
      : 'active';

  const statusLabel = status.revoked
    ? 'Revoked'
    : status.expired
      ? 'Expired'
      : status.exhausted
        ? 'Exhausted'
        : 'Active';

  return (
    <div className="relative">
      <AmbientBackdrop
        posterUrl={`/api/admin/shares/${share.id}/poster`}
        kenBurns
        loading="lazy"
        opacity={0.15}
      />
      <div className="relative" style={{ zIndex: 3 }}>
        <GlassPanel className="p-6 max-w-[640px]">
          {/* Header */}
          <div className="mb-5">
            <h2 className="font-display text-xl text-np-fg mb-1">{share.title}</h2>
            <Badge status={badgeStatus}>{statusLabel}</Badge>
          </div>

          {/* Fields */}
          <dl className="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-2 text-sm mb-6">
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
          {error && <p className="text-np-magenta font-mono text-sm mb-3">{error}</p>}

          <div className="flex flex-wrap gap-3 items-end">
            {!status.revoked && (
              <button
                onClick={() => patch({ action: 'revoke' })}
                disabled={loading !== null}
                className="btn-ghost text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  color: 'var(--np-magenta)',
                  borderColor: 'var(--np-magenta)',
                }}
              >
                {loading === 'revoke' ? 'Revoking…' : 'Revoke'}
              </button>
            )}

            {status.claimed && !status.revoked && (
              <button
                onClick={() => patch({ action: 'reset_device' })}
                disabled={loading !== null}
                className="btn-ghost text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  color: 'var(--np-cyan)',
                  borderColor: 'var(--np-cyan)',
                }}
              >
                {loading === 'reset_device' ? 'Resetting…' : 'Reset Device'}
              </button>
            )}

            {!status.revoked && (
              <div className="flex gap-2 items-end">
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={extendHours}
                  onChange={(e) => setExtendHours(e.target.value)}
                  className="w-20"
                  aria-label="Extend hours"
                />
                <span className="text-np-muted text-xs font-mono pb-3">hrs</span>
                <button
                  onClick={() => patch({ action: 'extend', ttl_hours: Number(extendHours) })}
                  disabled={loading !== null || !extendHours}
                  className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading === 'extend' ? 'Extending…' : 'Extend'}
                </button>
              </div>
            )}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-np-muted font-mono uppercase text-xs tracking-wider self-center">
      {children}
    </dt>
  );
}

function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="text-np-fg m-0 self-center">{children}</dd>;
}
