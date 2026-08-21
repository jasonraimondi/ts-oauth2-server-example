import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  // Only the Node entry point and the db scripts need it; the Worker gets its
  // database as a binding instead.
  DATABASE_URL: z.string().min(1).optional(),
  // The BFF compares the discovery document's `issuer` byte-for-byte against its
  // own configured issuer, so a trailing slash breaks discovery rather than being
  // normalized away.
  OIDC_ISSUER: z
    .url()
    .refine(v => !v.endsWith("/"), "must not end with a trailing slash")
    .default("http://localhost:3000"),
  OIDC_PRIVATE_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  // The test suite hashes a password on nearly every request, where cost 12 costs
  // more wall-clock than everything else combined; production floors it back to 12.
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(10),
  TOKEN_RATE_MAX: z.coerce.number().int().positive().default(60),
  // stringbool, not coerce.boolean: Boolean("false") is true, which would silently
  // trust a spoofable X-Forwarded-For header.
  TRUST_PROXY: z.stringbool().default(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error("[config] invalid environment:\n" + z.prettifyError(parsed.error));
}

export const env = parsed.data;

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return env.DATABASE_URL;
}

/**
 * Whether the insecure local-development conveniences are allowed: the hardcoded
 * session secret, an ephemeral OIDC key, cookies without `Secure`.
 *
 * Only an explicit `development` or `test` opts in — an unset or unrecognized
 * NODE_ENV fails closed, because a deployment that forgot to set it would
 * otherwise boot with a publicly-known HS256 secret and forgeable session cookies.
 * Reads process.env on every call so a test can flip NODE_ENV and re-check.
 */
export function isDev(): boolean {
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === "development" || nodeEnv === "test";
}

if (!isDev() && !env.OIDC_ISSUER.startsWith("https://")) {
  throw new Error("OIDC_ISSUER must be an https:// URL outside development.");
}
