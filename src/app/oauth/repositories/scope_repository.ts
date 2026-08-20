import { inArray } from "drizzle-orm";
import type {
  GrantIdentifier,
  OAuthClient,
  OAuthScope,
  OAuthScopeRepository,
  OAuthUserIdentifier,
} from "@jmondi/oauth2-server";

import type { Database } from "../../../db/index.js";
import { oauthScopes } from "../../../db/schema.js";
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

  // The library's hook for narrowing what a grant may actually carry — drop a
  // scope this client is not entitled to, or that this user cannot delegate.
  // Pass-through here on purpose: the seeded clients are entitled to every scope
  // they can request, and a fork's entitlement rules belong in this method.
  async finalize(
    scopes: OAuthScope[],
    _identifier: GrantIdentifier,
    _client: OAuthClient,
    _userId?: OAuthUserIdentifier,
  ): Promise<OAuthScope[]> {
    return scopes;
  }
}
