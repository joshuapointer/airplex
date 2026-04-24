import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'airplex — link unavailable',
  referrer: 'no-referrer',
  robots: 'noindex,nofollow',
};

type Reason = 'expired' | 'revoked' | 'exhausted';

const REASON_COPY: Record<
  Reason,
  { headline: string; body: string; hint: string; accentColor: string }
> = {
  expired: {
    headline: 'Link expired',
    body: 'This share link has passed its expiry window and can no longer be used.',
    hint: 'Ask the sender to create a new link for you.',
    accentColor: 'var(--np-magenta)',
  },
  revoked: {
    headline: 'Link revoked',
    body: 'The sender has revoked this share link.',
    hint: 'Ask the sender if they meant to send you a different link.',
    accentColor: 'var(--np-magenta)',
  },
  exhausted: {
    headline: 'Play limit reached',
    body: 'This link has reached its configured play limit.',
    hint: 'Ask the sender to reset the limit or issue a new link.',
    accentColor: 'var(--np-magenta)',
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
    <main className="min-h-screen flex items-center justify-center p-6 bg-np-bg text-np-fg safe-top safe-bottom safe-x">
      <section
        className="glass max-w-sm w-full p-8 animate-enter"
        role="main"
        aria-labelledby="expired-heading"
      >
        {/* Brand */}
        <p
          className="font-mono text-xs uppercase tracking-widest mb-6"
          style={{ color: copy.accentColor }}
        >
          airplex
        </p>

        {/* Icon mark */}
        <div className="mb-5" aria-hidden="true">
          <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ color: copy.accentColor }}
          >
            <circle cx="18" cy="18" r="17" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M18 10v10M18 26v.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Heading */}
        <h1
          id="expired-heading"
          className="font-display text-3xl uppercase tracking-wide text-np-fg mb-3 leading-tight"
        >
          {copy.headline}
        </h1>

        {/* Body */}
        <p className="font-mono text-sm text-np-muted leading-relaxed mb-4">{copy.body}</p>

        {/* Hint — what to do next */}
        <p className="font-mono text-xs leading-relaxed" style={{ color: 'var(--np-text-faint)' }}>
          {copy.hint}
        </p>
      </section>
    </main>
  );
}
