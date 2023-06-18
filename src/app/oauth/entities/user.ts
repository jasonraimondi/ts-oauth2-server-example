import { User as UserModel } from "@prisma/client";
import { OAuthUser } from "@jmondi/oauth2-server";

export class User implements UserModel, OAuthUser {
  readonly id: string;
  email: string;
  passwordHash: string | null;
  tokenVersion = 0;
  lastLoginAt: Date | null;
  lastLoginIP: string | null;
  createdIP: string;
  createdAt: Date;
  updatedAt: Date | null;

  constructor(entity: UserModel) {
    this.id = entity.id;
    this.email = entity.email;
    this.passwordHash = entity.passwordHash;
    this.tokenVersion = entity.tokenVersion;
    this.lastLoginAt = entity.lastLoginAt;
    this.lastLoginIP = entity.lastLoginIP;
    this.createdIP = entity.createdIP;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }
}
