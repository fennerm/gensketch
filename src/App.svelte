<svelte:options immutable={true} />

<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { initializeBackend, listenForUserConfigUpdated, panFocusedSplit } from "@lib/backend";
  import type { Direction, StyleConfig } from "@lib/bindings";
  import AlertArea from "@lib/components/AlertArea.svelte";
  import SplitGrid from "@lib/components/SplitGrid.svelte";
  import Toolbar from "@lib/components/Toolbar.svelte";
  import { defaultErrorHandler } from "@lib/errorHandling";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import { hexToString, monkeyPatchBigInt } from "@lib/util";

  // Maximum keyboard repeat rate for panning focused split. This is prevent the backend from
  // getting overwhelmed when arrow keys are held down.
  const keyRepeatRate = 50; // ms

  // Timestamp of last keydown event which was not ignored
  // Storing this as an array so that svelte doesn't rerender when the variable is updated. There
  // must be a better way to do this??
  let lastKeyTime = [0];

  /**
   * When the user config is updated in the backend, inject the styles into CSS variables.
   *
   * This allows us to reference the user's preferred theme from CSS.
   */
  const updateTheme = (styles: StyleConfig) => {
    for (let [prop, color] of Object.entries(styles.colors)) {
      let varString = `--color-${prop}`;
      document.documentElement.style.setProperty(varString, hexToString(color));
    }
    LOG.debug("Received updated user config, refreshing theme");
  };

  onMount(() => {
    initializeBackend().catch((error) =>
      defaultErrorHandler({
        msg: `Failed to initialize backend: ${error}`,
        alertMsg: `Gensketch failed to load. This is a bug. Error: ${error}`,
      })
    );
    monkeyPatchBigInt();
    window.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });

  /**
   * Handle keyboard events which are active across the entire app.
   */
  const handleKeyDown = (event: KeyboardEvent) => {
    const now = performance.now();
    if (now - lastKeyTime[0] < keyRepeatRate) {
      return;
    }
    lastKeyTime[0] = now;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        if (document.activeElement?.tagName === "INPUT") {
          return;
        }
        const direction = event.key.replace("Arrow", "") as Direction;
        LOG.debug(`Panning focused split ${direction}`);
        event.preventDefault();
        panFocusedSplit(direction).catch((err) => LOG.error(`Failed to pan split: ${err}`));
        break;
      }
    }
  };

  listenForUserConfigUpdated((event) => updateTheme(event.payload.styles));
</script>

<main class="app">
  {#if $USER_CONFIG_STORE !== null}
    <Toolbar />
    <SplitGrid />
    <AlertArea />
  {/if}
</main>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }
</style>
