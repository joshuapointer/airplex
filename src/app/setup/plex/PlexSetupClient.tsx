'use client';

import { useState } from 'react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Badge } from '@/components/ui/Badge';
import { InlineError } from '@/components/ui/InlineError';

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
      const pinRes = await fetch('https://plex.tv/api/v2/pins?strong=true', {
        method: 'POST',
        headers: {
          'X-Plex-Product': 'airplex',
          'X-Plex-Client-Identifier': plexClientId,
          'X-Plex-Version': '1.0',
          'X-Plex-Platform': 'Web',
          'X-Plex-Platform-Version': '1.0',
          'X-Plex-Device': 'airplex',
          'X-Plex-Device-Name': 'airplex',
          'X-Plex-Model': 'hosted',
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

      const params = new URLSearchParams({
        clientID: plexClientId,
        code: pin.code,
        'context[device][product]': 'airplex',
        'context[device][version]': '1.0',
        'context[device][platform]': 'Web',
        'context[device][platformVersion]': '1.0',
        'context[device][device]': 'airplex',
        'context[device][deviceName]': 'airplex',
        'context[device][model]': 'hosted',
        forwardUrl: window.location.origin + '/api/setup/plex/callback',
      });
      window.location.href = `https://app.plex.tv/auth#?${params.toString()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Plex sign-in.');
      setBusy(false);
    }
  }

  return (
    <GlassPanel className="p-6">
      {configured ? (
        <>
          <div className="mb-3">
            <Badge status="active">Connected</Badge>
          </div>
          <div className="font-display uppercase tracking-wide text-np-fg text-base mb-1">
            {serverName ?? 'Plex Media Server'}
          </div>
          <div className="text-xs font-mono text-np-muted break-all mb-6">{serverUrl}</div>
        </>
      ) : (
        <p className="text-sm text-np-muted font-mono mb-5">
          You&rsquo;ll be redirected to plex.tv to sign in, then sent back here to pick a server.
        </p>
      )}

      {error && (
        <div className="mb-3">
          <InlineError>{error}</InlineError>
        </div>
      )}

      <button
        type="button"
        onClick={startFlow}
        disabled={busy}
        className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? 'Redirecting…' : configured ? 'Reconnect Plex' : 'Sign in with Plex'}
      </button>
    </GlassPanel>
  );
}
