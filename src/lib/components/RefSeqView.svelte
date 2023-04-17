<script lang="ts">
  import { getFocusedSequence, listenForFocusedSequenceUpdated } from "@lib/backend";
  import type { FocusedSequenceUpdatedPayload } from "@lib/bindings";
  import { RefSeqScene } from "@lib/drawing/RefSeqScene";
  import { to1IndexedString } from "@lib/genomicCoordinates.js";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import { onDestroy, onMount } from "svelte";

  export let splitId: string;
  export let widthPct: number;

  let canvasWidth: number;
  let canvasHeight: number;
  let canvas: HTMLDivElement;
  let scene: RefSeqScene | null = null;

  $: canvasWidth, canvasHeight, handleCanvasResize();

  const handleFocusedSequenceUpdated = (payload: FocusedSequenceUpdatedPayload): void => {
    if (payload.splitId === splitId) {
      console.log("Handling sequence update...");
      LOG.debug(
        `split=${splitId} received new focused region (${to1IndexedString(
          payload.focusedRegion
        )}) from backend`
      );
      scene!.setState({
        focusedSequence: payload.focusedSequence,
        bufferedSequence: payload.bufferedSequence,
        focusedRegion: payload.focusedRegion,
        bufferedRegion: payload.bufferedRegion,
      });
      scene!.draw();
    }
  };

  const handleCanvasResize = () => {
    if (scene === null) {
      return;
    }
    LOG.debug("Detected window resize");
    scene.setState({ viewportWidth: canvasWidth });
    scene.draw();
  };

  onMount(async () => {
    scene = new RefSeqScene({
      canvas,
      dim: { width: canvasWidth, height: canvasHeight },
      styles: $USER_CONFIG_STORE!.styles,
    });
    getFocusedSequence(splitId).then((payload) => handleFocusedSequenceUpdated(payload));
  });

  onDestroy(async () => {
    scene?.destroy();
    LOG.debug("Destroyed RefSeqView PIXI application");
  });

  listenForFocusedSequenceUpdated((event) => handleFocusedSequenceUpdated(event.payload));
</script>

<div style:width={`${widthPct}%`} bind:offsetHeight={canvasHeight} bind:offsetWidth={canvasWidth}>
  <div bind:this={canvas} />
</div>
