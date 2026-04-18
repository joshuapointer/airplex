import type { HTMLAttributes } from 'react';

export type BadgeStatus = 'active' | 'expired' | 'revoked';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: BadgeStatus;
}

const statusStyles: Record<BadgeStatus, { color: string; label: string }> = {
  active: { color: 'var(--np-green)', label: 'active' },
  expired: { color: 'var(--np-muted)', label: 'expired' },
  revoked: { color: 'var(--np-magenta)', label: 'revoked' },
};

export function Badge({ status, className = '', children, style, ...props }: BadgeProps) {
  const { color, label } = statusStyles[status];
  return (
    <span
      className={`badge ${className}`}
      style={{ color, borderColor: color, ...style }}
      {...props}
    >
      {children ?? label}
    </span>
  );
}
