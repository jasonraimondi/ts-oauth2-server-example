<script lang="ts">
  import { ACCESS_TOKEN, COOKIE_STORAGE } from "$lib/browser_storage";
  import { httpClient } from "$lib/http_client";
  import { CLIENT_ID } from "$lib/auth";
  import type { TokenResponse } from "$lib/types";

  let tokens = $state<TokenResponse | null>(null);
  let error = $state<string | null>(null);

  async function refresh() {
    error = null;
    const refreshToken = COOKIE_STORAGE.refreshToken.get();
    if (!refreshToken) {
      error = "No refresh token stored — log in first.";
      return;
    }

    try {
      const response = await httpClient
        .url("/api/oauth2/token")
        .post({
          grant_type: "refresh_token",
          client_id: CLIENT_ID,
          refresh_token: refreshToken,
        })
        .json<TokenResponse>();

      ACCESS_TOKEN.set(response.access_token);
      COOKIE_STORAGE.refreshToken.set(response.refresh_token);
      tokens = response;
    } catch (e) {
      error = `Refresh failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
</script>

<button onclick={refresh}>Refresh token</button>

{#if error}
  <p>{error}</p>
{/if}

{#if tokens}
  <pre><code>{JSON.stringify(tokens, null, 2)}</code></pre>
{/if}
