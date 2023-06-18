import { OAuthRequest } from "@jmondi/oauth2-server";
import { Controller, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { AuthorizationServerService } from "../services/authorization_server.service.js";
import { handleExpressError, requestFromExpress } from "@jmondi/oauth2-server/express";

@Controller("oauth2/token")
export class TokenController {
  constructor(private readonly oauth: AuthorizationServerService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async post(@Req() req: Request, @Res() res: Response) {
    const request = new OAuthRequest(requestFromExpress(req));

    try {
      const tokenResponse = await this.oauth.respondToAccessTokenRequest(request);
      // res.set(tokenResponse.headers);
      res.status(tokenResponse.status).send(tokenResponse.body);
      return;
    } catch (e) {
      handleExpressError(e, res);
      return;
    }
  }
}
