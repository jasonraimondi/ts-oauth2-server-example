import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import bodyParser from "body-parser";

import { AppModule } from "./app.module.js";
import { PrismaService } from "./prisma/prisma.service.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  await app.listen(3000);

  console.log(`listening on http://localhost:3000/ping`);
}
bootstrap();
