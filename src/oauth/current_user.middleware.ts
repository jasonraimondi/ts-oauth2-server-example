import { Injectable, NestMiddleware } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class CurrentUserMiddleware implements NestMiddleware {
  constructor(private readonly _prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    console.log("Request...");
    console.log(req.user);

    console.log(await this._prisma.user.findMany());

    next();
  }
}
