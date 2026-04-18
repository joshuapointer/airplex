import Link from 'next/link';
import { listShares } from '@/db/queries/shares';
import { ShareList } from '@/components/dashboard/ShareList';

export default async function SharesPage() {
  // Layout already enforced auth gate. Fetch directly.
  const shares = listShares();

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--np-font-display)',
            color: 'var(--np-cyan)',
            fontSize: '1.5rem',
            fontWeight: 700,
          }}
        >
          Shares
        </h1>
        <Link
          href="/dashboard/shares/new"
          style={{
            padding: '0.45rem 1rem',
            background: 'var(--np-cyan)',
            color: 'var(--np-bg)',
            borderRadius: 'var(--np-radius-sharp)',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '0.85rem',
          }}
        >
          + New Share
        </Link>
      </div>

      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--np-muted)',
          borderRadius: 'var(--np-radius-soft)',
          padding: '1rem',
          backdropFilter: 'blur(8px)',
        }}
      >
        <ShareList shares={shares} />
      </div>
    </div>
  );
}
