import { inArray } from "drizzle-orm";
import type { GrantIdentifier, OAuthScope, OAuthScopeRepository } from "@jmondi/oauth2-server";

import type { Database } from "../../../db/index.js";
import { oauthScopes } from "../../../db/schema.js";
import { Client } from "../entities/client.js";
import { Scope } from "../entities/scope.js";

export class ScopeRepository implements OAuthScopeRepository {
  constructor(private readonly db: Database) {}

  async getAllByIdentifiers(scopeNames: string[]): Promise<Scope[]> {
    const scopes = await this.db
      .select()
      .from(oauthScopes)
      .where(inArray(oauthScopes.name, scopeNames));
    return scopes.map(s => new Scope(s));
  }

  async finalize(
    scopes: OAuthScope[],
    _identifier: GrantIdentifier,
    _client: Client,
    _user_id?: string,
  ): Promise<OAuthScope[]> {
    return scopes;
  }
}
