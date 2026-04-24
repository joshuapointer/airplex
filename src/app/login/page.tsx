import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/session';

/**
 * Login landing page. Server component.
 *
 * - If the admin session already has a `sub`, bounce directly to /dashboard.
 * - Otherwise render a single "Sign in with SSO" CTA that hands off to
 *   `/api/auth/login`, preserving the caller's `returnTo` query param.
 */
interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

function normalizeReturnTo(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  return '/dashboard';
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAdminSession();
  if (session.sub) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const returnTo = normalizeReturnTo(params.returnTo);
  const loginHref = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-np-bg text-np-fg">
      <div className="glass w-full max-w-md p-10 flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1
            className="font-display uppercase text-3xl tracking-wide"
            style={{ color: 'var(--np-cyan)' }}
          >
            airPointer
          </h1>
          <p className="text-xs font-mono uppercase tracking-widest text-np-muted -mt-1">
            built by joshPointer
          </p>
          <p className="text-sm text-np-muted">
            Sign in with your identity provider to manage share links.
          </p>
        </header>

        <a
          href={loginHref}
          className="btn-primary w-full"
          style={{
            background: 'var(--np-cyan)',
            borderColor: 'var(--np-cyan)',
          }}
        >
          Sign in with SSO
        </a>
      </div>
    </main>
  );
}
