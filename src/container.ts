import "dotenv/config";

import { AuthorizationServer, DateInterval, OAuthException } from "@jmondi/oauth2-server";

import { db } from "./db/index.js";
import { ClientRepository } from "./app/oauth/repositories/client_repository.js";
import { ScopeRepository } from "./app/oauth/repositories/scope_repository.js";
import { UserRepository, NotFoundError } from "./app/oauth/repositories/user_repository.js";
import { AuthCodeRepository } from "./app/oauth/repositories/auth_code_repository.js";
import { TokenRepository } from "./app/oauth/repositories/token_repository.js";
import { MyCustomJwtService } from "./app/oauth/services/custom_jwt_service.js";
import { resolvePrivateKey } from "./lib/oidc_key.js";

const clientRepository = new ClientRepository(db);
const scopeRepository = new ScopeRepository(db);
const userRepository = new UserRepository(db);
const authCodeRepository = new AuthCodeRepository(db);
const tokenRepository = new TokenRepository(db);

const issuer = process.env.OIDC_ISSUER ?? "http://localhost:3000";
const jwt = new MyCustomJwtService({ key: resolvePrivateKey() });

const authorizationServer = new AuthorizationServer(
  clientRepository,
  tokenRepository,
  scopeRepository,
  jwt,
  {
    requiresPKCE: true,
    requiresS256: true,
    issuer,
    oidc: {
      authorizationEndpoint: `${issuer}/api/oauth2/authorize`,
      tokenEndpoint: `${issuer}/api/oauth2/token`,
      userinfoEndpoint: `${issuer}/api/oauth2/userinfo`,
      jwksUri: `${issuer}/.well-known/jwks.json`,
      // Return only attributes we actually store; the library filters them by the
      // granted scopes (email -> email, profile -> name) before serving /userinfo.
      getUserClaims: async subject => {
        // If the subject no longer exists, surface an RFC 6750 invalid_token so
        // /userinfo answers 401. Only a genuinely-missing user is swallowed — any
        // other failure (e.g. the DB being down) propagates instead of masquerading
        // as "user no longer exists".
        const user = await userRepository.getUserByCredentials(subject).catch((e: unknown) => {
          if (e instanceof NotFoundError) return undefined;
          throw e;
        });
        if (!user) throw OAuthException.invalidToken("The user no longer exists");
        return { sub: subject, email: user.email, name: user.name ?? undefined };
      },
    },
  },
);

authorizationServer.enableGrantTypes(
  ["refresh_token", new DateInterval("1h")],
  [{ grant: "authorization_code", authCodeRepository, userRepository }, new DateInterval("1h")],
);

// Only the handles other modules actually consume are exported; the repositories
// are wired into the AuthorizationServer above and don't need to leak out.
export { authorizationServer, db, jwt, userRepository };
