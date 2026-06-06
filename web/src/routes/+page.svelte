<script lang="ts">
  import { ACCESS_TOKEN, COOKIE_STORAGE } from "$lib/browser_storage";

  // The access token lives only in memory, so it is present right after login
  // but gone after a page reload (use Refresh token to mint a new one).
  let accessToken = ACCESS_TOKEN.get();
  let refreshToken = COOKIE_STORAGE.refreshToken.get();
</script>

<p>Access Token: {accessToken ?? "(none — in memory only, cleared on reload)"}</p>
<p>Refresh Token: {refreshToken ?? "(none)"}</p>
