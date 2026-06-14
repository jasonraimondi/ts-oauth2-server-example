<script lang="ts">
  import type { LayoutProps } from "./$types";

  let { children }: LayoutProps = $props();
</script>

<nav>
  <a href="/">Home</a>
</nav>

{@render children()}
