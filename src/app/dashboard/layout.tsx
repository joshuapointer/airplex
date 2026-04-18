import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/auth/guards';
import { CsrfProvider } from '@/components/dashboard/CsrfContext';
import { isPlexConfigured } from '@/plex/config';

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

  return (
    <CsrfProvider csrf={session.csrf}>
      <div
        className="flex min-h-screen"
        style={{ background: 'var(--np-bg)', color: 'var(--np-fg)' }}
      >
        {/* Sidebar */}
        <aside
          style={{
            width: '220px',
            borderRight: '1px solid var(--np-muted)',
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(8px)',
            padding: '1.5rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--np-font-display)',
              color: 'var(--np-cyan)',
              fontSize: '1.2rem',
              fontWeight: 700,
              marginBottom: '1.5rem',
              letterSpacing: '0.08em',
            }}
          >
            airplex
          </div>

          <NavLink href="/dashboard">Home</NavLink>
          <NavLink href="/dashboard/shares">Shares</NavLink>
          <NavLink href="/dashboard/shares/new">New Share</NavLink>

          <div style={{ flex: 1 }} />

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '0.4rem 0.75rem',
                background: 'transparent',
                border: '1px solid var(--np-muted)',
                borderRadius: 'var(--np-radius-sharp)',
                color: 'var(--np-muted)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </form>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>{children}</main>
      </div>
    </CsrfProvider>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        padding: '0.4rem 0.75rem',
        borderRadius: 'var(--np-radius-sharp)',
        color: 'var(--np-fg)',
        textDecoration: 'none',
        fontSize: '0.9rem',
        transition: 'background 0.15s, color 0.15s',
      }}
      className="hover:bg-white/5 hover:text-np-cyan"
    >
      {children}
    </Link>
  );
}
