import { oauthScopes } from "../../../db/schema.js";
import type { OAuthScope } from "@jmondi/oauth2-server";

type ScopeModel = typeof oauthScopes.$inferSelect;

export class Scope implements ScopeModel, OAuthScope {
  readonly id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date | null;

  constructor(entity: ScopeModel) {
    this.id = entity.id;
    this.name = entity.name;

    this.createdAt = entity.createdAt ?? new Date();
    this.updatedAt = entity.updatedAt ?? null;
  }
}
