<script lang="ts">
  import { page } from "$app/state";
</script>

<div class="brand">
  <span class="brand-mark" aria-hidden="true">oa</span>
  <span class="brand-name">BFF Demo</span>
</div>

<p class="status-code">{page.status}</p>
<h1>Something went wrong</h1>
<p class="lede" role="alert">{page.error?.message ?? "Unexpected error."}</p>
<a class="button" href="/" data-variant="secondary" style="align-self: flex-start">
  Back to the demo
</a>
