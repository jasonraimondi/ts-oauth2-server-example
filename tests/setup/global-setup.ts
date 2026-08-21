import { rmSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "../../src/db/schema.js";
import { seed } from "../../src/db/seed.js";

config({ path: "tests/.env.test" });

export default async function globalSetup(): Promise<void> {
  const testUrl = process.env.DATABASE_URL!;

  // The test database is a throwaway file, rebuilt from the migrations on every
  // run so a schema that drifted out of step with drizzle/ can never survive here.
  // A crashed run can leave a journal sidecar behind, and SQLite would replay it
  // into the fresh file, so those go too.
  const dbPath = testUrl.replace(/^file:/, "");
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    rmSync(dbPath + suffix, { force: true });
  }

  const client = createClient({ url: testUrl });
  try {
    const testDb = drizzle(client, { schema, casing: "snake_case" });
    await migrate(testDb, { migrationsFolder: "./drizzle" });
    await seed(testDb);
  } finally {
    client.close();
  }
}
