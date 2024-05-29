import {
  Body,
  Controller,
  Get,
  Post,
  Render,
  Req,
  Res,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response, Request } from "express";
import { requestFromExpress } from "@jmondi/oauth2-server/express";

import { AuthorizationServerService } from "../services/authorization_server.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { MyCustomJwtService } from "../services/custom_jwt_service.js";
import { DateDuration } from "@jmondi/date-duration";

export class ScopesBody {
  accept: string;
}

@Controller("scopes")
export class ScopesController {
  constructor(
    private readonly jwt: MyCustomJwtService,
    private readonly oauth: AuthorizationServerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Render("scopes")
  async index(@Req() req: Request, @Res() res: Response) {
    await this.oauth.validateAuthorizationRequest(requestFromExpress(req));

    return {
      csrfToken: req.csrfToken(),
      scopes: await this.prisma.oAuthScope.findMany(),
    };
  }

  @Post()
  async post(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: ScopesBody,
  ) {
    const expiresAt = new DateDuration("1d");
    res.cookie("accept", body.accept, {
      secure: true,
      httpOnly: true,
      sameSite: "strict",
      expires: expiresAt.endDate,
    });
    const [_, query] = req.url.split("?");
    res.status(HttpStatus.FOUND).redirect(`/api/oauth2/authorize?${query}`);
  }
}
