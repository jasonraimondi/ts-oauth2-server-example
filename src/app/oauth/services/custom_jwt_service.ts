import { JwtService } from "@jmondi/oauth2-server";
import type { ExtraAccessTokenFieldArgs } from "@jmondi/oauth2-server";

export class MyCustomJwtService extends JwtService {
  extraTokenFields({ user, client }: ExtraAccessTokenFieldArgs) {
    return {
      email: (user as { email?: string } | undefined)?.email ?? "",
      client: client.name,
    };
  }
}
