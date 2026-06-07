import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const client = postgres(databaseUrl);

// casing: "snake_case" derives DB column names from the schema's camelCase keys;
// must match the same option in drizzle.config.ts so runtime queries and the
// generated migrations agree on column names.
export const db = drizzle(client, { schema, casing: "snake_case" });

export type Database = typeof db;

export { schema };
