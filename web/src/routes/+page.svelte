<script>
  import { COOKIE_STORAGE } from "$lib/browser_storage";

  let accessToken = COOKIE_STORAGE.accessToken.get();
  let refreshToken = COOKIE_STORAGE.refreshToken.get();
</script>

<p>Access Token: {accessToken}</p>
<p>Refresh Token: {refreshToken}</p>
