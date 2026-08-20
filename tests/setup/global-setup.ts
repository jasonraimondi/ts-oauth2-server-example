import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import * as schema from "../../src/db/schema.js";
import { seed } from "../../src/db/seed.js";

config({ path: "tests/.env.test" });

const TEST_DB = "oauth_test";

export default async function globalSetup(): Promise<void> {
  const testUrl = process.env.DATABASE_URL!;
  const maintenanceUrl = testUrl.replace(/\/[^/]+$/, "/postgres");

  const admin = postgres(maintenanceUrl, { max: 1 });
  try {
    // The database is created once and reused by every later run, so a schema that
    // drifted out of step with drizzle/ survives here and makes the suite fail in
    // confusing ways. The fix is to drop it (`dropdb oauth_test`) and let this
    // rebuild it from the migrations — never to hand-patch the existing one.
    const exists = await admin`SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}`;
    if (exists.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${TEST_DB}"`);
    }
  } finally {
    await admin.end();
  }

  const client = postgres(testUrl, { max: 1, onnotice: () => {} });
  try {
    const testDb = drizzle(client, { schema, casing: "snake_case" });
    await migrate(testDb, { migrationsFolder: "./drizzle" });
    await seed(testDb);
  } finally {
    await client.end();
  }
}
