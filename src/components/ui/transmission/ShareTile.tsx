import Link from 'next/link';
import type { ShareRow } from '@/types/share';
import { PosterCard } from './PosterCard';
import { TtlHairline } from './TtlHairline';

export interface ShareTileProps {
  share: Pick<
    ShareRow,
    'id' | 'title' | 'recipient_label' | 'created_at' | 'expires_at' | 'poster_path'
  >;
  /** Server-computed liveness — see §D. */
  live: boolean;
  /** Server-rendered TTL label, e.g. "47h". */
  ttlLabel: string;
  /** Server clock (unix seconds). Used by the inline TtlHairline. */
  now: number;
  /** Poster URL. Admin surfaces: `/api/admin/shares/${id}/poster`. */
  posterUrl?: string | null;
}

export function ShareTile({ share, live, ttlLabel, now, posterUrl }: ShareTileProps) {
  const ariaLabel = `Share for ${share.recipient_label}, ${ttlLabel} remaining${live ? ', recently active' : ''}`;

  return (
    <Link
      href={`/dashboard/shares/${share.id}`}
      aria-label={ariaLabel}
      className="share-tile snap-start flex flex-col gap-2 no-underline"
    >
      <PosterCard
        posterUrl={posterUrl}
        title={share.title}
        aspect="3/4"
        width={200}
        height={267}
        loading="lazy"
      />
      <span className="font-mono text-xs text-np-muted truncate">{share.recipient_label}</span>
      <TtlHairline createdAt={share.created_at} expiresAt={share.expires_at} now={now} compact />
      <span className="font-mono text-xs text-np-muted flex items-center gap-1.5">
        {live && <span className="live-dot" aria-hidden="true" />}
        <span>{ttlLabel}</span>
      </span>
    </Link>
  );
}
