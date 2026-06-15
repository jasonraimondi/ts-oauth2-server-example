// Pages render client-side and talk to this app's own BFF endpoints (/api/*,
// /auth/*), which run server-side regardless of this flag. SSR is off so there's
// no server render step for the (auth-gated, fetch-driven) pages themselves.
export const ssr = false;
export const prerender = false;
