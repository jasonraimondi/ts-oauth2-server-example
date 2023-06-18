<script>
  import { onMount } from "svelte";
  import { challengeFromVerifier, genRandomString } from "../lib/auth";

  let verifier = "";
  let challenge = "";
  let state = "";
  let loginUrl = "";

  onMount(async () => {
    state = genRandomString(10);
    verifier = genRandomString(80);
    challenge = await challengeFromVerifier(verifier);

    const url = new URL("http://localhost:5173/api/oauth2/authorize");
    url.searchParams.set("client_id", "0e2ec2df-ee53-4327-a472-9d78c278bdbb");
    url.searchParams.set("redirect_uri", "http://localhost:5173/callback");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    loginUrl = url.toString();
  });


</script>

<h1>Welcome to SvelteKit</h1>

<pre><code>{JSON.stringify({ state, verifier, challenge }, null, 2)}</code></pre>

<a href={loginUrl}>Login</a>
