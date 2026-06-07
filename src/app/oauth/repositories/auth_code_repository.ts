import { eq } from "drizzle-orm";
import { DateInterval, generateRandomToken, OAuthException } from "@jmondi/oauth2-server";
import type { OAuthAuthCode, OAuthAuthCodeRepository } from "@jmondi/oauth2-server";

import type { Database } from "../../../db/index.js";
import { oauthAuthCodes, oauthAuthCodeScopes } from "../../../db/schema.js";
import { AuthCode } from "../entities/auth_code.js";
import type { Client } from "../entities/client.js";
import type { Scope } from "../entities/scope.js";
import type { User } from "../entities/user.js";

export class AuthCodeRepository implements OAuthAuthCodeRepository {
  constructor(private readonly db: Database) {}

  async getByIdentifier(authCodeCode: string): Promise<AuthCode> {
    const row = await this.db.query.oauthAuthCodes.findFirst({
      where: eq(oauthAuthCodes.code, authCodeCode),
      with: {
        client: true,
        authCodeScopes: { with: { scope: true } },
      },
    });

    if (!row) {
      // RFC 6749 invalid_grant (400) for an unknown/replayed code, with no code
      // value echoed. The library resolves codes via this method with no catch, so
      // a plain Error would surface as a 500 leaking the code in the body.
      throw OAuthException.invalidGrant("The authorization code is invalid or has expired.");
    }

    return new AuthCode({
      ...row,
      scopes: row.authCodeScopes.map(s => s.scope),
    });
  }

  async isRevoked(authCodeCode: string): Promise<boolean> {
    const authCode = await this.getByIdentifier(authCodeCode);
    return authCode.isExpired;
  }

  issueAuthCode(client: Client, user: User | undefined, scopes: Scope[]): OAuthAuthCode {
    return new AuthCode({
      redirectUri: null,
      code: generateRandomToken(),
      codeChallenge: null,
      codeChallengeMethod: "S256",
      nonce: null,
      authTime: null,
      maxAge: null,
      expiresAt: new DateInterval("15m").getEndDate(),
      client,
      clientId: client.id,
      user,
      userId: user?.id ?? null,
      scopes,
      createdAt: new Date(),
      updatedAt: null,
    });
  }

  async persist({ user, client, scopes, ...authCode }: AuthCode): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.insert(oauthAuthCodes).values({
        code: authCode.code,
        redirectUri: authCode.redirectUri,
        codeChallenge: authCode.codeChallenge,
        codeChallengeMethod: authCode.codeChallengeMethod,
        nonce: authCode.nonce ?? null,
        authTime: authCode.authTime ?? null,
        maxAge: authCode.maxAge ?? null,
        expiresAt: authCode.expiresAt,
        userId: authCode.userId,
        clientId: authCode.clientId,
        createdAt: authCode.createdAt,
        updatedAt: authCode.updatedAt,
      });

      if (scopes.length > 0) {
        await tx
          .insert(oauthAuthCodeScopes)
          .values(scopes.map(scope => ({ authCodeCode: authCode.code, scopeId: scope.id })));
      }
    });
  }

  async revoke(authCodeCode: string): Promise<void> {
    await this.db
      .update(oauthAuthCodes)
      .set({ expiresAt: new Date(0) })
      .where(eq(oauthAuthCodes.code, authCodeCode));
  }
}
