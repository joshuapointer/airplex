import type { HTMLAttributes } from 'react';

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Thin marker over the `.glass` CSS utility. The glass blur/saturation and
 * color tokens live in globals.css — see `:root` and `.glass` for the
 * single source of truth.
 */
export function GlassPanel({ className = '', children, ...props }: GlassPanelProps) {
  return (
    <div className={`glass ${className}`} {...props}>
      {children}
    </div>
  );
}
