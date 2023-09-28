import { Module } from "@nestjs/common";

import { AppController } from "./app.controller.js";
import { OAuthModule } from "./app/oauth/oauth.module.js";
import { LoggingModule } from "./logging/logging.module.js";

@Module({
  imports: [OAuthModule, LoggingModule],
  controllers: [AppController],
})
export class AppModule { }
