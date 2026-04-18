import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'airplex — link unavailable',
  referrer: 'no-referrer',
  robots: 'noindex,nofollow',
};

type Reason = 'expired' | 'revoked' | 'exhausted';

const REASON_COPY: Record<Reason, { headline: string; body: string }> = {
  expired: {
    headline: 'LINK EXPIRED',
    body: 'This share link has passed its expiry window. Ask the sender to extend it or issue a new one.',
  },
  revoked: {
    headline: 'LINK REVOKED',
    body: 'The sender revoked this share link. It can no longer be used.',
  },
  exhausted: {
    headline: 'PLAY LIMIT REACHED',
    body: 'This link reached its configured play count and is no longer active.',
  },
};

function normalizeReason(value: string | string[] | undefined): Reason {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'revoked' || raw === 'exhausted') return raw;
  return 'expired';
}

export default async function ExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const sp = await searchParams;
  const reason = normalizeReason(sp?.reason);
  const copy = REASON_COPY[reason];

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-np-bg text-np-fg">
      <section className="glass max-w-lg w-full p-8">
        <p className="text-np-magenta font-mono text-xs uppercase tracking-widest mb-3">airplex</p>
        <h1 className="font-display text-4xl uppercase tracking-wide text-np-fg mb-4">
          {copy.headline}
        </h1>
        <p className="font-mono text-sm text-np-muted leading-relaxed">{copy.body}</p>
      </section>
    </main>
  );
}
