<script lang="ts">
  import { onMount } from "svelte";
  import { COOKIE_STORAGE } from "$lib/browser_storage";
  import { httpClient } from "$lib/http_client";
  import { CLIENT_ID } from "$lib/auth";
  import type { TokenResponse } from "$lib/types";

  let foo: any = {};
  let refreshToken = COOKIE_STORAGE.refreshToken.get();

  onMount(async () => {
    const response = await httpClient
      .url("/api/oauth2/token")
      .post({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      })
      .json<TokenResponse>();

    const expires = new Date(Date.now() + response.expires_in * 1000);
    console.log({ expires, expires_in: response.expires_in });
    COOKIE_STORAGE.accessToken.set(response.access_token, { expires });
    COOKIE_STORAGE.refreshToken.set(response.refresh_token);

    foo = response;
  });
</script>

<pre><code>{JSON.stringify(foo, null, 2)}</code></pre>
