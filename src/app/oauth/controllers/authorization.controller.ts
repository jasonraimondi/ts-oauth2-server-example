import type { Request, Response } from "express";
import { Controller, Get, Req, Res } from "@nestjs/common";
import {
  handleExpressError,
  handleExpressResponse,
  requestFromExpress,
} from "@jmondi/oauth2-server/express";

import { AuthorizationServerService } from "../services/authorization_server.service.js";

@Controller("oauth2/authorize")
export class AuthorizationController {
  constructor(private readonly oauth: AuthorizationServerService) {}

  @Get()
  async get(@Req() req: Request, @Res() res: Response) {
    const request = requestFromExpress(req);

    const user = req.user;

    try {
      // Validate the HTTP request and return an AuthorizationRequest.
      const authRequest = await this.oauth.validateAuthorizationRequest(request);

      // You will probably redirect the user to a login endpoint.
      if (!user) {
        const [_, params] = req.url.split("?");
        res.status(302).redirect(`/api/login?${params}`);
        return;
      }

      // After login, the user should be redirected back with user in the session.
      // You will need to manage the authorization query on the round trip.
      // The auth request object can be serialized and saved into a user's session.

      // Once the user has logged in set the user on the AuthorizationRequest
      authRequest.user = user;

      // @todo don't hardcode this value...
      authRequest.isAuthorizationApproved = true;

      // Once the user has approved or denied the client update the status
      // (true = approved, false = denied)
      // authRequest.isAuthorizationApproved = getIsAuthorizationApprovedFromSession();

      // If the user has not approved the client's authorization request,
      // the user should be redirected to the approval screen.
      if (!authRequest.isAuthorizationApproved) {
        const [_, params] = req.url.split("?");
        res.status(302).redirect(`/api/scopes?${params}`);
        return;
      }

      // At this point the user has approved the client for authorization.
      // Any last authorization requests such as Two Factor Authentication (2FA) can happen here.

      // Redirect back to redirect_uri with `code` and `state` as url query params.
      const oauthResponse = await this.oauth.completeAuthorizationRequest(authRequest);
      return handleExpressResponse(res, oauthResponse);
    } catch (e) {
      handleExpressError(e, res);
    }
  }
}
