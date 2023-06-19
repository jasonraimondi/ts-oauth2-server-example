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
import { User } from "@prisma/client";
import { DateDuration } from "@jmondi/date-duration";
import { IsEmail, IsString } from "class-validator";

import { AuthorizationServerService } from "../services/authorization_server.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { verifyPasswordOrThrow } from "../../../lib/password.js";
import { MyCustomJwtService } from "../services/custom_jwt_service.js";

export class LoginBody {
  @IsEmail()
  email: string;
  @IsString()
  password: string;
}

@Controller("login")
export class LoginController {
  constructor(
    private readonly jwt: MyCustomJwtService,
    private readonly oauth: AuthorizationServerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Render("login")
  async index(@Req() req: Request, @Res() res: Response) {
    await this.oauth.validateAuthorizationRequest(requestFromExpress(req));

    return {
      csrfToken: req.csrfToken(),
      loginFormAction: "#",
      forgotPasswordLink: "#",
    };
  }

  @Post()
  async post(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginBody,
  ) {
    await this.oauth.validateAuthorizationRequest(req);

    const { email, password } = body;
    let user: User;

    try {
      user = await this.prisma.user.findFirstOrThrow({
        where: {
          email: {
            equals: email,
            mode: "insensitive",
          },
        },
      });
      await verifyPasswordOrThrow(password, user.passwordHash);
    } catch (e) {
      throw new UnauthorizedException(null, { cause: e });
    }

    user = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIP: req.ip,
      },
    });

    const expiresAt = new DateDuration("30d");

    const token = await this.jwt.sign({
      userId: user.id,
      email: user.email,

      iat: Math.floor(Date.now() / 1000),
      exp: expiresAt.endTimeSeconds,
    });

    res.cookie("jid", token, {
      secure: true,
      httpOnly: true,
      sameSite: "strict",
      expires: expiresAt.endDate,
    });

    // const query = querystring.stringify(req.query as any);
    // await this.loginService.loginAndRedirect(user, req.ip, res, query);
    const [_, query] = req.url.split("?");
    res.status(HttpStatus.FOUND).redirect(`/api/oauth2/authorize?${query}`);
  }
}
