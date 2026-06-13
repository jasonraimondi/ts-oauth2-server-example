import { generateKeyPairSync } from "node:crypto";

/**
 * Resolve the RSA private key used to sign OIDC tokens (and, in this example,
 * the session cookie). OIDC mandates asymmetric signing so the public half can
 * be published at the JWKS endpoint.
 *
 * Provide a PEM via `OIDC_PRIVATE_KEY` for a stable key across restarts. The
 * value may be stored on a single `.env` line with escaped `\n` newlines. If it
 * is unset we generate an ephemeral key at boot — convenient for local dev, but
 * every restart invalidates previously issued tokens.
 */
export function resolvePrivateKey(): string {
  const fromEnv = process.env.OIDC_PRIVATE_KEY?.trim();
  if (fromEnv) return fromEnv.includes("\\n") ? fromEnv.replace(/\\n/g, "\n") : fromEnv;

  // Fail closed in production: an ephemeral key silently invalidates every issued
  // token on restart and isn't backed by managed key material, so refuse to boot
  // rather than generate one. (Finding #4.)
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "OIDC_PRIVATE_KEY must be set in production (refusing to generate an ephemeral key).",
    );
  }

  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  console.warn(
    "[oidc] OIDC_PRIVATE_KEY not set — generated an ephemeral RSA key; tokens will not survive a restart.",
  );
  return privateKey;
}
