import bcrypt from "bcryptjs";

export class InvalidAuthorizationError extends Error {}

export async function setPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

/**
 * @throws {InvalidAuthorizationError}
 */
export async function verifyPasswordOrThrow(password: string, passwordHash: string): Promise<void> {
  const success = await bcrypt.compare(password, passwordHash);
  if (!success) throw new InvalidAuthorizationError("invalid password");
}
