import { eq } from "drizzle-orm";
import { DateInterval, generateRandomToken } from "@jmondi/oauth2-server";
import type { OAuthClient, OAuthTokenRepository } from "@jmondi/oauth2-server";

import type { Database } from "../../../db/index.js";
import { oauthTokens, oauthTokenScopes } from "../../../db/schema.js";
import type { Client } from "../entities/client.js";
import type { Scope } from "../entities/scope.js";
import { Token } from "../entities/token.js";
import type { User } from "../entities/user.js";

// Token/session lifetime model for this example:
//   access token  -> 1h  (set by the grant's accessTokenTTL in container.ts)
//   refresh token -> 30d (issueRefreshToken below)
//   session cookie -> 30d (signSession in app.tsx / lib/session.ts)
export class TokenRepository implements OAuthTokenRepository {
  constructor(private readonly db: Database) {}

  // The library calls getByAccessToken with the JWT `jti`, which equals the
  // random token we stored in oauthTokens.accessToken. It powers both the
  // access-token revoke path and the /userinfo revocation guard.
  async getByAccessToken(accessToken: string): Promise<Token> {
    const row = await this.db.query.oauthTokens.findFirst({
      where: eq(oauthTokens.accessToken, accessToken),
      with: {
        client: true,
        user: true,
        tokenScopes: { with: { scope: true } },
      },
    });

    if (!row) {
      throw new Error(`oauth token not found for access token ${accessToken}`);
    }

    return new Token({
      ...row,
      scopes: row.tokenScopes.map(s => s.scope),
    });
  }

  // This demo models revocation as force-expiry: revoke() pushes the expiry into
  // the past, so a revoked access token reads as expired here.
  async isAccessTokenRevoked(token: Token): Promise<boolean> {
    return token.isExpired;
  }

  async issueToken(client: Client, scopes: Scope[], user?: User): Promise<Token> {
    return new Token({
      accessToken: generateRandomToken(),
      // The authorization_code grant's accessTokenTTL (1h, in container.ts)
      // overrides this value, so it never reaches a real response.
      accessTokenExpiresAt: new DateInterval("1h").getEndDate(),
      refreshToken: null,
      refreshTokenExpiresAt: null,
      client: client as unknown as ConstructorParameters<typeof Token>[0]["client"],
      clientId: client.id,
      user: user ?? null,
      userId: user?.id ?? null,
      scopes,
      createdAt: new Date(),
      updatedAt: null,
    });
  }

  async getByRefreshToken(refreshToken: string): Promise<Token> {
    const row = await this.db.query.oauthTokens.findFirst({
      where: eq(oauthTokens.refreshToken, refreshToken),
      with: {
        client: true,
        user: true,
        tokenScopes: { with: { scope: true } },
      },
    });

    if (!row) {
      throw new Error(`oauth token not found for refresh token ${refreshToken}`);
    }

    return new Token({
      ...row,
      scopes: row.tokenScopes.map(s => s.scope),
    });
  }

  async isRefreshTokenRevoked(token: Token): Promise<boolean> {
    return Date.now() > (token.refreshTokenExpiresAt?.getTime() ?? 0);
  }

  async issueRefreshToken(token: Token, _client: OAuthClient): Promise<Token> {
    token.refreshToken = generateRandomToken();
    // Refresh tokens outlive the 1h access token so a client can stay logged in
    // for the 30-day session window without re-running the authorize flow.
    token.refreshTokenExpiresAt = new DateInterval("30d").getEndDate();
    await this.db
      .update(oauthTokens)
      .set({
        refreshToken: token.refreshToken,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      })
      .where(eq(oauthTokens.accessToken, token.accessToken));
    return token;
  }

  async persist({ user, client, scopes, ...token }: Token): Promise<void> {
    await this.db.transaction(async tx => {
      await tx
        .insert(oauthTokens)
        .values({
          accessToken: token.accessToken,
          accessTokenExpiresAt: token.accessTokenExpiresAt,
          refreshToken: token.refreshToken,
          refreshTokenExpiresAt: token.refreshTokenExpiresAt,
          clientId: token.clientId,
          userId: token.userId,
          createdAt: token.createdAt,
          updatedAt: token.updatedAt,
        })
        .onConflictDoNothing();

      if (scopes.length > 0) {
        await tx
          .insert(oauthTokenScopes)
          .values(scopes.map(scope => ({ accessToken: token.accessToken, scopeId: scope.id })))
          .onConflictDoNothing();
      }
    });
  }

  async revoke(tokenEntity: Token): Promise<void> {
    tokenEntity.revoke();
    await this.update(tokenEntity);
  }

  private async update(token: Token): Promise<void> {
    await this.db
      .update(oauthTokens)
      .set({
        accessTokenExpiresAt: token.accessTokenExpiresAt,
        refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      })
      .where(eq(oauthTokens.accessToken, token.accessToken));
  }
}
