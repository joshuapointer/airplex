import { listShares, computeShareStatus } from '@/db/queries/shares';
import { getRecentPlayShareIds } from '@/db/queries/events';
import { NowLiveStrip } from '@/components/ui/transmission';
import { FooterStats } from '@/components/dashboard/FooterStats';
import type { LiveMap } from '@/types/transmission';

export default async function DashboardPage() {
  // Layout already enforced auth gate. Fetch directly via server component.
  const allShares = listShares();

  const now = Math.floor(Date.now() / 1000);
  let active = 0;
  let expired = 0;
  let revoked = 0;

  for (const row of allShares) {
    const status = computeShareStatus(row, now);
    if (status.revoked) {
      revoked++;
    } else if (status.expired || status.exhausted) {
      expired++;
    } else if (status.active) {
      active++;
    }
  }

  const activeShares = allShares.filter((s) => {
    const st = computeShareStatus(s, now);
    return st.active;
  });

  const recentIds = getRecentPlayShareIds();
  const liveMap: LiveMap = {};
  for (const s of activeShares) liveMap[s.id] = recentIds.has(s.id);

  return (
    <div>
      <h1 className="animate-enter font-display uppercase tracking-wide text-2xl text-np-cyan mb-6">
        Dashboard
      </h1>

      <section className="animate-enter-delay-1">
        <h2 className="font-display text-sm text-np-muted uppercase tracking-[0.1em] mb-3">
          Now Live ({activeShares.length})
        </h2>
        <NowLiveStrip shares={activeShares} liveMap={liveMap} />
      </section>

      <FooterStats active={active} expired={expired} revoked={revoked} />
    </div>
  );
}
