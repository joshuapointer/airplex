import type { HTMLAttributes } from 'react';
import { GlassPanel } from './GlassPanel';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Card({ className = '', children, ...props }: CardProps) {
  return (
    <GlassPanel className={`p-6 ${className}`} {...props}>
      {children}
    </GlassPanel>
  );
}
