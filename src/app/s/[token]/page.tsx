import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getIronSession } from 'iron-session';

import { VideoPlayer } from '@/components/player/VideoPlayer';
import { logEvent } from '@/db/queries/events';
import {
  claimDevice,
  computeShareStatus,
  getShareByTokenHash,
  incrementPlayCount,
} from '@/db/queries/shares';
import { computeDeviceFp, ironConfigFor, type DeviceLockCookiePayload } from '@/lib/device-lock';
import { hashShareToken, verifyShareTokenSignature } from '@/lib/share-token';

export const metadata: Metadata = {
  title: 'airplex',
  referrer: 'no-referrer',
  robots: 'noindex,nofollow',
};

export const dynamic = 'force-dynamic';

/**
 * Seals and sets the per-link device-lock iron-session cookie. Called
 * exclusively on the winning branch of `claimDevice` so the cookie and the
 * DB row are set atomically from the winning request's perspective.
 */
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

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // 1. Signature gate — cheap reject before any DB hit (spec §8 brute force).
  if (!verifyShareTokenSignature(token)) {
    notFound();
  }

  // 2. Row lookup by hash.
  const row = getShareByTokenHash(hashShareToken(token));
  if (!row) {
    notFound();
  }

  // 3. Status gate.
  const status = computeShareStatus(row);
  if (!status.active) {
    const reason = status.revoked ? 'revoked' : status.exhausted ? 'exhausted' : 'expired';
    redirect(`/s/${token}/expired?reason=${reason}`);
  }

  // 4. Compute device fingerprint from request headers.
  const hdrs = await headers();
  const ua = hdrs.get('user-agent') ?? '';
  const acceptLang = hdrs.get('accept-language') ?? '';
  const deviceFp = computeDeviceFp(ua, acceptLang);

  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(60, row.expires_at - now);

  // 5. Device-lock state machine (spec §7.2, plan §F item 6).
  let allow = false;

  if (row.device_fingerprint_hash === null) {
    // Try to win the first-claim race. Atomic UPDATE...WHERE fp IS NULL.
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
      allow = true;
    }
  }

  if (!allow) {
    // Either fp was already set on arrival OR our claim lost the race to a
    // sibling request. Re-read the row so we verify against the COMMITTED
    // fingerprint, not the stale pre-UPDATE snapshot. Without this re-read,
    // the losing request would compare against null and fall-through incorrectly.
    const freshRow = getShareByTokenHash(hashShareToken(token));
    const lockedFp = freshRow?.device_fingerprint_hash ?? null;

    if (!lockedFp) {
      // Still unclaimed after our failed claim attempt — shouldn't happen
      // in normal operation, but reject safely.
      redirect(`/s/${token}/claimed`);
    }

    const cookieStore = await cookies();
    const deviceSession = await getIronSession<DeviceLockCookiePayload>(
      cookieStore,
      ironConfigFor(row.id, ttlSeconds),
    );
    if (deviceSession.device_fp && deviceSession.device_fp === lockedFp) {
      allow = true;
    } else {
      logEvent({
        share_id: row.id,
        kind: 'rejected_device',
        userAgent: ua,
        detail: { presented_fp: deviceFp },
      });
      redirect(`/s/${token}/claimed`);
    }
  }

  // 6. Render player. Token is NEVER passed to the client — HLS URL uses
  // the internal link id only (spec §8 "Token leaking via Referer").
  const hlsUrl = `/api/hls/${row.id}/index.m3u8`;
  return (
    <main className="min-h-screen bg-np-bg text-np-fg p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <header className="mb-4 flex items-center justify-between">
          <p className="text-np-green font-mono text-xs uppercase tracking-widest">airplex</p>
          <span className="badge">share</span>
        </header>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wide mb-4 text-np-fg">
          {row.title}
        </h1>
        <VideoPlayer linkId={row.id} title={row.title} hlsUrl={hlsUrl} />
      </div>
    </main>
  );
}
