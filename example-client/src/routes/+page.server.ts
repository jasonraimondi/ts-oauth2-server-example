import { redirect } from "@sveltejs/kit";

import { config, discover, revocationEndpoint } from "$lib/server/config";
import { handleLogout } from "$lib/server/handlers";

import type { Actions, PageServerLoad } from "./$types";

// Identity comes from the server-side session the hook already resolved, so the
// page renders signed-in on the first paint with no client-side identity fetch.
// Never returns tokens.
export const load: PageServerLoad = ({ locals, url }) => ({
  user: locals.session?.user ?? null,
  authError: url.searchParams.get("auth_error"),
});

export const actions: Actions = {
  logout: async ({ fetch, cookies, locals }) => {
    await handleLogout({
      fetch,
      cookies,
      sid: locals.sid,
      session: locals.session,
      config,
      revocationUrl: async () => revocationEndpoint((await discover(fetch)).doc),
    });
    redirect(303, "/");
  },
};
