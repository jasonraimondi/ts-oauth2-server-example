import { dev } from "$app/environment";
import type { RequestHandler } from "@sveltejs/kit";

import { config, discover } from "$lib/server/config";
import { handleCallback } from "$lib/server/handlers";

export const GET: RequestHandler = ({ fetch, url, cookies }) =>
  handleCallback({
    url,
    fetch,
    cookies,
    secureCookie: !dev,
    config,
    discover: () => discover(fetch),
  });
