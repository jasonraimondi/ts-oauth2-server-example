<script lang="ts">
  import { onMount } from "svelte";
  import { CALLBACK_URL, CLIENT_ID } from "$lib/auth";
  import { httpClient } from "$lib/http_client";
  import {COOKIE_STORAGE, SESSION_STORAGE} from "$lib/browser_storage";
  import { goto } from "$app/navigation";
  import type { TokenResponse } from "$lib/types";

  onMount(async () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = SESSION_STORAGE.state.get();
    SESSION_STORAGE.state.remove();
    const storedVerifier = SESSION_STORAGE.verifier.get();
    SESSION_STORAGE.verifier.remove();

    if (state !== storedState) {
      throw new Error("State mismatch");
    }

    const json = await httpClient
      .url("/api/oauth2/token")
      .post({
        grant_type: "authorization_code",
        code,
        client_secret: null,
        client_id: CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        code_verifier: storedVerifier,
      })
      .json<TokenResponse>();

    // @todo refactor this dup in refresh/+page.svelte
    const expires = new Date(Date.now() + json.expires_in * 1000);
    console.log({ expires, expires_in: json.expires_in });
    COOKIE_STORAGE.accessToken.set(json.access_token, { expires });
    COOKIE_STORAGE.refreshToken.set(json.refresh_token);

    await goto("/", { replaceState: true });
  });
</script>

Hi Hi Hiya
