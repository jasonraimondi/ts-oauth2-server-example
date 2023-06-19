import { PrismaClient } from "@prisma/client";
import { GrantIdentifier, OAuthClient, OAuthClientRepository } from "@jmondi/oauth2-server";

import { Client } from "../entities/client.js";

export class ClientRepository implements OAuthClientRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getByIdentifier(clientId: string): Promise<Client> {
    return new Client(
      await this.prisma.oAuthClient.findUniqueOrThrow({
        where: {
          id: clientId,
        },
        include: {
          scopes: true,
        },
      }),
    );
  }

  async isClientValid(
    grantType: GrantIdentifier,
    client: OAuthClient,
    clientSecret?: string,
  ): Promise<boolean> {
    if (client.secret && client.secret !== clientSecret) {
      return false;
    }
    // @todo this is returning false, and it is a really bad error that is not helpful
    return client.allowedGrants.includes(grantType);
  }
}
