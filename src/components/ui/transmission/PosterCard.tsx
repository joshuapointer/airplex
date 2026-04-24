import { PosterFallback } from './PosterFallback';

export interface PosterCardProps {
  posterUrl?: string | null;
  /** Used to derive the fallback initial (first char of title, uppercased). */
  title: string;
  /** Applied to the wrapping figure. */
  className?: string;
  /** Explicit aspect. Default '3/4'. */
  aspect?: '3/4' | '2/3' | '16/9';
  /** Passed to <img>. Default 'eager' for hero surfaces. */
  loading?: 'eager' | 'lazy';
  /** Pixel-perfect width/height for <img>. Default 120 × 180 — caller overrides. */
  width?: number;
  height?: number;
}

export function PosterCard({
  posterUrl,
  title,
  className,
  aspect = '3/4',
  loading = 'eager',
  width = 120,
  height = 180,
}: PosterCardProps) {
  const aspectRatio = aspect.replace('/', ' / ');
  const classes = className ? `poster-card ${className}` : 'poster-card';

  if (!posterUrl) {
    return (
      <figure className={classes} style={{ aspectRatio }}>
        <PosterFallback title={title} aspect={aspect} />
      </figure>
    );
  }

  return (
    <figure className={classes} style={{ aspectRatio }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterUrl}
        alt=""
        loading={loading}
        width={width}
        height={height}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </figure>
  );
}
