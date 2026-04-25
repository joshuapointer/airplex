import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'airPointer — not found',
  robots: 'noindex,nofollow',
};

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-np-bg text-np-fg">
      <div className="glass w-full max-w-sm p-8 flex flex-col gap-6">
        {/* Brand */}
        <p className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--np-cyan)' }}>
          airPointer
        </p>

        {/* 404 mark */}
        <div>
          <p
            className="font-display text-6xl uppercase tracking-widest leading-none mb-1"
            style={{ color: 'var(--np-muted)' }}
            aria-hidden="true"
          >
            404
          </p>
          <h1 className="font-display text-2xl uppercase tracking-wide leading-tight">
            Not Found
          </h1>
        </div>

        {/* Body */}
        <p className="font-mono text-sm" style={{ color: 'var(--np-muted)' }}>
          The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
        </p>

        {/* Back link */}
        <Link
          href="/"
          className="btn-ghost text-sm"
          style={{ justifyContent: 'center' }}
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
