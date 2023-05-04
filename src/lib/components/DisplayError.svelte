<!-- Modal displayed when another svelte component encounters an unrecoverable error. -->
<svelte:options immutable={true} />

<script lang="ts">
  import Icon from "@iconify/svelte";

  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import { hexToString } from "@lib/util";

  export let message: string;

  let color = hexToString($USER_CONFIG_STORE!.styles.colors.error);
</script>

<div class="error-wrapper">
  <div class="error-box">
    <Icon icon="ic:outline-error" width="60" {color} style="margin-right: 0.5em" />
    {message}
  </div>
</div>

<style>
  .error-box {
    display: flex;
    padding: 1em 2em;
    justify-content: center;
    align-items: center;
    background-color: var(--color-errorBackground);
    border-radius: 0.25em;
    box-shadow: 0.1em 0.1em 0.2em rgba(0, 0, 0, 0.15);
  }

  .error-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }
</style>
