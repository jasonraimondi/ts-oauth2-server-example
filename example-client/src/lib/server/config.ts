import { env } from "$env/dynamic/private";

import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

// The BFF is a confidential OAuth client. The plaintext secret lives ONLY here
// (server-side env); the AS stores only its bcrypt hash. Dev defaults match the
// seeded BFF client so the demo runs with no .env — override in real deployments.
export const config = {
  issuer: env.OIDC_ISSUER ?? "http://localhost:3000",
  clientId: env.OAUTH_CLIENT_ID ?? "b1ff0000-0000-4000-8000-000000000001",
  clientSecret: env.OAUTH_CLIENT_SECRET ?? "bff-dev-secret-change-me",
  redirectUri: env.OAUTH_REDIRECT_URI ?? "http://localhost:5173/auth/callback",
  scope: "openid email contacts.read",
};

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  revocation_endpoint?: string;
};

let cached: { doc: Discovery; jwks: JWTVerifyGetKey } | undefined;

/**
 * OIDC Discovery: fetch the AS metadata once and cache it (with a JWKS resolver
 * that does its own caching + kid rotation). Endpoints come from here, never
 * hardcoded; the issuer in the document must byte-match our configured issuer.
 */
export async function discover(
  fetchImpl: typeof fetch = fetch,
): Promise<{ doc: Discovery; jwks: JWTVerifyGetKey }> {
  if (cached) return cached;
  const res = await fetchImpl(`${config.issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const doc = (await res.json()) as Discovery;
  if (doc.issuer !== config.issuer) {
    throw new Error(`discovery issuer mismatch: ${doc.issuer} !== ${config.issuer}`);
  }
  cached = { doc, jwks: createRemoteJWKSet(new URL(doc.jwks_uri)) };
  return cached;
}

/** The AS revocation endpoint (advertised by discovery, else derived from issuer). */
export function revocationEndpoint(doc: Discovery): string {
  return doc.revocation_endpoint ?? `${config.issuer}/api/oauth2/revoke`;
}

/** The protected contacts resource — our own API, not an OIDC endpoint. */
export const contactsEndpoint = (): string => `${config.issuer}/api/contacts`;
