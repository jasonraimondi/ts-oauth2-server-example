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
import { randomBytes, createHash } from "node:crypto";

import { AppModule } from "./app.module.js";
import { PrismaService } from "./app/prisma/prisma.service.js";
import { base64urlencode } from "./lib/base64.js";
import { csrf } from "./lib/csrf.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(cookieParser("my-secret"));
  app.use(csrf.doubleCsrfProtection);

  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  // app.useStaticAssets({ root: join(__dirname, "..", "public") });
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

  await app.listen(3000);

  console.log(`Sample Login: ${generateLoginLink()}`);
}

function generateLoginLink() {
  const state = base64urlencode(randomBytes(5));
  const codeVerifier = base64urlencode(randomBytes(40));
  const codeChallenge = base64urlencode(createHash("sha256").update(codeVerifier).digest("hex"));

  const url = new URL("http://localhost:3000/oauth2/authorize");
  url.searchParams.set("client_id", "0e2ec2df-ee53-4327-a472-9d78c278bdbb");
  url.searchParams.set("redirect_uri", "http://example.com/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

bootstrap();
