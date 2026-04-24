import Link from 'next/link';
import { listShares } from '@/db/queries/shares';
import { ShareList } from '@/components/dashboard/ShareList';
import { GlassPanel } from '@/components/ui/GlassPanel';

export default async function SharesPage() {
  // Layout already enforced auth gate. Fetch directly.
  const shares = listShares();

  return (
    <div className="animate-enter">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display uppercase tracking-wide text-2xl text-np-cyan">Shares</h1>
        <Link href="/dashboard/shares/new" className="btn-primary text-sm">
          + New Share
        </Link>
      </div>

      <GlassPanel className="p-4">
        <ShareList shares={shares} />
      </GlassPanel>
    </div>
  );
}
