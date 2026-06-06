import { eq } from "drizzle-orm";
import type { GrantIdentifier, OAuthClient, OAuthClientRepository } from "@jmondi/oauth2-server";

import type { Database } from "../../../db/index.js";
import { oauthClients } from "../../../db/schema.js";
import { Client } from "../entities/client.js";

export class ClientRepository implements OAuthClientRepository {
  constructor(private readonly db: Database) {}

  async getByIdentifier(clientId: string): Promise<Client> {
    const row = await this.db.query.oauthClients.findFirst({
      where: eq(oauthClients.id, clientId),
      with: { clientScopes: { with: { scope: true } } },
    });

    if (!row) {
      throw new Error(`oauth client not found for identifier ${clientId}`);
    }

    return new Client({
      ...row,
      scopes: row.clientScopes.map(cs => cs.scope),
    });
  }

  async isClientValid(
    grantType: GrantIdentifier,
    client: OAuthClient,
    clientSecret?: string,
  ): Promise<boolean> {
    if (client.secret && client.secret !== clientSecret) {
      return false;
    }
    return client.allowedGrants.includes(grantType);
  }
}
