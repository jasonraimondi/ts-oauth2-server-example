import { User } from "@prisma/client";
import { CsrfTokenCreator } from "csrf-csrf";

declare module "express" {
  export interface Request {
    user?: User;
    csrfToken?: (overwrite?: boolean) => ReturnType<CsrfTokenCreator>;
  }
}
