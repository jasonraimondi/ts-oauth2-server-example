import { ExtraAccessTokenFieldArgs, JwtService } from "@jmondi/oauth2-server";
import { Injectable } from "@nestjs/common";

@Injectable()
export class MyCustomJwtService extends JwtService {
  extraTokenFields({ user, client }: ExtraAccessTokenFieldArgs) {
    return {
      email: user?.email,
      client: client.name,
    };
  }

  static register(secret: string) {
    return {
      provide: MyCustomJwtService,
      useFactory: () => new MyCustomJwtService(secret),
    };
  }
}
