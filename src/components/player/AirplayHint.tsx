'use client';

import { useEffect, useState } from 'react';

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iOS Safari: contains 'iPhone'/'iPad'/'iPod' and 'Safari' but not 'CriOS'/'FxiOS' (Chrome/Firefox on iOS)
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

export function AirplayHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isIosSafari());
  }, []);

  if (!show) return null;

  return (
    <p className="text-center text-xs font-mono mt-2" style={{ color: 'var(--np-muted)' }}>
      Tap the AirPlay button to cast to your TV.
    </p>
  );
}
