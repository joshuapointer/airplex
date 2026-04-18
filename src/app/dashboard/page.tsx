import Link from 'next/link';
import { listShares, computeShareStatus } from '@/db/queries/shares';

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
      <h1
        style={{
          fontFamily: 'var(--np-font-display)',
          color: 'var(--np-cyan)',
          fontSize: '1.5rem',
          marginBottom: '1.5rem',
          fontWeight: 700,
        }}
      >
        Dashboard
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <StatCard label="Total" value={total} color="var(--np-fg)" />
        <StatCard label="Active" value={active} color="var(--np-green)" />
        <StatCard label="Expired" value={expired} color="var(--np-muted)" />
        <StatCard label="Revoked" value={revoked} color="var(--np-magenta)" />
      </div>

      <p style={{ color: 'var(--np-muted)', fontSize: '0.85rem' }}>
        Use{' '}
        <Link href="/dashboard/shares" style={{ color: 'var(--np-cyan)', textDecoration: 'none' }}>
          Shares
        </Link>{' '}
        to manage existing links or{' '}
        <Link
          href="/dashboard/shares/new"
          style={{ color: 'var(--np-cyan)', textDecoration: 'none' }}
        >
          New Share
        </Link>{' '}
        to create one.
      </p>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--np-muted)',
        borderRadius: 'var(--np-radius-soft)',
        padding: '1.25rem 1rem',
      }}
    >
      <div
        style={{
          fontSize: '2rem',
          fontWeight: 700,
          fontFamily: 'var(--np-font-display)',
          color,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--np-muted)', marginTop: '0.25rem' }}>
        {label}
      </div>
    </div>
  );
}
