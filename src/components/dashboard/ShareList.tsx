import Link from 'next/link';
import type { ShareRow } from '@/types/share';
import { computeShareStatus } from '@/db/queries/shares';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui/Table';
import { Badge, type BadgeStatus } from '@/components/ui/Badge';
import { PosterCard, TtlHairline } from '@/components/ui/transmission';

function badgeForRow(row: ShareRow): { status: BadgeStatus; label: string } {
  const s = computeShareStatus(row);
  if (s.revoked) return { status: 'revoked', label: 'Revoked' };
  if (s.expired) return { status: 'expired', label: 'Expired' };
  if (s.exhausted) return { status: 'expired', label: 'Exhausted' };
  return { status: 'active', label: 'Active' };
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ShareListProps {
  shares: ShareRow[];
}

export function ShareList({ shares }: ShareListProps) {
  if (shares.length === 0) {
    return (
      <p className="text-sm text-np-muted font-mono px-2 py-1">
        No shares yet.{' '}
        <Link href="/dashboard/shares/new" className="text-np-cyan no-underline hover:underline">
          Create one.
        </Link>
      </p>
    );
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader style={{ width: '48px', padding: '0.25rem 0.5rem' }}></TableHeader>
          <TableHeader>Recipient</TableHeader>
          <TableHeader>Title</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Expires</TableHeader>
          <TableHeader>Plays</TableHeader>
          <TableHeader>Actions</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {shares.map((row) => {
          const { status, label } = badgeForRow(row);
          return (
            <TableRow key={row.id}>
              <TableCell style={{ width: '48px', padding: '0.25rem 0.5rem' }}>
                <PosterCard
                  posterUrl={row.poster_path ? `/api/admin/shares/${row.id}/poster` : null}
                  title={row.title}
                  aspect="3/4"
                  width={40}
                  height={60}
                  loading="lazy"
                />
              </TableCell>
              <TableCell className="max-w-[200px] truncate whitespace-nowrap">
                {row.recipient_label}
              </TableCell>
              <TableCell className="max-w-[200px] truncate whitespace-nowrap">
                {row.title}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Badge status={status}>{label}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span>{formatDate(row.expires_at)}</span>
                  <TtlHairline
                    createdAt={row.created_at}
                    expiresAt={row.expires_at}
                    now={now}
                    compact
                  />
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {row.play_count}
                {row.max_plays !== null ? ` / ${row.max_plays}` : ''}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Link
                  href={`/dashboard/shares/${row.id}`}
                  className="text-np-cyan no-underline text-xs hover:underline"
                >
                  View
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
