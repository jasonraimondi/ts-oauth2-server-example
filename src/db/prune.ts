import { pathToFileURL } from "node:url";
import { and, isNull, lt, or } from "drizzle-orm";

import { createDb, type Database } from "./index.js";
import { oauthAuthCodes, oauthTokens } from "./schema.js";
import { env } from "../lib/config.js";

// Revocation here is force-expiry, so reuse detection (RFC 9700) reads dead rows
// to recognise a replayed token and kill its family. Deleting a row the instant
// it expires would blind that check; keep the corpses around for a day first.
const GRACE_MS = 24 * 60 * 60 * 1000;

export type PruneCounts = { tokens: number; authCodes: number };

/**
 * Deletes expired authorization codes and tokens whose access *and* refresh
 * windows both closed more than 24 hours ago. The scope join tables cascade.
 *
 * @param database - connection to prune; defaults to the app's pool
 * @param now - the reference time, injectable for tests
 * @returns how many rows each table lost
 */
export async function prune(database: Database, now = new Date()): Promise<PruneCounts> {
  const cutoff = new Date(now.getTime() - GRACE_MS);

  const tokens = await database
    .delete(oauthTokens)
    .where(
      and(
        lt(oauthTokens.accessTokenExpiresAt, cutoff),
        or(
          isNull(oauthTokens.refreshTokenExpiresAt),
          lt(oauthTokens.refreshTokenExpiresAt, cutoff),
        ),
      ),
    )
    .returning({ accessToken: oauthTokens.accessToken });

  const authCodes = await database
    .delete(oauthAuthCodes)
    .where(lt(oauthAuthCodes.expiresAt, cutoff))
    .returning({ code: oauthAuthCodes.code });

  return { tokens: tokens.length, authCodes: authCodes.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  const { db, close } = createDb(env.DATABASE_URL);
  const counts = await prune(db);
  console.log(JSON.stringify({ msg: "pruned expired oauth rows", ...counts }));
  await close();
}
