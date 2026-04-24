'use client';

import type { ReactNode } from 'react';
import { playCueAudio } from './playCueAudio';

export interface PlayButtonProps {
  children?: ReactNode;
  /** When provided, the button is a submit button inside this <form action>. */
  formAction?: (formData: FormData) => void | Promise<void>;
  /** Alternatively, an onClick handler for non-form usage. */
  onClick?: () => void;
  'aria-label'?: string;
  className?: string;
  /** If true, plays the audio cue + triggers haptic on press. Default true. */
  feedback?: boolean;
}

const PlayIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M3 2.5L13 8L3 13.5V2.5Z" />
  </svg>
);

export function PlayButton({
  children,
  formAction,
  onClick,
  'aria-label': ariaLabel,
  className,
  feedback = true,
}: PlayButtonProps) {
  const handleClick = () => {
    if (feedback !== false) {
      playCueAudio();
      if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
    }
    onClick?.();
  };

  const classes = ['btn-play', 'btn-machined', 'w-full', 'sm:w-auto'];
  if (className) classes.push(className);

  return (
    <button
      type={formAction ? 'submit' : 'button'}
      formAction={formAction}
      onClick={handleClick}
      aria-label={ariaLabel}
      className={classes.join(' ')}
    >
      {children ?? (
        <>
          <PlayIcon />
          <span>Start streaming</span>
        </>
      )}
    </button>
  );
}
