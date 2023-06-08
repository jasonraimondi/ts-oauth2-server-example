// import { Injectable } from "@nestjs/common";
// import { ClientRepository } from "../repositories/client_repository.js";
// import { ScopeRepository } from "../repositories/scope_repository.js";
// import { AuthorizationServer, OAuthUserRepository } from "@jmondi/oauth2-server";
// import { MyCustomJwtService } from "./custom_jwt_service.js";
// import { PrismaService } from "../../prisma/prisma.service.js";
// import { User } from "../entities/user.js";
//
// @Injectable()
// export class LoginService {
//   constructor(
//     private readonly clientRepo: ClientRepository,
//     private readonly scopeRepo: ScopeRepository,
//     private readonly userRepository: OAuthUserRepository,
//     private readonly jwt: MyCustomJwtService,
//     private readonly prisma: PrismaService,
//   ) {}
//
//   async loginAndRedirect(user: User, ipAddr: string, res: Response, query: string) {
//     await this.incrementLastLogin(user.id, ipAddr);
//
//     // const jwt = await this.jwt.sign({
//     //   userId: user.id,
//     //   email: user.email,
//     // });
//
//     // const cookieTTL = new DateInterval(ENV.oauth.authorizationServer.loginDuration);
//     // const options = this.oauth.cookieOptions({ cookieTTL });
//     //
//     // res.cookie(COOKIES.token, jwt, options);
//     // res.status(HttpStatus.FOUND);
//     // res.redirect(API_ROUTES.authorize.template + "?" + query);
//   }
//
//   private incrementLastLogin(userId: string, ipAddr: string) {
//     return this.prisma.user.update({
//       where: { id: userId },
//       data: {
//         lastLoginAt: new Date(),
//         lastLoginIP: ipAddr,
//       },
//     });
//   }
// }
