import { z } from 'zod';

/**
 * Decode a secret string (hex or base64/base64url) and validate that it
 * resolves to at least `minBytes` bytes. Returns the decoded Buffer on
 * success; throws a zod issue on failure via the caller's `refine`.
 */
function decodeSecret(value: string): Buffer | null {
  const hex = value.trim();
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    try {
      return Buffer.from(hex, 'hex');
    } catch {
      /* fall through */
    }
  }
  // base64 / base64url
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const buf = Buffer.from(padded, 'base64');
    if (buf.length > 0) return buf;
  } catch {
    /* ignore */
  }
  return null;
}

const secret32 = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .min(1, `${name} is required`)
    .refine(
      (v) => {
        const decoded = decodeSecret(v);
        return decoded !== null && decoded.length >= 32;
      },
      { message: `${name} must decode (hex or base64) to at least 32 bytes` },
    );

const boolString = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    APP_URL: z
      .string()
      .url('APP_URL must be a valid URL')
      .transform((v) => v.replace(/\/$/, '')),
    DATABASE_URL: z
      .string()
      .regex(/^file:/, 'DATABASE_URL must be a file: URI (SQLite only for MVP)'),

    PLEX_BASE_URL: z
      .string()
      .url('PLEX_BASE_URL must be a valid URL')
      .transform((v) => v.replace(/\/$/, '')),
    PLEX_TOKEN: z.string().min(1, 'PLEX_TOKEN is required'),
    PLEX_CLIENT_IDENTIFIER: z.string().min(1, 'PLEX_CLIENT_IDENTIFIER is required'),

    SESSION_SECRET: secret32('SESSION_SECRET'),
    DEVICE_LOCK_SECRET: secret32('DEVICE_LOCK_SECRET'),
    SHARE_TOKEN_SECRET: secret32('SHARE_TOKEN_SECRET'),

    OIDC_ISSUER_URL: z.string().url('OIDC_ISSUER_URL must be a valid URL'),
    OIDC_CLIENT_ID: z.string().min(1, 'OIDC_CLIENT_ID is required'),
    OIDC_CLIENT_SECRET: z.string().min(1, 'OIDC_CLIENT_SECRET is required'),
    OIDC_ADMIN_GROUPS: z
      .string()
      .optional()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      ),
    OIDC_REDIRECT_URI: z.string().url().optional(),
    OIDC_GROUPS_CLAIM: z.string().optional().default('groups'),

    SHARE_DEFAULT_TTL_HOURS: z.coerce.number().int().positive().optional().default(48),
    SHARE_MAX_TTL_HOURS: z.coerce.number().int().positive().optional().default(168),

    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .optional()
      .default('info'),
    TRUST_PROXY: boolString.optional().default('false'),
  })
  .superRefine((data, ctx) => {
    const appUrl = data.APP_URL;
    const redirect = data.OIDC_REDIRECT_URI ?? `${appUrl}/api/auth/callback`;
    if (!redirect.startsWith(appUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OIDC_REDIRECT_URI'],
        message: `OIDC_REDIRECT_URI (${redirect}) must start with APP_URL (${appUrl})`,
      });
    }
  })
  .transform((data) => ({
    ...data,
    OIDC_REDIRECT_URI: data.OIDC_REDIRECT_URI ?? `${data.APP_URL}/api/auth/callback`,
  }));

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

// Singleton. Loads once at first import; throws if invalid.
export const env: Env = loadEnv();

/**
 * Package version from npm at launch time. Exposed here so that the rest of
 * the codebase never reads `process.env.*` directly (see plan §F regression
 * check).
 */
export const PACKAGE_VERSION: string = process.env.npm_package_version ?? '0.0.0';
