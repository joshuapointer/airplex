'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';

import { BrandFlicker } from './BrandFlicker';

interface NavItem {
  href: string;
  label: string;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Home' },
  { href: '/dashboard/shares', label: 'Shares' },
  { href: '/dashboard/shares/new', label: 'New Share' },
];

function isNavActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(href);
}

export function DashboardShell({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}): React.ReactElement {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open (mobile only — drawer is md:hidden).
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <div className="relative flex min-h-screen flex-col md:flex-row" style={{ zIndex: 3 }}>
      {/* Mobile topbar (visible <md only) */}
      <header className="md:hidden glass flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.08)] rounded-none sticky top-0 z-20">
        <div className="font-display uppercase text-lg tracking-[0.08em] text-np-cyan">
          <BrandFlicker>airPointer</BrandFlicker>
        </div>
        <button
          type="button"
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          aria-controls="admin-drawer"
          onClick={() => setDrawerOpen((v) => !v)}
          className="btn-ghost"
          style={{ minHeight: 44, minWidth: 44, padding: '0 0.75rem' }}
        >
          {drawerOpen ? (
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M4 4L16 16M16 4L4 16"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="square"
              />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.75" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile backdrop */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          style={{ border: 0 }}
        />
      )}

      {/* Sidebar — fixed drawer on mobile, static on md+ */}
      <aside
        id="admin-drawer"
        className={[
          'glass flex flex-col gap-2 p-6 border-r border-[rgba(255,255,255,0.08)] rounded-none',
          // mobile: fixed drawer slides from left
          'fixed inset-y-0 left-0 w-[260px] z-40 transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
          // md+: static sidebar
          'md:static md:translate-x-0 md:w-[220px] md:z-auto',
        ].join(' ')}
        aria-hidden={!drawerOpen ? undefined : false}
      >
        <div className="font-display uppercase text-xl tracking-[0.08em] text-np-cyan mb-6 hidden md:block">
          <BrandFlicker>airPointer</BrandFlicker>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isNavActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <form action="/api/auth/logout" method="post">
          <button type="submit" className="btn-ghost w-full text-xs">
            Sign out
          </button>
        </form>
      </aside>

      {/* Main content */}
      <main
        className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto"
        style={{ paddingBottom: 'calc(var(--np-tail-row-height) * 5 + 1rem)' }}
      >
        {children}
      </main>
    </div>
  );
}
