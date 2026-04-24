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
    <div className="animate-enter">
      <div className="mb-5">
        <Link href="/dashboard/shares" className="btn-ghost text-xs">
          ← Back to Shares
        </Link>
      </div>

      <h1 className="font-display uppercase tracking-wide text-2xl text-np-cyan mb-6">
        Share Detail
      </h1>

      <ShareCard share={share} status={status} />
    </div>
  );
}
