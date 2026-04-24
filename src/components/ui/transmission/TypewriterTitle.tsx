'use client';

import { createElement, useEffect, useState } from 'react';
import type { JSX } from 'react';

export interface TypewriterTitleProps {
  /** Full string. */
  text: string;
  /** Hard cap — if > maxChars, truncate to maxChars-1 + '…' before animating. Default 40. */
  maxChars?: number;
  /** ms per char. Default 18. */
  charMs?: number;
  /** Render the result wrapped in this element. Default 'h1'. */
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

export function TypewriterTitle({
  text,
  maxChars = 40,
  charMs = 18,
  as = 'h1',
  className,
}: TypewriterTitleProps) {
  const full = text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
  const [visible, setVisible] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      setVisible(full);
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setVisible(full);
      return;
    }
    setVisible('');
    let i = 0;
    const id = window.setInterval(
      () => {
        i += 1;
        if (i >= full.length) {
          setVisible(full);
          window.clearInterval(id);
        } else {
          setVisible(full.slice(0, i));
        }
      },
      Math.max(1, charMs),
    );
    return () => {
      window.clearInterval(id);
    };
  }, [full, charMs]);

  return createElement(
    as,
    { className },
    <>
      <span className="sr-only">{full}</span>
      <span className="typewriter" aria-hidden="true">
        {visible}
      </span>
    </>,
  );
}
