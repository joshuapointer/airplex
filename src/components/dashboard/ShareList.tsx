'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ShareRow, ShareStatus } from '@/types/share';
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
import { ShareRowCursorProvider, useRowCursor } from './useRowCursor';
import { ShareListKeyboard } from './ShareListKeyboard';
import { RowDrawerActions } from './RowDrawerActions';
import { useCsrf } from './CsrfContext';

const TOTAL_COLS = 7;

function statusOf(row: ShareRow, now: number): ShareStatus {
  const revoked = row.revoked_at !== null;
  const expired = row.expires_at !== null && row.expires_at <= now;
  const exhausted = row.max_plays !== null && row.play_count >= row.max_plays;
  const claimed = row.device_fingerprint_hash !== null;
  const active = !revoked && !expired && !exhausted;
  return { active, expired, revoked, exhausted, claimed };
}

function badgeForRow(row: ShareRow, now: number): { status: BadgeStatus; label: string } {
  const s = statusOf(row, now);
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

  const ids = shares.map((s) => s.id);
  return (
    <ShareRowCursorProvider ids={ids}>
      <ShareListInner shares={shares} />
    </ShareRowCursorProvider>
  );
}

function ShareListInner({ shares }: ShareListProps) {
  const router = useRouter();
  const csrf = useCsrf();
  const { focusedId, setFocused } = useRowCursor();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleDrawer = (id: string) => {
    setExpandedId((curr) => (curr === id ? null : id));
  };

  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <ShareListKeyboard onToggleDrawer={toggleDrawer} />
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader style={{ width: '48px', padding: '0.25rem 0.5rem' }}></TableHeader>
            <TableHeader>Recipient</TableHeader>
            <TableHeader>Title</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader className="hidden md:table-cell">Expires</TableHeader>
            <TableHeader className="hidden sm:table-cell">Plays</TableHeader>
            <TableHeader>Actions</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {shares.map((row) => {
            const { status, label } = badgeForRow(row, now);
            const isFocused = focusedId === row.id;
            const isOpen = expandedId === row.id;
            return (
              <Fragment key={row.id}>
                <TableRow
                  onClick={(e: React.MouseEvent<HTMLTableRowElement>) => {
                    if ((e.target as HTMLElement).closest('a')) return;
                    setFocused(row.id);
                    toggleDrawer(row.id);
                  }}
                  className={isFocused ? 'row-cursor' : undefined}
                  data-cursor={isFocused ? 'true' : undefined}
                  aria-current={isFocused ? 'true' : undefined}
                  aria-expanded={isOpen}
                >
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
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-col gap-1">
                      <span>{row.expires_at === null ? 'Never' : formatDate(row.expires_at)}</span>
                      <TtlHairline
                        createdAt={row.created_at}
                        expiresAt={row.expires_at}
                        now={now}
                        compact
                      />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell whitespace-nowrap">
                    {row.play_count}
                    {row.max_plays !== null ? ` / ${row.max_plays}` : ''}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={`/dashboard/shares/${row.id}`}
                      className="text-np-cyan no-underline text-xs hover:underline"
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
                <tr className="row-drawer-tr" role="region" aria-label="Share actions">
                  <td colSpan={TOTAL_COLS}>
                    <div className="row-drawer" data-open={isOpen ? 'true' : undefined}>
                      <div className="row-drawer-inner">
                        {isOpen && (
                          <div>
                            <RowDrawerActions
                              share={row}
                              csrf={csrf}
                              onRefresh={() => router.refresh()}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
