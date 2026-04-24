'use client';

import type { ReactNode } from 'react';
import { PlayButton } from './PlayButton';
import { armCurtainOnSubmit } from './CurtainTransition';

export interface ClaimFormProps {
  action: (formData: FormData) => void | Promise<void>;
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Client-side claim form wrapper. Owns the onSubmit handler so the
 * server-component share page can still pass a server action via `action`
 * while the curtain transition fires before navigation.
 */
export function ClaimForm({ action, ariaLabel, children, className }: ClaimFormProps) {
  return (
    <form action={action} onSubmit={armCurtainOnSubmit} className={className}>
      <PlayButton formAction={action} aria-label={ariaLabel}>
        {children}
      </PlayButton>
    </form>
  );
}
