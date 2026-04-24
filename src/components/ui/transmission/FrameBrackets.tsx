import type { CSSProperties } from 'react';

export interface FrameBracketsProps {
  /** Ignore animation; render brackets statically. Used for reduced-motion + for
   *  post-claim persistence where the corners shouldn't re-animate. */
  animated?: boolean;
  /** Accent color override. Default 'currentColor'. */
  color?: string;
  /** Stroke width override. Default var(--np-bracket-thickness). */
  thickness?: number;
  /** ARIA role. Default 'presentation'. */
  role?: 'presentation' | 'img';
}

// Corner positions; animation staggers via :nth-child in globals.css.
const cornerStyles: CSSProperties[] = [
  { position: 'absolute', top: 0, left: 0 },
  { position: 'absolute', top: 0, right: 0, transform: 'scaleX(-1)' },
  { position: 'absolute', bottom: 0, left: 0, transform: 'scaleY(-1)' },
  { position: 'absolute', bottom: 0, right: 0, transform: 'scale(-1, -1)' },
];

export function FrameBrackets({
  animated = true,
  color = 'currentColor',
  thickness = 1,
  role = 'presentation',
}: FrameBracketsProps) {
  const pathStyle: CSSProperties | undefined = animated
    ? undefined
    : { animation: 'none', strokeDashoffset: 0, opacity: 1 };

  return (
    <div
      className="frame-brackets"
      role={role}
      aria-hidden={role === 'presentation' ? true : undefined}
    >
      {cornerStyles.map((style, idx) => (
        <svg key={idx} width="24" height="24" viewBox="0 0 24 24" style={style} aria-hidden="true">
          <path
            d="M 0 24 L 0 0 L 24 0"
            stroke={color}
            strokeWidth={thickness}
            fill="none"
            pathLength="100"
            strokeDasharray="100"
            style={pathStyle}
          />
        </svg>
      ))}
    </div>
  );
}
