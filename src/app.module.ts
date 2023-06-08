import { Module } from "@nestjs/common";

import { AppController } from "./app.controller.js";
import { OAuthModule } from "./oauth/oauth.module.js";

@Module({
  imports: [OAuthModule],
  controllers: [AppController],
})
export class AppModule {}
