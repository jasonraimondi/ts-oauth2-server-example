import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema.js";

// casing: "snake_case" derives DB column names from the schema's camelCase keys;
// must match the same option in drizzle.config.ts so runtime queries and the
// generated migrations agree on column names.
export function createDb(databaseUrl: string) {
  const client = createClient({ url: databaseUrl });
  const db = drizzle(client, { schema, casing: "snake_case" });
  const close = async (): Promise<void> => client.close();
  return { db, close };
}

export type Database = ReturnType<typeof createDb>["db"];

export { schema };
