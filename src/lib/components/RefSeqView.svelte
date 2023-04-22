<script lang="ts">
  import { to1IndexedString } from "@lib/genomicCoordinates.js";
  import { onDestroy, onMount } from "svelte";

  import {
    getFocusedSequence,
    listenForFocusedSequenceUpdateQueued,
    listenForFocusedSequenceUpdated,
    listenForRegionBuffering,
    listenForRegionPanned,
    listenForRegionZoomed,
  } from "@lib/backend";
  import type {
    FocusedRegionUpdatedPayload,
    FocusedSequenceUpdatedPayload,
    RegionBufferingPayload,
  } from "@lib/bindings";
  import Spinner from "@lib/components/Spinner.svelte";
  import { RefSeqScene } from "@lib/drawing/RefSeqScene";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";

  export let splitId: string;
  export let widthPct: number;

  let canvasWidth: number;
  let canvasHeight: number;
  let canvas: HTMLDivElement;
  let scene: RefSeqScene | null = null;
  let isLoading: boolean = true;

  $: canvasWidth, canvasHeight, handleCanvasResize();

  const handleFocusedSequenceUpdated = (payload: FocusedSequenceUpdatedPayload): void => {
    if (payload.splitId === splitId) {
      isLoading = false;
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

  const handleRegionBuffering = (payload: RegionBufferingPayload): void => {
    if (payload.splitId === splitId) {
      isLoading = true;
      scene?.clear();
    }
  };

  onMount(async () => {
    LOG.debug(`Initializing ${canvasWidth}x${canvasHeight} RefSeqScene`);
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

  const handleFocusedRegionPanned = (payload: FocusedRegionUpdatedPayload): void => {
    if (scene !== null && payload.splitId === splitId) {
      LOG.debug(`Panning focused sequence to ${to1IndexedString(payload.genomicRegion)}`);
      isLoading = false;
      scene.setState({ focusedRegion: payload.genomicRegion });
    }
  };

  const handleFocusedRegionZoomed = (payload: FocusedRegionUpdatedPayload): void => {
    if (payload.splitId === splitId) {
      LOG.debug(`Zooming focused sequence to ${to1IndexedString(payload.genomicRegion)}`);
      isLoading = false;
      scene?.setState({ focusedRegion: payload.genomicRegion });
      scene?.draw();
    }
  };

  listenForFocusedSequenceUpdated((event) => {
    handleFocusedSequenceUpdated(event.payload);
    scene?.draw();
  });
  listenForRegionBuffering((event) => handleRegionBuffering(event.payload));
  listenForFocusedSequenceUpdateQueued((event) => handleFocusedSequenceUpdated(event.payload));
  listenForRegionPanned((event) => handleFocusedRegionPanned(event.payload));
  listenForRegionZoomed((event) => handleFocusedRegionZoomed(event.payload));
</script>

<div
  style:width={`${widthPct}%`}
  style:height="100%"
  bind:offsetHeight={canvasHeight}
  bind:offsetWidth={canvasWidth}
>
  {#if isLoading}
    <Spinner />
  {/if}
  <div
    class="refseq-canvas"
    bind:this={canvas}
    style={isLoading ? "visibility:hidden" : "visibility:visible"}
  />
</div>

<style>
</style>
