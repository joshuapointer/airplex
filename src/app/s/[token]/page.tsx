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
  if (row.device_fingerprint_hash && existing.device_fp === row.device_fingerprint_hash) {
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

/** Format remaining TTL as a human-friendly string, e.g. "47 hours" or "3 days". */
function formatTtl(secondsRemaining: number): string {
  const h = Math.floor(secondsRemaining / 3600);
  const d = Math.floor(h / 24);
  if (d >= 2) return `${d} days`;
  if (h >= 1) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const m = Math.floor(secondsRemaining / 60);
  return `${m} ${m === 1 ? 'minute' : 'minutes'}`;
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
      <main className="min-h-screen bg-np-bg text-np-fg safe-top safe-bottom safe-x">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <header className="mb-4 flex items-center justify-between animate-enter">
            <p className="text-np-green font-mono text-xs uppercase tracking-widest">airplex</p>
            <span className="badge">share</span>
          </header>
          <div className="animate-enter-delay-1">
            <ShareWatcher
              linkId={row.id}
              title={row.title}
              mediaType={row.plex_media_type}
              rootRatingKey={row.plex_rating_key}
            />
          </div>
        </div>
      </main>
    );
  }

  // Unclaimed — render click-through to claim. Required because Next 15
  // disallows cookie mutation from Server Components; the claim must
  // happen in a Server Action triggered by the form submit.
  const boundClaim = claimAction.bind(null, token);
  const ttlLabel = formatTtl(ttlSeconds);

  const posterSrc = row.poster_path ? `/api/share/${token}/poster` : null;

  return (
    <main className="min-h-screen bg-np-bg text-np-fg safe-top safe-bottom safe-x flex flex-col relative overflow-hidden">
      {/* Blurred backdrop — purely decorative, hidden from AT. */}
      {posterSrc ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${posterSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(40px) saturate(1.1)',
            opacity: 0.25,
            transform: 'scale(1.15)',
          }}
        />
      ) : null}
      <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full px-4 sm:px-6 py-10 relative">
        {/* Brand mark */}
        <header className="mb-8 flex items-center justify-between animate-enter">
          <p className="text-np-green font-mono text-xs uppercase tracking-widest">airplex</p>
          <span className="badge">share</span>
        </header>

        {/* From line — sender identity */}
        {row.sender_label ? (
          <p className="text-np-cyan font-mono text-xs uppercase tracking-widest mb-3 animate-enter-delay-1">
            From <span className="text-np-fg">{row.sender_label}</span>
          </p>
        ) : null}

        {/* Poster thumbnail */}
        {posterSrc ? (
          <div className="mb-5 animate-enter-delay-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={posterSrc}
              alt=""
              width={120}
              height={180}
              loading="eager"
              className="rounded-sharp"
              style={{
                width: '120px',
                height: '180px',
                objectFit: 'cover',
                border: '1px solid var(--np-muted)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              }}
            />
          </div>
        ) : null}

        {/* Title */}
        <h1 className="font-display text-4xl sm:text-5xl uppercase tracking-wide mb-3 text-np-fg leading-tight animate-enter-delay-1">
          {row.title}
        </h1>

        {/* Recipient + TTL context */}
        <div className="flex flex-col gap-1.5 mb-10 animate-enter-delay-2">
          <p className="text-np-muted font-mono text-sm">
            Shared with <span className="text-np-cyan">{row.recipient_label}</span>
          </p>
          <p className="text-np-muted font-mono text-xs flex items-center gap-1.5">
            {/* Clock icon */}
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
              <path
                d="M6 3.5V6.5L8 7.5"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </svg>
            Available for the next <span className="text-np-fg">{ttlLabel}</span>
          </p>
          <p className="text-np-muted font-mono text-xs" style={{ color: 'var(--np-text-faint)' }}>
            This link locks to the first device that opens it.
          </p>
        </div>

        {/* CTA */}
        <form action={boundClaim} className="animate-enter-delay-3">
          <button
            type="submit"
            className="btn-play w-full sm:w-auto"
            aria-label={`Start streaming ${row.title}`}
          >
            {/* Play triangle */}
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3 2.5L13 8L3 13.5V2.5Z" />
            </svg>
            Start streaming
          </button>
        </form>
      </div>
    </main>
  );
}
