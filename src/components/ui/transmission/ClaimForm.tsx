'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Spinner } from '@/components/ui/Spinner';
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
      <ClaimFormSubmit ariaLabel={ariaLabel} formAction={action}>
        {children}
      </ClaimFormSubmit>
    </form>
  );
}

/**
 * Inner submit component. Isolated so `useFormStatus` reads the enclosing
 * form's pending state. Disables the button + swaps the label for a spinner
 * while the server action is in-flight.
 */
function ClaimFormSubmit({
  ariaLabel,
  formAction,
  children,
}: {
  ariaLabel: string;
  formAction: (formData: FormData) => void | Promise<void>;
  children?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <PlayButton formAction={formAction} aria-label={ariaLabel} disabled={pending}>
        {pending ? (
          <>
            <Spinner variant="dots" />
            <span>Claiming…</span>
          </>
        ) : (
          children
        )}
      </PlayButton>
      <span className="sr-only" aria-live="polite">
        {pending ? 'Claiming link…' : ''}
      </span>
    </>
  );
}
