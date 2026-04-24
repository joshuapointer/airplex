import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getIronSession } from 'iron-session';

import { ShareWatcher } from '@/components/player/ShareWatcher';
import { logEvent } from '@/db/queries/events';
import {
  claimDevice,
  computeShareStatus,
  getShareByTokenHash,
  incrementPlayCount,
} from '@/db/queries/shares';
import { computeDeviceFp, ironConfigFor, type DeviceLockCookiePayload } from '@/lib/device-lock';
import { hashShareToken, verifyShareTokenSignature } from '@/lib/share-token';

/**
 * Link-preview / unfurl bots that hit share URLs when they're pasted into
 * messaging platforms. Must NOT claim the device, because claiming locks
 * the share to the bot's fingerprint and the real recipient then gets a
 * "already claimed" rejection. These bots are served a minimal response
 * without touching DB state.
 */
const LINK_PREVIEW_BOT_RE =
  /facebookexternalhit|facebot|twitterbot|whatsapp|telegrambot|discordbot|slackbot|linkedinbot|pinterest|redditbot|applebot|googlebot|bingbot|yandexbot|duckduckbot|bot\b|crawler|spider|preview|unfurl|embedly|skypeuripreview|iframely/i;

function isLinkPreviewBot(ua: string): boolean {
  return LINK_PREVIEW_BOT_RE.test(ua);
}

export const metadata: Metadata = {
  title: 'airplex',
  referrer: 'no-referrer',
  robots: 'noindex,nofollow',
};

export const dynamic = 'force-dynamic';

async function setDeviceCookie(linkId: string, fp: string, ttlSeconds: number): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<DeviceLockCookiePayload>(
    cookieStore,
    ironConfigFor(linkId, ttlSeconds),
  );
  session.link_id = linkId;
  session.device_fp = fp;
  session.issued_at = Math.floor(Date.now() / 1000);
  await session.save();
}

/**
 * Server Action: claim the share for the caller's fingerprint, set the
 * device-lock cookie, bump the play count. Next 15 only allows cookie
 * mutation from Server Actions and Route Handlers — not from Server
 * Components — so the claim flow has to live here rather than inline in
 * the page render.
 */
async function claimAction(token: string): Promise<void> {
  'use server';

  if (!verifyShareTokenSignature(token)) {
    redirect('/');
  }
  const row = getShareByTokenHash(hashShareToken(token));
  if (!row) {
    redirect('/');
  }

  const status = computeShareStatus(row);
  if (!status.active) {
    const reason = status.revoked ? 'revoked' : status.exhausted ? 'exhausted' : 'expired';
    redirect(`/s/${token}/expired?reason=${reason}`);
  }

  const hdrs = await headers();
  const ua = hdrs.get('user-agent') ?? '';
  const acceptLang = hdrs.get('accept-language') ?? '';
  const deviceFp = computeDeviceFp(ua, acceptLang);

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(60, row.expires_at - now);

  // If we already hold the cookie for this link, nothing to do — re-render.
  const cookieStore = await cookies();
  const existing = await getIronSession<DeviceLockCookiePayload>(
    cookieStore,
    ironConfigFor(row.id, ttlSeconds),
  );
  if (
    row.device_fingerprint_hash &&
    existing.device_fp === row.device_fingerprint_hash
  ) {
    redirect(`/s/${token}`);
  }

  if (row.device_fingerprint_hash === null) {
    const won = claimDevice(row.id, deviceFp);
    if (won) {
      await setDeviceCookie(row.id, deviceFp, ttlSeconds);
      incrementPlayCount(row.id);
      logEvent({
        share_id: row.id,
        kind: 'claimed',
        userAgent: ua,
        detail: { device_fp: deviceFp },
      });
      redirect(`/s/${token}`);
    }
  }

  // Already claimed by a different device.
  logEvent({
    share_id: row.id,
    kind: 'rejected_device',
    userAgent: ua,
    detail: { presented_fp: deviceFp },
  });
  redirect(`/s/${token}/claimed`);
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!verifyShareTokenSignature(token)) {
    notFound();
  }

  const row = getShareByTokenHash(hashShareToken(token));
  if (!row) {
    notFound();
  }

  const status = computeShareStatus(row);
  if (!status.active) {
    const reason = status.revoked ? 'revoked' : status.exhausted ? 'exhausted' : 'expired';
    redirect(`/s/${token}/expired?reason=${reason}`);
  }

  const hdrs = await headers();
  const ua = hdrs.get('user-agent') ?? '';

  // Link-preview bot bypass — no DB writes, no cookie checks, minimal page.
  if (isLinkPreviewBot(ua)) {
    return (
      <main className="min-h-screen bg-np-bg text-np-fg p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wide mb-4 text-np-fg">
            {row.title}
          </h1>
          <p className="text-np-muted">Shared via airplex</p>
        </div>
      </main>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(60, row.expires_at - now);

  // Check if this device already holds the lock (cookie matches committed fp).
  let holdsLock = false;
  if (row.device_fingerprint_hash !== null) {
    const cookieStore = await cookies();
    const deviceSession = await getIronSession<DeviceLockCookiePayload>(
      cookieStore,
      ironConfigFor(row.id, ttlSeconds),
    );
    if (deviceSession.device_fp && deviceSession.device_fp === row.device_fingerprint_hash) {
      holdsLock = true;
    } else {
      // Someone else owns it — reject.
      redirect(`/s/${token}/claimed`);
    }
  }

  if (holdsLock) {
    return (
      <main className="min-h-screen bg-np-bg text-np-fg p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          <header className="mb-4 flex items-center justify-between">
            <p className="text-np-green font-mono text-xs uppercase tracking-widest">airplex</p>
            <span className="badge">share</span>
          </header>
          <ShareWatcher
            linkId={row.id}
            title={row.title}
            mediaType={row.plex_media_type}
            rootRatingKey={row.plex_rating_key}
          />
        </div>
      </main>
    );
  }

  // Unclaimed — render click-through to claim. Required because Next 15
  // disallows cookie mutation from Server Components; the claim must
  // happen in a Server Action triggered by the form submit.
  const boundClaim = claimAction.bind(null, token);

  return (
    <main className="min-h-screen bg-np-bg text-np-fg p-4 sm:p-6">
      <div className="max-w-xl mx-auto pt-12">
        <header className="mb-6 flex items-center justify-between">
          <p className="text-np-green font-mono text-xs uppercase tracking-widest">airplex</p>
          <span className="badge">share</span>
        </header>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wide mb-2 text-np-fg">
          {row.title}
        </h1>
        <p className="text-np-muted text-sm mb-8">
          Shared with {row.recipient_label}. Tap start to open the stream. This link locks to
          the first device that starts it.
        </p>
        <form action={boundClaim}>
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              padding: '0.75rem 2rem',
              background: 'var(--np-green)',
              color: 'var(--np-bg)',
              fontFamily: 'var(--np-font-display)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: '1px solid var(--np-green)',
              borderRadius: 'var(--np-radius-sharp)',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            Start streaming
          </button>
        </form>
      </div>
    </main>
  );
}
