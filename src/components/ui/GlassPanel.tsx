import type { HTMLAttributes } from 'react';

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function GlassPanel({ className = '', children, style, ...props }: GlassPanelProps) {
  return (
    <div
      className={`rounded-soft border ${className}`}
      style={{
        background: 'var(--np-glass-bg, rgba(15, 15, 15, 0.75))',
        borderColor: 'var(--np-glass-border-color, rgba(255, 255, 255, 0.12))',
        backdropFilter: 'blur(60px) saturate(210%)',
        WebkitBackdropFilter: 'blur(60px) saturate(210%)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
