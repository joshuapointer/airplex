'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlexConnection } from '@/plex/account';

export interface SetupServer {
  name: string;
  owned: boolean;
  connections: PlexConnection[];
}

interface ServerPickerClientProps {
  csrf: string;
  servers: SetupServer[];
}

function pickBestConnection(connections: PlexConnection[]): PlexConnection | null {
  if (connections.length === 0) return null;
  const byRank = [...connections].sort((a, b) => rank(a) - rank(b));
  return byRank[0] ?? null;
}

function rank(c: PlexConnection): number {
  // Lower is better. Prefer https + !relay + !local (public direct),
  // then https + !relay, then any https, then anything.
  if (c.https && !c.relay && !c.local) return 0;
  if (c.https && !c.relay) return 1;
  if (c.https) return 2;
  return 3;
}

export function ServerPickerClient({ csrf, servers }: ServerPickerClientProps) {
  const router = useRouter();
  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function select(server: SetupServer) {
    const conn = pickBestConnection(server.connections);
    if (!conn) {
      setError(`${server.name} has no usable connections`);
      return;
    }
    setSelecting(server.name);
    setError(null);
    try {
      const r = await fetch('/api/setup/plex/select', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-airplex-csrf': csrf,
        },
        body: JSON.stringify({ serverUrl: conn.uri, serverName: server.name }),
      });
      if (!r.ok) {
        const json = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${r.status}`);
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select server');
      setSelecting(null);
    }
  }

  if (servers.length === 0) {
    return (
      <p style={{ color: 'var(--np-muted)', fontSize: '0.9rem' }}>
        No Plex Media Servers found on this account.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {error && (
        <p
          style={{
            color: 'var(--np-magenta)',
            fontSize: '0.85rem',
            marginBottom: '0.25rem',
          }}
        >
          {error}
        </p>
      )}
      {servers.map((server) => {
        const best = pickBestConnection(server.connections);
        const isSelecting = selecting === server.name;
        return (
          <button
            key={`${server.name}-${best?.uri ?? 'none'}`}
            type="button"
            onClick={() => select(server)}
            disabled={!best || selecting !== null}
            style={{
              textAlign: 'left',
              padding: '1rem',
              background: 'rgba(15,15,15,0.75)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 'var(--np-radius-soft)',
              color: 'var(--np-fg)',
              cursor: best && selecting === null ? 'pointer' : 'not-allowed',
              opacity: !best || (selecting !== null && !isSelecting) ? 0.5 : 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.35rem',
              }}
            >
              <span style={{ fontSize: '1rem' }}>{server.name}</span>
              {server.owned && (
                <span
                  style={{
                    padding: '0.05rem 0.4rem',
                    fontSize: '0.65rem',
                    fontFamily: 'var(--np-font-body)',
                    color: 'var(--np-green)',
                    border: '1px solid var(--np-green)',
                    borderRadius: 'var(--np-radius-sharp)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Owned
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--np-font-body)',
                color: 'var(--np-muted)',
                wordBreak: 'break-all',
              }}
            >
              {best ? best.uri : 'No connections available'}
              {isSelecting ? ' — selecting…' : ''}
            </div>
          </button>
        );
      })}
    </div>
  );
}
