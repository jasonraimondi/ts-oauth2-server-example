<script lang="ts">
  import { onMount } from "svelte";
  import { CALLBACK_URL, CLIENT_ID, createAuth } from "$lib/auth";
  import { SESSION_STORAGE } from "$lib/browser_storage";

  const url = new URL("http://localhost:5173/api/oauth2/authorize");

  onMount(async () => {
    const { state, verifier, challenge } = await createAuth();
    SESSION_STORAGE.state.set(state);
    SESSION_STORAGE.verifier.set(verifier);
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", CALLBACK_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    window.location.replace(url.href);
  });
</script>

Redirecting to login...

<a href={url}>{url}</a>
