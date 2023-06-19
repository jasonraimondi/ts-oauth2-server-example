<script>
  import { cookieStorageService } from '$lib/browser_storage';

  let accessToken = cookieStorageService.get("access_token")
  let refreshToken = cookieStorageService.get("refresh_token")
</script>

<p>Access Token: {accessToken}</p>
<p>Refresh Token: {refreshToken}</p>
