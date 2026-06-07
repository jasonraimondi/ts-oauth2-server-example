import { users } from "../../../db/schema.js";
import type { OAuthUser } from "@jmondi/oauth2-server";

type UserModel = typeof users.$inferSelect;

export class User implements UserModel, OAuthUser {
  readonly id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  tokenVersion: number;
  lastLoginAt: Date | null;
  lastLoginIP: string | null;
  createdIP: string;
  createdAt: Date;
  updatedAt: Date | null;

  constructor(entity: UserModel) {
    this.id = entity.id;
    this.email = entity.email;
    this.name = entity.name;
    this.passwordHash = entity.passwordHash;
    this.tokenVersion = entity.tokenVersion;
    this.lastLoginAt = entity.lastLoginAt;
    this.lastLoginIP = entity.lastLoginIP;
    this.createdIP = entity.createdIP;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }
}
