<svelte:options immutable={true} />

<script lang="ts">
  import { onDestroy } from "svelte";

  import Alert from "@lib/components/Alert.svelte";
  import { ALERT_STORE, type AlertStatus } from "@lib/stores/AlertStore";

  let alerts: AlertStatus[];
  const unsubscribe = ALERT_STORE.subscribe((value) => {
    const activeAlerts = value.filter((alert) => alert.active);
    if (activeAlerts.length < 3) {
      alerts = activeAlerts;
    } else {
      alerts = activeAlerts.slice(value.length - 3, value.length);
    }
    return alerts;
  });

  onDestroy(unsubscribe);
</script>

<div class="alert-area">
  {#if alerts.length !== 0}
    <div class="alert-wrapper">
      {#each alerts as alert}
        {#if alert.active}
          <Alert {alert} />
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .alert-area {
    display: flex;
    flex-direction: column;
  }
  .alert-wrapper {
    width: 100%;
    position: absolute;
    bottom: 0;
    border-top: 1px solid var(--color-foreground);
  }
</style>
