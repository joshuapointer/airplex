import Link from 'next/link';
import type { ShareRow } from '@/types/share';
import { computeShareStatus } from '@/db/queries/shares';

function statusLabel(row: ShareRow): { text: string; color: string } {
  const s = computeShareStatus(row);
  if (s.revoked) return { text: 'Revoked', color: 'var(--np-magenta)' };
  if (s.expired) return { text: 'Expired', color: 'var(--np-muted)' };
  if (s.exhausted) return { text: 'Exhausted', color: 'var(--np-muted)' };
  return { text: 'Active', color: 'var(--np-green)' };
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
      <p style={{ color: 'var(--np-muted)', fontSize: '0.9rem' }}>
        No shares yet.{' '}
        <Link
          href="/dashboard/shares/new"
          style={{ color: 'var(--np-cyan)', textDecoration: 'none' }}
        >
          Create one.
        </Link>
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.85rem',
          fontFamily: 'var(--np-font-body)',
        }}
      >
        <thead>
          <tr
            style={{
              borderBottom: '1px solid var(--np-muted)',
              color: 'var(--np-muted)',
              textAlign: 'left',
            }}
          >
            <Th>Recipient</Th>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th>Expires</Th>
            <Th>Plays</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody>
          {shares.map((row) => {
            const { text, color } = statusLabel(row);
            return (
              <tr
                key={row.id}
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Td>{row.recipient_label}</Td>
                <Td>{row.title}</Td>
                <Td>
                  <span
                    style={{
                      color,
                      fontWeight: 600,
                      fontSize: '0.8rem',
                    }}
                  >
                    {text}
                  </span>
                </Td>
                <Td>{formatDate(row.expires_at)}</Td>
                <Td>
                  {row.play_count}
                  {row.max_plays !== null ? ` / ${row.max_plays}` : ''}
                </Td>
                <Td>
                  <Link
                    href={`/dashboard/shares/${row.id}`}
                    style={{
                      color: 'var(--np-cyan)',
                      textDecoration: 'none',
                      fontSize: '0.8rem',
                    }}
                  >
                    View
                  </Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        padding: '0.5rem 0.75rem',
        fontWeight: 600,
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: '0.6rem 0.75rem',
        color: 'var(--np-fg)',
        whiteSpace: 'nowrap',
        maxWidth: '200px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {children}
    </td>
  );
}
