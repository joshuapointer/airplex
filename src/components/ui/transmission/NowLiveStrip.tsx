import type { ShareRow } from '@/types/share';
import type { LiveMap } from '@/types/transmission';
import { formatTtlShort } from '@/lib/ttl';
import { ShareTile } from './ShareTile';

export interface NowLiveStripProps {
  /** Already-filtered active shares (status.active === true). */
  shares: ShareRow[];
  /** Map of share.id → liveness flag. */
  liveMap: LiveMap;
  /** Optional empty-state copy. Default: "No live shares. Everyone's quiet." */
  emptyText?: string;
  /** Max tiles to render. Defaults to MAX_VISIBLE_TILES. */
  limit?: number;
}

const MAX_VISIBLE_TILES = 12;

export function NowLiveStrip({
  shares,
  liveMap,
  emptyText = "No live shares. Everyone's quiet.",
  limit = MAX_VISIBLE_TILES,
}: NowLiveStripProps) {
  if (shares.length === 0) {
    return (
      <nav aria-label="Active shares">
        <div className="glass px-4 py-6 text-center">
          <p className="font-mono text-sm text-np-muted">{emptyText}</p>
        </div>
      </nav>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const visible = shares.slice(0, limit);

  return (
    <nav aria-label="Active shares" className="now-live-strip">
      {visible.map((share) => {
        const ttlLabel = formatTtlShort(share.expires_at === null ? null : share.expires_at - now);
        const live = Boolean(liveMap[share.id]);
        const posterUrl = share.poster_path ? `/api/admin/shares/${share.id}/poster` : null;
        return (
          <ShareTile
            key={share.id}
            share={share}
            live={live}
            ttlLabel={ttlLabel}
            now={now}
            posterUrl={posterUrl}
          />
        );
      })}
    </nav>
  );
}
