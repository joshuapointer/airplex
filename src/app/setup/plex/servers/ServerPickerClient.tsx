'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlexConnection } from '@/plex/account';
import { Badge } from '@/components/ui/Badge';

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
      <p className="font-mono text-sm text-np-muted">
        No Plex Media Servers found on this account.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="font-mono text-sm text-np-magenta">{error}</p>}
      {servers.map((server) => {
        const best = pickBestConnection(server.connections);
        const isSelecting = selecting === server.name;
        const disabled = !best || selecting !== null;
        const dimmed = !best || (selecting !== null && !isSelecting);
        return (
          <button
            key={`${server.name}-${best?.uri ?? 'none'}`}
            type="button"
            onClick={() => select(server)}
            disabled={disabled}
            className="episode-row flex-col items-start gap-1.5"
            style={dimmed ? { opacity: 0.5 } : undefined}
            aria-label={`Select ${server.name}${server.owned ? ' (owned)' : ''}`}
          >
            <span className="flex items-center gap-2">
              <span className="font-display text-base uppercase tracking-wide text-np-fg">
                {server.name}
              </span>
              {server.owned && <Badge status="active">Owned</Badge>}
            </span>
            <span className="font-mono text-xs text-np-muted break-all">
              {best ? best.uri : 'No connections available'}
              {isSelecting ? ' — selecting…' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
