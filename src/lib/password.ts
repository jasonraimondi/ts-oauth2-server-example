import bcrypt from "bcrypt";

import { env, isDev } from "./config.js";

// Raising the cost is always allowed; lowering it is a local-only convenience, so
// outside development the configured value can only move the tax up, never down.
const MINIMUM_COST = 12;
export const BCRYPT_COST = isDev() ? env.BCRYPT_COST : Math.max(env.BCRYPT_COST, MINIMUM_COST);

// A value no login form can submit as a valid credential, hashed once at import
// so verifyDummyPassword() below costs exactly one real bcrypt comparison.
const DUMMY_PASSWORD = "a-password-that-is-never-valid";
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(DUMMY_PASSWORD, BCRYPT_COST);

export class InvalidAuthorizationError extends Error {
  override name = "InvalidAuthorizationError";
}

export async function setPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return await bcrypt.compare(password, passwordHash);
}

/**
 * @throws {InvalidAuthorizationError}
 */
export async function verifyPasswordOrThrow(password: string, passwordHash: string): Promise<void> {
  const success = await verifyPassword(password, passwordHash);
  if (!success) throw new InvalidAuthorizationError("invalid password");
}

/**
 * Spend one bcrypt comparison against a hash nothing matches. Call it on the
 * login paths that have no stored hash to compare against — unknown email, or a
 * user with no password — so their response time is indistinguishable from a
 * wrong password and cannot be used to enumerate accounts.
 */
export async function verifyDummyPassword(): Promise<void> {
  await bcrypt.compare(DUMMY_PASSWORD, DUMMY_PASSWORD_HASH);
}
