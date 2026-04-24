export interface PosterFallbackProps {
  title: string;
  className?: string;
  aspect?: '3/4' | '2/3' | '16/9';
}

export function PosterFallback({ title, className, aspect = '3/4' }: PosterFallbackProps) {
  const initial = title.trim().charAt(0).toUpperCase() || '·';
  const classes = ['poster-fallback'];
  if (className) classes.push(className);
  return (
    <div
      className={classes.join(' ')}
      aria-hidden="true"
      style={{ aspectRatio: aspect.replace('/', ' / ') }}
    >
      {initial}
    </div>
  );
}
