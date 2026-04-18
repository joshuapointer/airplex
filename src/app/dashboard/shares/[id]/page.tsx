import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getShareById, computeShareStatus } from '@/db/queries/shares';
import { ShareCard } from '@/components/dashboard/ShareCard';

interface ShareDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ShareDetailPage({ params }: ShareDetailPageProps) {
  const { id } = await params;

  const row = getShareById(id);
  if (!row) {
    notFound();
  }

  // Strip token_hash before passing to client component.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { token_hash, ...share } = row;
  const status = computeShareStatus(row);

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <Link
          href="/dashboard/shares"
          style={{
            color: 'var(--np-muted)',
            textDecoration: 'none',
            fontSize: '0.85rem',
          }}
        >
          ← Back to Shares
        </Link>
      </div>

      <h1
        style={{
          fontFamily: 'var(--np-font-display)',
          color: 'var(--np-cyan)',
          fontSize: '1.5rem',
          fontWeight: 700,
          marginBottom: '1.5rem',
        }}
      >
        Share Detail
      </h1>

      <ShareCard share={share} status={status} />
    </div>
  );
}
