import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

// Run as a one-shot release job before the new process serves traffic, never at
// app boot. Reads DATABASE_URL directly so the production image can migrate
// without drizzle-kit (a devDependency) and without booting the app's config
// module.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const client = createClient({ url: databaseUrl });
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
} finally {
  client.close();
}
