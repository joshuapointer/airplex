import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/session';

/**
 * Login landing page. Server component.
 *
 * - If the admin session already has a `sub`, bounce directly to /dashboard.
 * - Otherwise render a single "Sign in with SSO" CTA that hands off to
 *   `/api/auth/login`, preserving the caller's `returnTo` query param.
 * - If an `error` search param is present (set by the OIDC callback on failure),
 *   display a user-friendly error message above the CTA.
 */
interface LoginPageProps {
  searchParams: Promise<{ returnTo?: string | string[]; error?: string | string[] }>;
}

function normalizeReturnTo(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
    return value;
  }
  return '/dashboard';
}

function normalizeError(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

const ERROR_MESSAGES: Record<string, string> = {
  oidc_state_missing: 'Sign-in session expired or was invalid. Please try again.',
  oidc_callback_failed: 'Sign-in failed. Please try again.',
};

function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.';
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getAdminSession();
  if (session.sub) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const returnTo = normalizeReturnTo(params.returnTo);
  const errorCode = normalizeError(params.error);
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

        {errorCode ? (
          <div
            className="flex items-start gap-3 p-4 rounded-sharp"
            style={{
              background: 'rgba(255, 42, 112, 0.08)',
              border: '1px solid var(--np-magenta)',
            }}
            role="alert"
            aria-live="assertive"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0 mt-0.5"
              style={{ color: 'var(--np-magenta)' }}
            >
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M8 4.5v4M8 10.5v.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <p className="font-mono text-sm" style={{ color: 'var(--np-magenta)' }}>
              {getErrorMessage(errorCode)}
            </p>
          </div>
        ) : null}

        <a href={loginHref} className="btn-primary w-full">
          Sign in with SSO
        </a>
      </div>
    </main>
  );
}
