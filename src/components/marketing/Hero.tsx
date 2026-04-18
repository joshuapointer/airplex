import Link from 'next/link';
import { GlassPanel } from '@/components/ui/GlassPanel';

export function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Logo / headline */}
      <h1
        className="text-7xl sm:text-8xl md:text-9xl font-display uppercase tracking-widest text-center mb-4 select-none"
        style={{ color: 'var(--np-cyan)', textShadow: '0 0 40px var(--np-cyan)' }}
      >
        AIRPLEX
      </h1>

      {/* Tagline */}
      <p
        className="text-base sm:text-lg font-mono text-center max-w-xl mb-10"
        style={{ color: 'var(--np-muted)' }}
      >
        Share a Plex stream. Hit play. AirPlay to anything.
      </p>

      {/* CTA */}
      <Link
        href="/login"
        className="btn-primary px-8 py-3 text-sm tracking-widest"
        aria-label="Admin login"
      >
        Admin Login
      </Link>

      {/* How it works */}
      <GlassPanel className="mt-16 p-8 max-w-2xl w-full">
        <h2
          className="text-sm font-display uppercase tracking-widest mb-6"
          style={{ color: 'var(--np-green)' }}
        >
          How it works
        </h2>
        <ol className="space-y-4 list-none">
          {[
            {
              n: '01',
              title: 'Pick a title',
              body: 'Browse your Plex library and select a movie or episode to share.',
            },
            {
              n: '02',
              title: 'Create a share link',
              body: 'Set a recipient label, optional expiry, and play-count limit. A one-time token URL is generated.',
            },
            {
              n: '03',
              title: 'Send the link',
              body: 'The recipient opens the link on any device. Device-lock ensures only one viewer per link.',
            },
            {
              n: '04',
              title: 'AirPlay to your TV',
              body: 'On iPhone or iPad, tap the native AirPlay button in the player controls. The stream goes to your Apple TV instantly.',
            },
          ].map(({ n, title, body }) => (
            <li key={n} className="flex gap-4">
              <span
                className="font-display text-2xl leading-tight shrink-0 w-10"
                style={{ color: 'var(--np-cyan)' }}
              >
                {n}
              </span>
              <div>
                <p
                  className="font-display uppercase tracking-wider text-sm mb-1"
                  style={{ color: 'var(--np-fg)' }}
                >
                  {title}
                </p>
                <p
                  className="text-xs font-mono leading-relaxed"
                  style={{ color: 'var(--np-muted)' }}
                >
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </GlassPanel>
    </section>
  );
}
