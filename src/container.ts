import "dotenv/config";

import { AuthorizationServer, DateInterval } from "@jmondi/oauth2-server";

import { db } from "./db/index.js";
import { ClientRepository } from "./app/oauth/repositories/client_repository.js";
import { ScopeRepository } from "./app/oauth/repositories/scope_repository.js";
import { UserRepository } from "./app/oauth/repositories/user_repository.js";
import { AuthCodeRepository } from "./app/oauth/repositories/auth_code_repository.js";
import { TokenRepository } from "./app/oauth/repositories/token_repository.js";
import { MyCustomJwtService } from "./app/oauth/services/custom_jwt_service.js";

const clientRepository = new ClientRepository(db);
const scopeRepository = new ScopeRepository(db);
const userRepository = new UserRepository(db);
const authCodeRepository = new AuthCodeRepository(db);
const tokenRepository = new TokenRepository(db);

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET environment variable is required");
const jwt = new MyCustomJwtService(jwtSecret);

const authorizationServer = new AuthorizationServer(
  clientRepository,
  tokenRepository,
  scopeRepository,
  jwt,
  { requiresPKCE: true, requiresS256: true },
);

authorizationServer.enableGrantTypes(
  ["refresh_token", new DateInterval("1h")],
  [{ grant: "authorization_code", authCodeRepository, userRepository }, new DateInterval("1h")],
);

export {
  authorizationServer,
  db,
  jwt,
  clientRepository,
  tokenRepository,
  scopeRepository,
  authCodeRepository,
  userRepository,
};
