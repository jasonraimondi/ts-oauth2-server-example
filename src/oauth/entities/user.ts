import bcrypt from "bcryptjs";
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

  async setPassword(password: string) {
    this.passwordHash = await bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string) {
    if (!this.passwordHash) throw new Error("password not set");

    const validPassword = await bcrypt.compare(password, this.passwordHash);

    if (!validPassword) throw new Error("invalid password");
  }
}
