'use client';

import { useEffect, useRef, useState } from 'react';

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iOS Safari: contains 'iPhone'/'iPad'/'iPod' and 'Safari' but not 'CriOS'/'FxiOS' (Chrome/Firefox on iOS)
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

export function AirplayHint() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isIosSafari()) return;
    // Show the hint briefly after play begins — give the user a moment to find
    // the AirPlay button. Auto-dismiss after 8 seconds so it doesn't linger.
    setVisible(true);
    timerRef.current = setTimeout(() => setDismissed(true), 8000);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="flex justify-center mt-2">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss AirPlay hint"
        className={`airplay-hint${dismissed ? ' dismissed' : ''}`}
      >
        {/* AirPlay icon */}
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="1" y="1" width="12" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4.5 13h5L7 10l-2.5 3Z" fill="currentColor" />
        </svg>
        Tap AirPlay in the video controls to cast to your TV
        {/* Dismiss affordance */}
        <svg
          aria-hidden="true"
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ marginLeft: '0.25rem', opacity: 0.5 }}
        >
          <path
            d="M2 2l6 6M8 2l-6 6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
