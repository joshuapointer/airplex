'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRowCursor } from './useRowCursor';

const CommandPalette = dynamic(() => import('./CommandPalette').then((m) => m.CommandPalette), {
  ssr: false,
});

export function CommandPaletteMount({ csrf }: { csrf: string }) {
  const [open, setOpen] = useState(false);
  const { focusedId } = useRowCursor();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac =
        typeof navigator !== 'undefined' &&
        (navigator.platform.includes('Mac') || /Mac/i.test(navigator.userAgent));
      const isModifier = isMac ? e.metaKey : e.ctrlKey;
      if (isModifier && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!open) return null;

  return (
    <CommandPalette open={open} onOpenChange={setOpen} focusedShareId={focusedId} csrf={csrf} />
  );
}
