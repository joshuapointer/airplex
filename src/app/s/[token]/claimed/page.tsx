import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'airplex — already claimed',
  referrer: 'no-referrer',
  robots: 'noindex,nofollow',
};

export default function ClaimedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-np-bg text-np-fg">
      <section className="glass max-w-lg w-full p-8">
        <p className="text-np-cyan font-mono text-xs uppercase tracking-widest mb-3">airplex</p>
        <h1 className="font-display text-4xl uppercase tracking-wide text-np-fg mb-4">
          ALREADY CLAIMED
        </h1>
        <p className="font-mono text-sm text-np-muted leading-relaxed">
          Another device has already opened this share link. Each link can only be claimed by one
          device. Ask the sender to reset the device lock or issue a new link.
        </p>
      </section>
    </main>
  );
}
