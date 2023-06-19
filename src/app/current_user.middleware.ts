import { Injectable, NestMiddleware } from "@nestjs/common";
import { Response, Request } from "express";

import { PrismaService } from "./prisma/prisma.service.js";
import { MyCustomJwtService } from "./oauth/services/custom_jwt_service.js";

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService, private readonly jwt: MyCustomJwtService) {}

  async use(req: Request, _res: Response, next: () => void) {
    const jid = req.cookies.jid;

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

    req.user = user;

    next();
  }
}
