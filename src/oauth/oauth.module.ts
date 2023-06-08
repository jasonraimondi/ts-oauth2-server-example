import { Module } from "@nestjs/common";

import { AuthorizationServerService } from "./services/authorization_server.service.js";
import { MyCustomJwtService } from "./services/custom_jwt_service.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthorizationController } from "./controllers/authorization.controller.js";
import { TokenController } from "./controllers/token.controller.js";
import { RevokeController } from "./controllers/revoke.controller.js";

@Module({
  imports: [PrismaModule],
  controllers: [AuthorizationController, RevokeController, TokenController],
  providers: [
    MyCustomJwtService.register("super-secret"),
    AuthorizationServerService.register({
      requiresPKCE: true,
      requiresS256: true,
    }),
  ],
})
export class OAuthModule {}
