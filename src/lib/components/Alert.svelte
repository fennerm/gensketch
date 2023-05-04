<!-- An alert for the user to be displayed in the alert area.-->
<svelte:options immutable={true} />

<script lang="ts">
  import Icon from "@iconify/svelte";

  import Spinner from "@lib/components/Spinner.svelte";
  import { ALERT_STORE, type AlertStatus } from "@lib/stores/AlertStore";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import { hexToString } from "@lib/util";

  export let alert: AlertStatus;

  const errorColor = hexToString($USER_CONFIG_STORE!.styles.colors.error);
</script>

<div class="alert">
  {#if alert.status === "error"}
    <Icon icon="ic:outline-error" color={errorColor} width="40" style="margin-right: 0.5em" />
  {:else if alert.status === "inProgress"}
    <Spinner size="30" style="margin-right: 0.5em" />
  {/if}
  <div color="#000000">{alert.message}</div>
  <button class="close-button" on:click={() => ALERT_STORE.deactivateAlert(alert.id)}>
    <Icon icon="material-symbols:close" width="40" />
  </button>
</div>

<style>
  .alert {
    width: 100%;
    display: flex;
    padding: 0.25em 0.5em;
    border-top: 1px solid var(--color-lightForeground);
    justify-content: center;
    align-items: center;
  }

  .close-button {
    background-color: transparent;
    border: 0;
    cursor: pointer;
    position: absolute;
    right: 2em;
  }
</style>
