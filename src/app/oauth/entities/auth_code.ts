import { oauthAuthCodes, oauthClients, oauthScopes, users } from "../../../db/schema.js";
import type { OAuthAuthCode, CodeChallengeMethod } from "@jmondi/oauth2-server";

import { Client } from "./client.js";
import { Scope } from "./scope.js";
import { User } from "./user.js";

type AuthCodeModel = typeof oauthAuthCodes.$inferSelect;
type ClientModel = typeof oauthClients.$inferSelect;
type ScopeModel = typeof oauthScopes.$inferSelect;
type UserModel = typeof users.$inferSelect;

type Relations = Partial<{
  user: UserModel;
  scopes: ScopeModel[];
}>;

type WithClient = {
  // A raw client row (from a relational query) or an already-built Client entity
  // (from issueAuthCode); the constructor wraps either via `new Client(...)`.
  client: ClientModel | Client;
};

export class AuthCode implements AuthCodeModel, OAuthAuthCode {
  readonly code: string;
  codeChallenge: string | null;
  codeChallengeMethod: CodeChallengeMethod;
  nonce: string | null;
  authTime: number | null;
  maxAge: number | null;
  redirectUri: string | null;
  user: User | null;
  userId: string | null;
  client: Client;
  clientId: string;
  expiresAt: Date;
  scopes: Scope[];
  createdAt: Date;
  updatedAt: Date | null;

  constructor({ user, client, scopes, ...entity }: AuthCodeModel & WithClient & Relations) {
    this.code = entity.code;
    this.codeChallenge = entity.codeChallenge;
    this.codeChallengeMethod = entity.codeChallengeMethod;
    this.nonce = entity.nonce;
    this.authTime = entity.authTime;
    this.maxAge = entity.maxAge;
    this.redirectUri = entity.redirectUri;
    this.user = user ? new User(user) : null;
    this.userId = entity.userId;
    this.client = new Client(client);
    this.clientId = entity.clientId;
    this.scopes = scopes?.map(s => new Scope(s)) ?? [];
    this.expiresAt = entity.expiresAt;
    this.createdAt = entity.createdAt;
    this.updatedAt = entity.updatedAt;
  }

  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }
}
