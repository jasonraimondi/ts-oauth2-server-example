import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Run as a one-shot release job before new replicas serve traffic, never at app
// boot. Reads DATABASE_URL directly so the production image can migrate without
// drizzle-kit (a devDependency) and without booting the app's config module.

// Drizzle's postgres migrator takes no lock of its own, so two replicas rolling
// out at the same time would race the same DDL. Every replica takes this one
// session-scoped lock first; the loser waits, then finds nothing left to apply.
const MIGRATION_LOCK_KEY = 7_291_055;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

// max: 1 keeps the lock, the DDL, and the unlock on one session — an advisory
// lock is held by the connection that took it.
const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
  await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`;
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`;
  }
} finally {
  await client.end();
}
