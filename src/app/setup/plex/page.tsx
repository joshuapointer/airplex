import { requireAdmin } from '@/auth/guards';
import { getPlexBaseUrl, getPlexServerName, isPlexConfigured } from '@/plex/config';
import { env } from '@/lib/env';
import { PlexSetupClient } from './PlexSetupClient';

export const dynamic = 'force-dynamic';

interface SetupPageProps {
  searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  no_pin: 'No pending setup PIN found. Please start the flow again.',
  auth_timeout: 'Plex did not confirm the sign-in in time. Please try again from this page.',
};

export default async function PlexSetupPage({ searchParams }: SetupPageProps) {
  const session = await requireAdmin('/setup/plex');
  const params = await searchParams;
  const errorKey = params.error ?? null;
  const errorMessage = errorKey ? (ERROR_MESSAGES[errorKey] ?? 'Setup failed.') : null;

  const configured = isPlexConfigured();
  const serverName = configured ? getPlexServerName() : null;
  const serverUrl = configured ? getPlexBaseUrl() : null;

  return (
    <main className="min-h-screen safe-top safe-bottom safe-x flex items-center justify-center bg-np-bg text-np-fg">
      <div className="w-full max-w-[520px] animate-enter">
        <h1 className="font-display uppercase tracking-[0.08em] text-2xl text-np-cyan mb-1">
          airPointer setup
        </h1>
        <p className="text-sm text-np-muted font-mono mb-6">
          Connect your Plex account to begin sharing.
        </p>

        {errorMessage && (
          <div className="mb-4 px-4 py-3 border border-np-magenta rounded-sharp text-np-magenta font-mono text-sm bg-np-magenta/10">
            {errorMessage}
          </div>
        )}

        <PlexSetupClient
          csrf={session.csrf}
          configured={configured}
          serverName={serverName}
          serverUrl={serverUrl}
          plexClientId={env.PLEX_CLIENT_IDENTIFIER}
        />
      </div>
    </main>
  );
}
