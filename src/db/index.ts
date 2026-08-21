import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import * as schema from "./schema.js";

// casing: "snake_case" derives DB column names from the schema's camelCase keys;
// must match the same option in drizzle.config.ts so runtime queries and the
// generated migrations agree on column names.
export const drizzleOptions = { schema, casing: "snake_case" } as const;

export function createDb(databaseUrl: string) {
  const client = createClient({ url: databaseUrl });
  const db = drizzle(client, drizzleOptions);
  const close = async (): Promise<void> => client.close();
  return { db, close };
}

// The surface the repositories need, satisfied by both the libsql driver (Node,
// tests) and the D1 driver (Cloudflare Worker). batch() is declared per driver
// rather than on the base class, so it is picked up from libsql's signature,
// which D1's matches.
export type Database = BaseSQLiteDatabase<"async", unknown, typeof schema> &
  Pick<LibSQLDatabase<typeof schema>, "batch">;

export { schema };
