import "dotenv/config";
import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import nunjucks from "nunjucks";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { AppModule } from "./app.module.js";
import { LocalLogger } from "./logging/local-logger.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new LocalLogger("App"),
  });

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(cookieParser("my-secret"));

  const templatesDir = join(__dirname, "..", "views");
  nunjucks.configure(templatesDir, {
    autoescape: true,
    express: app,
  });
  app.setViewEngine("njk");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      enableDebugMessages: true,
    }),
  );
  app.setGlobalPrefix("api");

  await app.listen(3000);

  console.log(`Sample Login: http://localhost:5173/`);
}

bootstrap().then().catch(console.error);
