import { OAuthScope as ScopeModel } from "@prisma/client";
import { OAuthScope } from "@jmondi/oauth2-server";

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
