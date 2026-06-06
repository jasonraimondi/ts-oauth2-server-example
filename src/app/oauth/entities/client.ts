import { oauthClients, oauthScopes } from "../../../db/schema.js";
import type { GrantIdentifier, OAuthClient } from "@jmondi/oauth2-server";

import { Scope } from "./scope.js";

type ClientModel = Omit<typeof oauthClients.$inferSelect, "allowedGrants"> & {
  allowedGrants: GrantIdentifier[];
};
type ScopeModel = typeof oauthScopes.$inferSelect;

type Relations = {
  scopes: ScopeModel[];
};

export class Client implements ClientModel, OAuthClient {
  readonly id: string;
  name: string;
  secret: string | null;
  redirectUris: string[];
  allowedGrants: GrantIdentifier[];
  scopes: Scope[];
  createdAt: Date;
  updatedAt: Date | null;

  constructor({ scopes, ...entity }: ClientModel & Partial<Relations>) {
    this.id = entity.id;
    this.name = entity.name;
    this.secret = entity.secret ?? null;
    this.redirectUris = entity.redirectUris;
    this.allowedGrants = entity.allowedGrants;
    this.scopes = scopes?.map(s => new Scope(s)) ?? [];
    this.createdAt = entity.createdAt ?? new Date();
    this.updatedAt = entity.updatedAt ?? null;
  }
}
