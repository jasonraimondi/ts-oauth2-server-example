import {
  AuthorizationServer as JmondiAuthServer,
  AuthorizationServerOptions,
} from "@jmondi/oauth2-server";
import { Injectable, Provider } from "@nestjs/common";

import { ClientRepository } from "../repositories/client_repository.js";
import { TokenRepository } from "../repositories/token_repository.js";
import { ScopeRepository } from "../repositories/scope_repository.js";
import { MyCustomJwtService } from "./custom_jwt_service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { UserRepository } from "../repositories/user_repository.js";
import { AuthCodeRepository } from "../repositories/auth_code_repository.js";

@Injectable()
export class AuthorizationServerService extends JmondiAuthServer {
  static register(options?: Partial<AuthorizationServerOptions>): Provider {
    return {
      provide: AuthorizationServerService,
      useFactory: (prisma: PrismaService, jwt: MyCustomJwtService) => {
        const authCodeRepository = new AuthCodeRepository(prisma);
        const userRepository = new UserRepository(prisma);
        const authorizationServer = new AuthorizationServerService(
          new ClientRepository(prisma),
          new TokenRepository(prisma),
          new ScopeRepository(prisma),
          jwt,
          options,
        );
        authorizationServer.enableGrantTypes(
          "client_credentials",
          { grant: "authorization_code", authCodeRepository, userRepository },
          { grant: "password", userRepository },
        );
        console.log("I am a factory", typeof prisma, typeof jwt, typeof authorizationServer);
        return authorizationServer;
      },
      inject: [PrismaService, MyCustomJwtService],
    };
  }
}
