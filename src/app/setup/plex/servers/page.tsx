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
    <main className="min-h-screen safe-top safe-bottom safe-x flex items-center justify-center bg-np-bg text-np-fg">
      <div className="w-full max-w-[620px] animate-enter">
        <h1 className="font-display uppercase tracking-[0.08em] text-2xl text-np-cyan mb-1">
          pick a server
        </h1>
        <p className="text-sm text-np-muted font-mono mb-6">
          Choose the Plex Media Server airPointer should stream from.
        </p>

        {error ? (
          <div className="px-4 py-3 border border-np-magenta rounded-sharp text-np-magenta font-mono text-sm bg-np-magenta/10">
            {error}
          </div>
        ) : (
          <ServerPickerClient csrf={session.csrf} servers={servers} />
        )}
      </div>
    </main>
  );
}
