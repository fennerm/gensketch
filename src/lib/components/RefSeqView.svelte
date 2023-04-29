<!--
  Wraps a PIXI application for rendering the reference sequence for a split in the split grid.
-->

<script lang="ts">
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
    GenomicRegion,
    RegionBufferingPayload,
  } from "@lib/bindings";
  import Spinner from "@lib/components/Spinner.svelte";
  import { RefSeqScene } from "@lib/drawing/RefSeqScene";
  import { defaultErrorHandler } from "@lib/errorHandling";
  import { to1IndexedString } from "@lib/genomicCoordinates";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";

  export let splitId: string;
  export let widthPct: number;

  // Ref to the HTML canvas element that PIXI will render to
  let canvas: HTMLDivElement;

  // Canvas element dimensions in pixels
  let canvasWidth: number;
  let canvasHeight: number;

  let scene: RefSeqScene | null = null;
  let isLoading: boolean = true;

  $: canvasWidth, canvasHeight, handleCanvasResize();

  /**
   * Render the currently loaded reference sequence to the screen.
   */
  const draw = (): void => {
    if (scene === null) {
      return;
    }
    try {
      window.requestAnimationFrame(() => {
        scene!.draw();
      });
    } catch (error) {
      defaultErrorHandler({
        msg: `Failed to render reference sequence: ${error}`,
        alertMsg: `Failed to render reference sequence`,
        rethrowError: error,
      });
    }
  };

  /**
   * Update PIXI application state with new data from backend.
   */
  const updateData = ({
    focusedSequence,
    bufferedSequence,
    focusedRegion,
    bufferedRegion,
    viewportWidth,
  }: {
    focusedSequence?: string | null;
    bufferedSequence?: string | null;
    focusedRegion?: GenomicRegion;
    bufferedRegion?: GenomicRegion;
    viewportWidth?: number;
  }): void => {
    isLoading = false;
    try {
      window.requestAnimationFrame(() => {
        scene!.setState({
          focusedSequence,
          bufferedSequence,
          focusedRegion,
          bufferedRegion,
          viewportWidth,
        });
      });
    } catch (error) {
      defaultErrorHandler({
        msg: `Failed to update alignments view: ${error}`,
        alertMsg: `Failed to render reference sequence`,
        rethrowError: error,
      });
    }
  };

  /**
   * Initialize the PIXI application which renders the alignments to the screen.
   */
  const initScene = (): void => {
    try {
      LOG.debug(`Initializing ${canvasWidth}x${canvasHeight} RefSeqScene`);
      scene = new RefSeqScene({
        canvas,
        dim: { width: canvasWidth, height: canvasHeight },
        styles: $USER_CONFIG_STORE!.styles,
      });
    } catch (error) {
      defaultErrorHandler({
        msg: `Failed to initialize reference sequence view for split=${splitId}: ${error}`,
        alertMsg: `Failed to display reference sequence`,
        rethrowError: error,
      });
    }
  };

  const handleFocusedSequenceUpdated = (payload: FocusedSequenceUpdatedPayload): void => {
    if (payload.splitId === splitId) {
      LOG.debug(
        `split=${splitId} received new focused region (${to1IndexedString(
          payload.focusedRegion
        )}) from backend`
      );
      updateData({
        focusedSequence: payload.focusedSequence,
        bufferedSequence: payload.bufferedSequence,
        focusedRegion: payload.focusedRegion,
        bufferedRegion: payload.bufferedRegion,
      });
      draw();
    }
  };

  const handleCanvasResize = () => {
    if (scene === null) {
      return;
    }
    LOG.debug(`Detected window resize, resizing refseq view to width=${canvasWidth}`);
    updateData({ viewportWidth: canvasWidth });
    draw();
  };

  const handleRegionBuffering = (payload: RegionBufferingPayload): void => {
    if (scene !== null && payload.splitId === splitId) {
      isLoading = true;
      scene.clear();
    }
  };

  onMount(async () => {
    initScene();
    getFocusedSequence(splitId)
      .then((payload) => handleFocusedSequenceUpdated(payload))
      .catch((error) => {
        defaultErrorHandler({
          msg: `Failed to load reference sequence for split=${splitId}: ${error}`,
          alertMsg: `Failed to load reference sequence`,
        });
      });
  });

  onDestroy(async () => {
    scene?.destroy();
    LOG.debug("Destroyed RefSeqView PIXI application");
  });

  const handleFocusedRegionPanned = (payload: FocusedRegionUpdatedPayload): void => {
    if (scene !== null && payload.splitId === splitId) {
      LOG.debug(`Panning focused sequence to ${to1IndexedString(payload.genomicRegion)}`);
      updateData({ focusedRegion: payload.genomicRegion });
    }
  };

  const handleFocusedRegionZoomed = (payload: FocusedRegionUpdatedPayload): void => {
    if (payload.splitId === splitId) {
      LOG.debug(`Zooming focused sequence to ${to1IndexedString(payload.genomicRegion)}`);
      updateData({ focusedRegion: payload.genomicRegion });
      draw();
    }
  };

  listenForFocusedSequenceUpdated((event) => handleFocusedSequenceUpdated(event.payload));
  listenForRegionBuffering((event) => handleRegionBuffering(event.payload));
  listenForFocusedSequenceUpdateQueued((event) => handleFocusedSequenceUpdated(event.payload));
  listenForRegionPanned((event) => handleFocusedRegionPanned(event.payload));
  listenForRegionZoomed((event) => handleFocusedRegionZoomed(event.payload));
</script>

<div
  class="refseq-view"
  style:width={`${widthPct}%`}
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
  .refseq-view {
    height: 100%;
    overflow: hidden;
  }
</style>
