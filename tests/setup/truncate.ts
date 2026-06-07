import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";

import { db } from "../../src/db/index.js";

export async function truncateDynamic(database: typeof db = db): Promise<void> {
  await database.execute(
    sql`TRUNCATE "oauth_token_scopes", "oauth_auth_code_scopes", "oauth_tokens", "oauth_auth_codes" RESTART IDENTITY CASCADE;`,
  );
}

beforeEach(async () => {
  await truncateDynamic();
});
