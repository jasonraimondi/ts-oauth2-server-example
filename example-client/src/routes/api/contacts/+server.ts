import type { RequestHandler } from "@sveltejs/kit";

import { config, contactsEndpoint, discover } from "$lib/server/config";
import { handleContacts } from "$lib/server/handlers";

export const GET: RequestHandler = ({ fetch, cookies, locals }) =>
  handleContacts({
    fetch,
    cookies,
    sid: locals.sid,
    session: locals.session,
    config,
    contactsEndpoint: contactsEndpoint(),
    discover: () => discover(fetch),
  });
