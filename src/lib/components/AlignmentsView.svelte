<svelte:options immutable={true} />

<!--
  Wraps a PIXI application for rendering alignments in the split grid.

  Corresponds to a single 'cell' in the split grid (i.e a specific split in a specific track).
-->
<script lang="ts">
  import path from "path";

  import { onDestroy, onMount } from "svelte";

  import {
    getAlignments,
    getFocusedRegion,
    getGridFocus,
    listenForAlignmentsUpdateQueued,
    listenForAlignmentsUpdated,
    listenForGridFocusUpdated,
    listenForRegionBuffering,
    listenForRegionPanned,
    listenForRegionZoomed,
    updateGridFocus,
  } from "@lib/backend";
  import type {
    AlignmentStackKind,
    AlignmentsUpdatedPayload,
    FocusedRegionUpdatedPayload,
    GenomicRegion,
    GridCoord,
    RegionBufferingPayload,
  } from "@lib/bindings";
  import Spinner from "@lib/components/Spinner.svelte";
  import { AlignedReadsScene } from "@lib/drawing/AlignedReadsScene";
  import { to1IndexedString } from "@lib/genomicCoordinates";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import { defaultErrorHandler } from "@lib/errorHandling";
  import DisplayError from "@lib/components/DisplayError.svelte";

  export let trackId: string;
  export let splitId: string;
  export let filePath: string;

  // Width of the component as a percentage of the split grid's width
  export let widthPct: number;

  // Ref to the HTML canvas element that PIXI will render to
  let canvas: HTMLDivElement;

  // Canvas element dimensions in pixels
  let canvasWidth: number;
  let canvasHeight: number;

  let scene: AlignedReadsScene | null = null;

  // True if alignments are currently being loaded from the backend
  let isLoading: boolean = true;

  // At least one alignments view is always focused unless the focused view is destroyed. View
  // becomes focused either by being clicked, or by being the most recently opened view.
  let isFocused: boolean = false;

  let errorMsg: string | null = null;

  $: canvasWidth, canvasHeight, handleCanvasResize();

  /**
   * Render the currently loaded alignments to the screen.
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
      errorMsg = `Failed to draw alignments for ${path.basename(filePath)}`;
      defaultErrorHandler({
        msg: `Failed to draw alignments view: ${error}`,
        displayAlert: false,
        rethrowError: error,
      });
    }
  };

  /**
   * Update PIXI application state with new data from backend.
   */
  const updateData = ({
    alignments,
    focusedRegion,
  }: {
    alignments?: AlignmentStackKind;
    focusedRegion?: GenomicRegion;
  }): void => {
    if (scene === null) {
      return;
    }
    isLoading = false;
    try {
      window.requestAnimationFrame(() => {
        scene!.setState({ focusedRegion, alignments });
      });
      errorMsg = null;
    } catch (error) {
      errorMsg = `Failed to update alignments for ${path.basename(filePath)}`;
      defaultErrorHandler({
        msg: `Failed to update alignments view: ${error}`,
        alertMsg: `Failed to update alignments for ${path.basename(filePath)}`,
        rethrowError: error,
      });
    }
  };

  /**
   * Initialize the PIXI application which renders the alignments to the screen.
   */
  const initScene = (): void => {
    try {
      scene = new AlignedReadsScene({
        canvas,
        dim: { width: canvasWidth, height: canvasHeight },
        styles: $USER_CONFIG_STORE!.styles,
        handleClick,
      });
    } catch (error) {
      errorMsg = `Failed to initialize alignment viewer for ${path.basename(filePath)}`;
      defaultErrorHandler({
        msg: `Failed to initialize alignments view for track=${trackId}, split=${splitId}: ${error}`,
        displayAlert: false,
        rethrowError: error,
      });
    }
  };

  /**
   * If the canvas element is resized, the PIXI application needs to be resized as well
   */
  const handleCanvasResize = (): void => {
    if (scene === null) {
      return;
    }
    LOG.debug(`Detected window resize, resizing alignments view to ${canvasWidth}x${canvasHeight}`);

    try {
      scene.setState({
        viewportWidth: canvasWidth,
        viewportHeight: canvasHeight,
      });
      // In theory it might be more performant to rescale the viewport's width rather than
      // redrawing. This is a bit messy though because scaling logic is different for sprites vs
      // text objects (sprites need x to be rescaled but not y, text needs x and y scale to be
      // equal so that text isn't stretched).
      draw();
    } catch (error) {
      LOG.error(`Failed to resize alignments view: ${error}`);
    }
  };

  const handleClick = () => {
    updateGridFocus({ trackId, splitId }).catch((err) => {
      LOG.error(`Failed to update grid focus: ${err}`);
    });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (scene === null || document.activeElement?.tagName === "INPUT" || !isFocused) {
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        scene.scroll(0.1);
        break;
      case "ArrowUp": {
        scene.scroll(-0.1);
        break;
      }
    }
  };

  const handleGridFocusUpdate = (payload: GridCoord): void => {
    if (payload.trackId === trackId && payload.splitId === splitId && !isFocused) {
      isFocused = true;
    } else if ((payload.trackId !== trackId || payload.splitId !== splitId) && isFocused) {
      isFocused = false;
    }
  };

  const fetchInitialData = (): void => {
    Promise.all([
      getAlignments({ trackId, splitId }),
      getFocusedRegion(splitId),
      getGridFocus(),
    ]).then(([alignments, focusedRegion, gridFocus]) => {
      updateData({ alignments, focusedRegion });
      draw();
      handleGridFocusUpdate(gridFocus);
    });
  };

  const handleAlignmentsUpdated = (payload: AlignmentsUpdatedPayload): void => {
    if (scene !== null && splitId === payload.splitId && trackId === payload.trackId) {
      updateData({ alignments: payload.alignments, focusedRegion: payload.focusedRegion });
    }
  };

  const handleRegionBuffering = (payload: RegionBufferingPayload): void => {
    if (scene !== null && payload.splitId === splitId) {
      isLoading = true;
      scene.clear();
    }
  };

  const handleAlignmentsPanned = (payload: FocusedRegionUpdatedPayload): void => {
    if (scene !== null && payload.splitId === splitId) {
      LOG.debug(`Panning alignments to ${to1IndexedString(payload.genomicRegion)}`);
      updateData({ focusedRegion: payload.genomicRegion });
    }
  };

  const handleAlignmentsZoomed = (payload: FocusedRegionUpdatedPayload): void => {
    if (scene !== null && payload.splitId === splitId) {
      LOG.debug(`Zooming alignments to ${to1IndexedString(payload.genomicRegion)}`);
      updateData({ focusedRegion: payload.genomicRegion });
      // TODO Remove this draw call and just zoom the viewport instead
      // I've futzed around with updating this.viewport.scale but couldn't get it working.
      draw();
    }
  };

  listenForAlignmentsUpdated((event) => {
    handleAlignmentsUpdated(event.payload);
    draw();
  });

  listenForAlignmentsUpdateQueued((event) => handleAlignmentsUpdated(event.payload));
  listenForRegionBuffering((event) => handleRegionBuffering(event.payload));
  listenForRegionPanned((event) => handleAlignmentsPanned(event.payload));
  listenForRegionZoomed((event) => handleAlignmentsZoomed(event.payload));
  listenForGridFocusUpdated((event) => handleGridFocusUpdate(event.payload));

  onMount(async () => {
    initScene();
    fetchInitialData();
    window.addEventListener("keydown", handleKeyDown);
  });

  onDestroy(async () => {
    window.removeEventListener("keydown", handleKeyDown);
    scene?.destroy();
    LOG.debug("Destroyed AlignmentsView PIXI application");
  });
</script>

<div
  class="alignments-view"
  style:width={`${widthPct}%`}
  bind:offsetHeight={canvasHeight}
  bind:offsetWidth={canvasWidth}
>
  {#if errorMsg !== null}
    <DisplayError message={errorMsg} />
  {:else if isLoading}
    <Spinner />
  {/if}
  <div
    bind:this={canvas}
    class="alignments-canvas"
    style={isLoading ? "visibility:hidden" : "visibility:visible"}
  />
</div>

<style>
  .alignments-view {
    height: 100%;
    overflow: hidden;
  }

  .alignments-canvas {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
  }
</style>
