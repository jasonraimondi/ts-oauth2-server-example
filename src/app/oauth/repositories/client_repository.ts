import { eq } from "drizzle-orm";
import { OAuthException } from "@jmondi/oauth2-server";
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
      // RFC 6749 invalid_client (401), and never echo the client_id into the
      // response/logs. The library's validateClient() calls this with no catch, so
      // a plain Error would surface as a 500 with the id leaked in the body.
      throw OAuthException.invalidClient("Client has been revoked or is invalid.");
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
