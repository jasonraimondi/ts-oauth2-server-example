<script lang="ts">
  import { onMount } from 'svelte';
  import { cookieStorageService } from '$lib/browser_storage';
  import { httpClient } from '$lib/http_client';
  import { CLIENT_ID } from '$lib/auth';
  import type { TokenResponse } from "$lib/types";

  let foo: any = {};
  let refreshToken = cookieStorageService.get("refresh_token")

  onMount(async () => {
    const response = await httpClient.url("/api/oauth2/token").post({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }).json<TokenResponse>();

    cookieStorageService.set("access_token", response.access_token)
    cookieStorageService.set("refresh_token", response.refresh_token)
    foo = response;
  });
</script>

<pre><code>{JSON.stringify(foo, null, 2)}</code></pre>