import type { ReactNode } from 'react';

export interface InlineErrorProps {
  children: ReactNode;
  className?: string;
}

/**
 * Shared inline error paragraph — magenta monospace, role=alert so screen
 * readers announce it without needing aria-live wiring at each call site.
 */
export function InlineError({ children, className = '' }: InlineErrorProps) {
  return (
    <p role="alert" className={`text-np-magenta font-mono text-sm ${className}`}>
      {children}
    </p>
  );
}
