import { Controller, Get, Render, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthorizationServerService } from "../services/authorization_server.service.js";

@Controller("login")
export class LoginController {
  constructor(private readonly oauth: AuthorizationServerService) {}

  @Get()
  @Render("login")
  async index(@Req() req: Request) {
    await this.oauth.validateAuthorizationRequest(req);

    return {
      csrfToken: req.csrfToken(),
      loginFormAction: "#",
      forgotPasswordLink: "#",
    };
  }
}
