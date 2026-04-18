import { requireAdmin } from '@/auth/guards';
import { getPlexBaseUrl, getPlexServerName, isPlexConfigured } from '@/plex/config';
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
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <h1
          style={{
            fontFamily: 'var(--np-font-display)',
            color: 'var(--np-cyan)',
            fontSize: '1.6rem',
            letterSpacing: '0.08em',
            marginBottom: '0.25rem',
          }}
        >
          airplex setup
        </h1>
        <p
          style={{
            color: 'var(--np-muted)',
            fontSize: '0.85rem',
            marginBottom: '1.5rem',
          }}
        >
          Connect your Plex account to begin sharing.
        </p>

        {errorMessage && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              border: '1px solid var(--np-magenta)',
              borderRadius: 'var(--np-radius-sharp)',
              color: 'var(--np-magenta)',
              fontSize: '0.85rem',
              background: 'rgba(255,0,128,0.06)',
            }}
          >
            {errorMessage}
          </div>
        )}

        <PlexSetupClient
          csrf={session.csrf}
          configured={configured}
          serverName={serverName}
          serverUrl={serverUrl}
        />
      </div>
    </div>
  );
}
