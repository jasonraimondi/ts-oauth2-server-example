<script lang="ts">
  import { onMount } from "svelte";
  import { CALLBACK_URL, CLIENT_ID } from "$lib/auth";
  import { httpClient } from "$lib/http_client";
  import { ACCESS_TOKEN, COOKIE_STORAGE, SESSION_STORAGE } from "$lib/browser_storage";
  import { goto } from "$app/navigation";
  import type { TokenResponse } from "$lib/types";

  let error = $state<string | null>(null);

  onMount(async () => {
    const url = new URL(window.location.href);

    // 1. The authorization server may redirect back with an error instead of a
    //    code (e.g. the user denied consent). Surface it before anything else.
    const errorParam = url.searchParams.get("error");
    if (errorParam) {
      const description = url.searchParams.get("error_description");
      error = description ? `${errorParam}: ${description}` : errorParam;
      return;
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    // Read and clear the one-time values stashed before the redirect.
    const storedState = SESSION_STORAGE.state.get();
    SESSION_STORAGE.state.remove();
    const storedVerifier = SESSION_STORAGE.verifier.get();
    SESSION_STORAGE.verifier.remove();

    // 2. Without a code there is nothing to exchange.
    if (!code) {
      error = "Missing authorization code in the callback URL.";
      return;
    }

    // 3. The state must match what we sent — this is the anti-CSRF check.
    if (!state || state !== storedState) {
      error = "State mismatch — the login response could not be verified. Please try again.";
      return;
    }

    if (!storedVerifier) {
      error = "Missing PKCE verifier — please restart the login flow.";
      return;
    }

    // 4. Exchange the code for tokens. A public PKCE client sends NO secret.
    try {
      const json = await httpClient
        .url("/api/oauth2/token")
        .post({
          grant_type: "authorization_code",
          code,
          client_id: CLIENT_ID,
          redirect_uri: CALLBACK_URL,
          code_verifier: storedVerifier,
        })
        .json<TokenResponse>();

      ACCESS_TOKEN.set(json.access_token);
      COOKIE_STORAGE.refreshToken.set(json.refresh_token);

      await goto("/", { replaceState: true });
    } catch (e) {
      error = `Token exchange failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
</script>

{#if error}
  <h1>Login failed</h1>
  <p>{error}</p>
  <p><a href="/login">Try again</a></p>
{:else}
  <p>Completing login…</p>
{/if}
