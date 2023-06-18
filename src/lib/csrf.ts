import { doubleCsrf } from "csrf-csrf";

export const csrf = doubleCsrf({
  // @todo this should be a rotating key
  getSecret: _req => "my-other-super-secret-key",
  cookie: {
    httpOnly: true,
    // sameSite: "strict",
    path: "/",
    secure: true,
  },
  getTokenFromRequest: req => req.body._csrf, // A function that returns the token from the request
});
