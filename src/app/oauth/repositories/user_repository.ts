import { eq } from "drizzle-orm";
import type { GrantIdentifier, OAuthUserRepository } from "@jmondi/oauth2-server";

import type { Database } from "../../../db/index.js";
import { users } from "../../../db/schema.js";
import { Client } from "../entities/client.js";
import { User } from "../entities/user.js";
import { verifyPasswordOrThrow } from "../../../lib/password.js";

export class UserRepository implements OAuthUserRepository {
  constructor(private readonly db: Database) {}

  async getUserByCredentials(
    identifier: string,
    password?: string,
    _grantType?: GrantIdentifier,
    _client?: Client,
  ): Promise<User> {
    const row = await this.db.query.users.findFirst({
      where: eq(users.id, identifier),
    });

    if (!row) {
      throw new Error(`user not found for identifier ${identifier}`);
    }

    const user = new User(row);

    if (password) await verifyPasswordOrThrow(password, user.passwordHash!);

    return user;
  }
}
