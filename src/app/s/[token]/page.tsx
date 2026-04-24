import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { ClaimedShareView } from '@/components/player/ClaimedShareView';
import { ClaimForm, ShareHero } from '@/components/ui/transmission';
import { logEvent } from '@/db/queries/events';
import { listResumePositions } from '@/db/queries/resume';
import {
  claimDevice,
  computeShareStatus,
  getShareByTokenHash,
  incrementPlayCount,
} from '@/db/queries/shares';
import { computeDeviceFp } from '@/lib/device-lock';
import { buildShareMetadata } from '@/lib/share-metadata';
import { hashShareToken, verifyShareTokenSignature } from '@/lib/share-token';
import { formatTtlLong } from '@/lib/ttl';

// Must match the thresholds in ShareWatcher/Player so the hero CTA reflects
// whether the player will actually seek into a resumable position.
const RESUME_THRESHOLD_MS = 20_000;
const NEAR_END_MS = 60_000;

/**
 * Does this share have any resumable playback? Used purely for the hero CTA
 * label ("Watch" vs "Continue watching").
 */
function hasResumablePosition(shareId: string): boolean {
  const rows = listResumePositions(shareId);
  for (const r of rows) {
    if (r.position_ms < RESUME_THRESHOLD_MS) continue;
    if (r.duration_ms !== null && r.duration_ms - r.position_ms < NEAR_END_MS) continue;
    return true;
  }
  return false;
}

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  return buildShareMetadata(token);
}

export const dynamic = 'force-dynamic';

/**
 * Server Action: atomically claim the share for the caller's fingerprint
 * and bump the play count. No cookie is set — subsequent requests prove
 * their identity by re-deriving the same fingerprint from their UA +
 * Accept-Language headers on the server.
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

  // Already claimed by this exact fingerprint — nothing to do, just re-render.
  if (row.device_fingerprint_hash === deviceFp) {
    redirect(`/s/${token}`);
  }

  if (row.device_fingerprint_hash === null) {
    const won = claimDevice(row.id, deviceFp);
    if (won) {
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

  // Already claimed by a different fingerprint.
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
  const acceptLang = hdrs.get('accept-language') ?? '';

  // Link-preview bot bypass — no DB writes, no cookie checks, minimal page.
  if (isLinkPreviewBot(ua)) {
    return (
      <main className="min-h-screen bg-np-bg text-np-fg p-4 sm:p-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wide mb-4 text-np-fg">
            {row.title}
          </h1>
          <p className="text-np-muted">Shared via airPointer</p>
        </div>
      </main>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = row.expires_at === null ? 30 * 86400 : Math.max(60, row.expires_at - now);

  // Recompute the visitor's fingerprint. If the share is already claimed,
  // this visitor holds the lock only if their fingerprint matches; anyone
  // else lands on the "already claimed" page.
  const visitorFp = computeDeviceFp(ua, acceptLang);
  let holdsLock = false;
  if (row.device_fingerprint_hash !== null) {
    if (row.device_fingerprint_hash === visitorFp) {
      holdsLock = true;
    } else {
      redirect(`/s/${token}/claimed`);
    }
  }

  const posterSrc = row.poster_path ? `/api/share/${token}/poster` : null;
  const ttlLabel = row.expires_at === null ? 'never expires' : formatTtlLong(ttlSeconds);
  const ttlAccent: 'default' | 'warn' =
    row.expires_at !== null && ttlSeconds < 86_400 ? 'warn' : 'default';

  if (holdsLock) {
    const hasResume = hasResumablePosition(row.id);
    return (
      <ClaimedShareView
        linkId={row.id}
        title={row.title}
        mediaType={row.plex_media_type}
        rootRatingKey={row.plex_rating_key}
        senderLabel={row.sender_label}
        recipientLabel={row.recipient_label}
        ttlLabel={ttlLabel}
        ttlAccent={ttlAccent}
        posterSrc={posterSrc}
        hasResume={hasResume}
      />
    );
  }

  // Unclaimed — render click-through to claim. Required because Next 15
  // disallows cookie mutation from Server Components; the claim must
  // happen in a Server Action triggered by the form submit.
  const boundClaim = claimAction.bind(null, token);

  return (
    <main className="min-h-screen bg-np-bg text-np-fg safe-top safe-bottom safe-x relative overflow-hidden">
      <ShareHero
        title={row.title}
        mediaType={row.plex_media_type}
        rootRatingKey={row.plex_rating_key}
        senderLabel={row.sender_label}
        recipientLabel={row.recipient_label}
        ttlLabel={ttlLabel}
        ttlAccent={ttlAccent}
        ttlHint="locks to device"
        posterSrc={posterSrc}
        cta={
          <ClaimForm
            action={boundClaim}
            ariaLabel={`Start streaming ${row.title}`}
            className="w-full animate-enter-delay-3"
          >
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
          </ClaimForm>
        }
      />
    </main>
  );
}
