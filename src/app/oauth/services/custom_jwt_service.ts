import { JwtService } from "@jmondi/oauth2-server";
import type { ExtraAccessTokenFieldArgs } from "@jmondi/oauth2-server";

export class MyCustomJwtService extends JwtService {
  /**
   * Adds application claims to every access token this server signs.
   *
   * Access tokens travel to every resource server and land in their logs, so
   * keep this to what a resource server must know to authorize the request.
   * Identity claims belong in the id_token or behind /userinfo, where the
   * `email` and `profile` scopes gate them.
   *
   * @param args - the client and, unless the grant is machine-to-machine, the user
   * @returns claims merged into the access token payload
   */
  extraTokenFields({ client }: ExtraAccessTokenFieldArgs) {
    return {
      client: client.name,
    };
  }
}
