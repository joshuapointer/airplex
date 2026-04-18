import { redirect } from 'next/navigation';
import { requireAdmin } from '@/auth/guards';
import { env } from '@/lib/env';
import { listResources, type PlexConnection } from '@/plex/account';
import { getPlexToken } from '@/plex/config';
import { ServerPickerClient } from './ServerPickerClient';

export const dynamic = 'force-dynamic';

export interface SetupServer {
  name: string;
  owned: boolean;
  connections: PlexConnection[];
}

export default async function PlexServersPage() {
  const session = await requireAdmin('/setup/plex/servers');

  const token = getPlexToken();
  if (!token) {
    redirect('/setup/plex');
  }

  let servers: SetupServer[] = [];
  let error: string | null = null;
  try {
    const resources = await listResources(token, env.PLEX_CLIENT_IDENTIFIER);
    servers = resources.map((r) => ({
      name: r.name,
      owned: r.owned,
      connections: r.connections,
    }));
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load servers';
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--np-bg)',
        color: 'var(--np-fg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '620px' }}>
        <h1
          style={{
            fontFamily: 'var(--np-font-display)',
            color: 'var(--np-cyan)',
            fontSize: '1.6rem',
            letterSpacing: '0.08em',
            marginBottom: '0.25rem',
          }}
        >
          pick a server
        </h1>
        <p
          style={{
            color: 'var(--np-muted)',
            fontSize: '0.85rem',
            marginBottom: '1.5rem',
          }}
        >
          Choose the Plex Media Server airplex should stream from.
        </p>

        {error ? (
          <div
            style={{
              padding: '0.75rem 1rem',
              border: '1px solid var(--np-magenta)',
              borderRadius: 'var(--np-radius-sharp)',
              color: 'var(--np-magenta)',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        ) : (
          <ServerPickerClient csrf={session.csrf} servers={servers} />
        )}
      </div>
    </div>
  );
}
