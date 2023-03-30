<script lang="ts">
  import type { FlexDirection } from "@lib/types";

  export let direction: FlexDirection = "row";
</script>

<div
  {...$$restProps}
  class={$$restProps.class}
  style:display="flex"
  style:flex-direction={direction}
>
  <slot />
</div>
