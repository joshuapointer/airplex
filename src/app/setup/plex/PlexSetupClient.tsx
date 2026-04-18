'use client';

import { useState } from 'react';

interface PlexSetupClientProps {
  csrf: string;
  configured: boolean;
  serverName: string | null;
  serverUrl: string | null;
  plexClientId: string;
}

export function PlexSetupClient({
  csrf,
  configured,
  serverName,
  serverUrl,
  plexClientId,
}: PlexSetupClientProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startFlow() {
    setBusy(true);
    setError(null);
    try {
      // Create the PIN from the browser so plex.tv sees the user's IP,
      // not the server's datacenter IP (which triggers a security alert).
      const pinRes = await fetch('https://plex.tv/api/v2/pins', {
        method: 'POST',
        headers: {
          strong: 'true',
          'X-Plex-Product': 'airplex',
          'X-Plex-Client-Identifier': plexClientId,
          Accept: 'application/json',
          'Content-Length': '0',
        },
      });
      if (!pinRes.ok) throw new Error(`plex.tv PIN creation failed: ${pinRes.status}`);
      const pin = (await pinRes.json()) as { id: number; code: string };

      // Store the pin on the server so the callback can poll it.
      const r = await fetch('/api/setup/plex/start', {
        method: 'POST',
        headers: { 'x-airplex-csrf': csrf, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinId: pin.id, pinCode: pin.code }),
      });
      if (!r.ok) {
        const json = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${r.status}`);
      }

      const params = [
        `clientID=${encodeURIComponent(plexClientId)}`,
        `code=${encodeURIComponent(pin.code)}`,
        `context[device][product]=airplex`,
        `forwardUrl=${encodeURIComponent(window.location.origin + '/api/setup/plex/callback')}`,
      ].join('&');
      window.location.href = `https://app.plex.tv/auth#?${params}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Plex sign-in.');
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 'var(--np-radius-soft)',
        padding: '1.5rem',
        background: 'rgba(15,15,15,0.75)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {configured ? (
        <>
          <div
            style={{
              display: 'inline-block',
              padding: '0.125rem 0.5rem',
              marginBottom: '0.75rem',
              fontSize: '0.7rem',
              fontFamily: 'var(--np-font-body)',
              color: 'var(--np-green)',
              border: '1px solid var(--np-green)',
              borderRadius: 'var(--np-radius-sharp)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Connected
          </div>
          <div style={{ fontSize: '1rem', marginBottom: '0.35rem' }}>
            {serverName ?? 'Plex Media Server'}
          </div>
          <div
            style={{
              fontSize: '0.8rem',
              fontFamily: 'var(--np-font-body)',
              color: 'var(--np-muted)',
              wordBreak: 'break-all',
              marginBottom: '1.5rem',
            }}
          >
            {serverUrl}
          </div>
        </>
      ) : (
        <p
          style={{
            color: 'var(--np-muted)',
            fontSize: '0.9rem',
            marginBottom: '1.25rem',
          }}
        >
          You&rsquo;ll be redirected to plex.tv to sign in, then sent back here to pick a server.
        </p>
      )}

      {error && (
        <p
          style={{
            color: 'var(--np-magenta)',
            fontSize: '0.85rem',
            marginBottom: '0.75rem',
          }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={startFlow}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0.55rem 1.25rem',
          background: busy ? 'rgba(255,255,255,0.1)' : 'var(--np-green)',
          color: busy ? 'var(--np-muted)' : 'var(--np-bg)',
          fontFamily: 'var(--np-font-display)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          border: '1px solid var(--np-green)',
          borderRadius: 'var(--np-radius-sharp)',
          cursor: busy ? 'not-allowed' : 'pointer',
          fontSize: '0.85rem',
        }}
      >
        {busy ? 'Redirecting…' : configured ? 'Reconnect Plex' : 'Sign in with Plex'}
      </button>
    </div>
  );
}
