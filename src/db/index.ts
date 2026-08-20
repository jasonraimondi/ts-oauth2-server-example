import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";
import { env } from "../lib/config.js";

const client = postgres(env.DATABASE_URL);

// casing: "snake_case" derives DB column names from the schema's camelCase keys;
// must match the same option in drizzle.config.ts so runtime queries and the
// generated migrations agree on column names.
export const db = drizzle(client, { schema, casing: "snake_case" });

// Lets the entry point drain the pool on shutdown; without it a SIGTERM leaves
// in-flight queries to be killed by the socket close.
export const closeDb = (): Promise<void> => client.end({ timeout: 5 });

export type Database = typeof db;

export { schema };
