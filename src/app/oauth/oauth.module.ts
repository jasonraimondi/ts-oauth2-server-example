import { MiddlewareConsumer, Module, NestModule, RequestMethod } from "@nestjs/common";

import { AuthorizationServerService } from "./services/authorization_server.service.js";
import { MyCustomJwtService } from "./services/custom_jwt_service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthorizationController } from "./controllers/authorization.controller.js";
import { TokenController } from "./controllers/token.controller.js";
import { RevokeController } from "./controllers/revoke.controller.js";
import { LoginController } from "./controllers/login.controller.js";
import { CurrentUserMiddleware } from "../current_user.middleware.js";
import { csrf } from "../../lib/csrf.js";
import { ScopesController } from "./controllers/scopes.controller.js";

@Module({
  imports: [PrismaModule],
  controllers: [
    AuthorizationController,
    RevokeController,
    ScopesController,
    TokenController,
    LoginController,
  ],
  providers: [
    MyCustomJwtService.register("super-secret"),
    AuthorizationServerService.register({
      requiresPKCE: true,
      requiresS256: true,
    }),
    CurrentUserMiddleware,
  ],
  exports: [AuthorizationServerService],
})
export class OAuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(csrf.doubleCsrfProtection).forRoutes(LoginController, ScopesController);
    consumer.apply(CurrentUserMiddleware).forRoutes({
      path: "*",
      method: RequestMethod.ALL,
    });
  }
}
