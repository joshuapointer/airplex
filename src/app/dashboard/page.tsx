import Link from 'next/link';
import { listShares, computeShareStatus } from '@/db/queries/shares';
import { GlassPanel } from '@/components/ui/GlassPanel';

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

  const total = allShares.length;

  return (
    <div>
      <h1 className="animate-enter font-display uppercase tracking-wide text-2xl text-np-cyan mb-6">
        Dashboard
      </h1>

      <div className="animate-enter-delay-1 grid gap-4 mb-8 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        <StatCard label="Total" value={total} color="var(--np-fg)" />
        <StatCard label="Active" value={active} color="var(--np-green)" />
        <StatCard label="Expired" value={expired} color="var(--np-muted)" />
        <StatCard label="Revoked" value={revoked} color="var(--np-magenta)" />
      </div>

      <p className="animate-enter-delay-2 text-sm text-np-muted font-mono">
        Use{' '}
        <Link href="/dashboard/shares" className="text-np-cyan no-underline hover:underline">
          Shares
        </Link>{' '}
        to manage existing links or{' '}
        <Link href="/dashboard/shares/new" className="text-np-cyan no-underline hover:underline">
          New Share
        </Link>{' '}
        to create one.
      </p>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <GlassPanel className="p-5">
      <div className="font-display text-3xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-np-muted mt-1 font-mono uppercase tracking-wider">{label}</div>
    </GlassPanel>
  );
}
