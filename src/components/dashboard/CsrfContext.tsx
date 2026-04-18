'use client';

import { createContext, useContext, type ReactNode } from 'react';

const CsrfContext = createContext<string>('');

export function CsrfProvider({ csrf, children }: { csrf: string; children: ReactNode }) {
  return <CsrfContext.Provider value={csrf}>{children}</CsrfContext.Provider>;
}

/**
 * Returns the CSRF token for inclusion in `x-airplex-csrf` headers on every
 * mutating fetch to `/api/admin/*`. Only valid in Client Components.
 */
export function useCsrf(): string {
  return useContext(CsrfContext);
}
