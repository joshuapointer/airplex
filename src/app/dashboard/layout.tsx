import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/auth/guards';
import { CsrfProvider } from '@/components/dashboard/CsrfContext';
import { CommandPaletteMount } from '@/components/dashboard/CommandPaletteMount';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { EventTail } from '@/components/dashboard/EventTail';
import { isPlexConfigured } from '@/plex/config';
import { pickAmbientShare } from '@/db/queries/shares';
import { AmbientBackdrop } from '@/components/ui/transmission';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // requireAdmin() throws a redirect Response if not authenticated.
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '/dashboard';
  const session = await requireAdmin(pathname);

  // If the admin hasn't linked a Plex account/server yet, force them through
  // the /setup/plex flow before they can use the dashboard.
  if (!isPlexConfigured()) {
    redirect('/setup/plex');
  }

  // Select ambient backdrop source: active share with smallest remaining TTL
  // and a non-null poster_path. Single indexed SQL query.
  const topShare = pickAmbientShare();
  const ambientPosterUrl = topShare ? `/api/admin/shares/${topShare.id}/poster` : null;

  return (
    <CsrfProvider csrf={session.csrf}>
      <CommandPaletteMount csrf={session.csrf} />
      <div
        className="relative min-h-screen"
        style={{ background: 'var(--np-bg)', color: 'var(--np-fg)' }}
      >
        <AmbientBackdrop posterUrl={ambientPosterUrl} kenBurns loading="lazy" opacity={0.12} />
        <DashboardShell pathname={pathname}>{children}</DashboardShell>
      </div>
      <EventTail />
    </CsrfProvider>
  );
}
