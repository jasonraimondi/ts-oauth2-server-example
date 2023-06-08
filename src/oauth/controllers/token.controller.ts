import { OAuthRequest } from "@jmondi/oauth2-server";
import { Controller, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { handleExpressError } from "@jmondi/oauth2-server/express";

import { AuthorizationServerService } from "../services/authorization_server.service.js";

@Controller("oauth2/token")
export class TokenController {
  constructor(private readonly oauth: AuthorizationServerService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async post(@Req() req: Request, @Res() res: Response) {
    const request = new OAuthRequest(req);

    try {
      const tokenResponse = await this.oauth.respondToAccessTokenRequest(request);
      res.set(tokenResponse.headers);
      res.status(tokenResponse.status).send(tokenResponse.body);
      return;
    } catch (e) {
      handleExpressError(e, res);
      return;
    }
  }
}
