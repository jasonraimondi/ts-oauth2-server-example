import { Injectable, NestMiddleware } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { Response, Request } from "express";
import { MyCustomJwtService } from "./services/custom_jwt_service.js";

import { parseCookies } from "../../lib/cookies.js";

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService, private readonly jwt: MyCustomJwtService) {}

  async use(req: Request, _res: Response, next: () => void) {
    // it seems like req.cookies isnt available in middlewares,
    // so I'm just parsing the raw cookies from the header
    const cookies = parseCookies(req.headers.cookie);
    const jid = cookies.jid;

    if (!jid) return next();

    let userId: string | undefined;

    try {
      const decoded: { userId?: string } = await this.jwt.verify(jid);
      userId = decoded?.userId;
    } catch (e) {
      return next();
    }

    if (!userId) return next();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return next();

    // @ts-ignore
    req.user = user;

    next();
  }
}
