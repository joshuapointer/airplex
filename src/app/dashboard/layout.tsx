import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/auth/guards';
import { CsrfProvider } from '@/components/dashboard/CsrfContext';
import { CommandPaletteMount } from '@/components/dashboard/CommandPaletteMount';
import { BrandFlicker } from '@/components/dashboard/BrandFlicker';
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
        <div className="relative flex min-h-screen" style={{ zIndex: 3 }}>
          {/* Sidebar */}
          <aside className="glass w-[220px] flex flex-col gap-2 p-6 border-r border-[rgba(255,255,255,0.08)] rounded-none">
            <div className="font-display uppercase text-xl tracking-[0.08em] text-np-cyan mb-6">
              <BrandFlicker>airplex</BrandFlicker>
            </div>

            <NavLink href="/dashboard" pathname={pathname}>
              Home
            </NavLink>
            <NavLink href="/dashboard/shares" pathname={pathname}>
              Shares
            </NavLink>
            <NavLink href="/dashboard/shares/new" pathname={pathname}>
              New Share
            </NavLink>

            <div className="flex-1" />

            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn-ghost w-full text-xs">
                Sign out
              </button>
            </form>
          </aside>

          {/* Main content */}
          <main
            className="flex-1 p-8 overflow-y-auto"
            style={{ paddingBottom: 'calc(var(--np-tail-row-height) * 5 + 1rem)' }}
          >
            {children}
          </main>
        </div>
      </div>
      <EventTail />
    </CsrfProvider>
  );
}

function NavLink({
  href,
  children,
  pathname,
}: {
  href: string;
  children: ReactNode;
  pathname: string;
}) {
  const isActive = href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);
  return (
    <Link href={href} className="nav-link" aria-current={isActive ? 'page' : undefined}>
      {children}
    </Link>
  );
}
