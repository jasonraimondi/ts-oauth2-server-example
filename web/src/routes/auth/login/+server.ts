import { redirect, type RequestHandler } from "@sveltejs/kit";

import { config, discover } from "$lib/server/config";
import { buildAuthorizeUrl, generatePkce, randomToken } from "$lib/server/oauth";
import { putPending } from "$lib/server/session";

// Start the Authorization Code + PKCE flow. CSPRNG state/nonce/verifier are stashed
// server-side keyed by state; the browser is redirected to the AS authorize endpoint
// (discovered, not hardcoded). Tokens never touch the browser.
export const GET: RequestHandler = async ({ fetch, url }) => {
  const { doc } = await discover(fetch);

  const state = randomToken();
  const nonce = randomToken();
  const { verifier, challenge } = generatePkce();
  const returnTo = url.searchParams.get("returnTo") ?? "/";

  putPending(state, { nonce, codeVerifier: verifier, returnTo });

  redirect(
    302,
    buildAuthorizeUrl({
      authorizationEndpoint: doc.authorization_endpoint,
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: config.scope,
      state,
      nonce,
      codeChallenge: challenge,
    }),
  );
};
