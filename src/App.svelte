<script lang="ts">
  import { onMount } from "svelte";

  import { initializeBackend, listenForUserConfigUpdated, panFocusedSplit } from "@lib/backend";
  import type { Direction, StyleConfig } from "@lib/bindings";
  import SplitGrid from "@lib/components/SplitGrid.svelte";
  import Toolbar from "@lib/components/Toolbar.svelte";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import { monkeyPatchBigInt } from "@lib/util";

  const updateTheme = (styles: StyleConfig) => {
    for (let [prop, color] of Object.entries(styles.colors)) {
      let varString = `--color-${prop}`;
      document.documentElement.style.setProperty(varString, `#${color.toString(16)}`);
    }
    LOG.debug("Received updated user config, refreshing theme");
  };

  onMount(() => {
    initializeBackend().catch((err) => LOG.error(err));
    monkeyPatchBigInt();
    window.addEventListener("keydown", handleKeyDown, false);
  });

  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        if (document.activeElement?.tagName === "INPUT") {
          return;
        }
        const direction = event.key.replace("Arrow", "") as Direction;
        LOG.debug(`Panning focused split ${direction}`);
        event.preventDefault();
        panFocusedSplit(direction).catch((err) => LOG.error(err));
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
