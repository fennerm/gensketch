<script lang="ts">
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
    AlignmentsUpdatedPayload,
    FocusedRegionUpdatedPayload,
    GridCoord,
    RegionBufferingPayload,
  } from "@lib/bindings";
  import Spinner from "@lib/components/Spinner.svelte";
  import { AlignedReadsScene } from "@lib/drawing/AlignedReadsScene";
  import { to1IndexedString } from "@lib/genomicCoordinates";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";

  export let trackId: string;
  export let splitId: string;
  export let widthPct: number;

  let canvasWidth: number;
  let canvasHeight: number;
  let canvas: HTMLDivElement;
  let scene: AlignedReadsScene | null = null;
  let isLoading: boolean = true;
  let isFocused: boolean = false;
  $: canvasWidth, canvasHeight, handleCanvasResize();

  const handleCanvasResize = () => {
    if (scene === null) {
      return;
    }
    LOG.debug("Detected window resize");
    scene.setState({
      viewportWidth: canvasWidth,
      viewportHeight: canvasHeight,
    });
    scene.draw();
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

  onMount(async () => {
    scene = new AlignedReadsScene({
      canvas,
      dim: { width: canvasWidth, height: canvasHeight },
      styles: $USER_CONFIG_STORE!.styles,
      handleClick,
    });
    handleCanvasResize();
    Promise.all([
      getAlignments({ trackId, splitId }),
      getFocusedRegion(splitId),
      getGridFocus(),
    ]).then((values) => {
      LOG.debug(
        `Track=${trackId}, split=${splitId} received ${values[0].rows.length} rows of alignments from backend`
      );
      isLoading = false;
      scene!.setState({ alignments: values[0], focusedRegion: values[1] });
      scene!.draw();
      handleGridFocusUpdate(values[2]);
    });
    window.addEventListener("keydown", handleKeyDown, false);
  });

  onDestroy(async () => {
    scene?.destroy();
    LOG.debug("Destroyed AlignmentsView PIXI application");
    window.removeEventListener("keydown", handleKeyDown, false);
  });

  const handleAlignmentsUpdated = (payload: AlignmentsUpdatedPayload): void => {
    if (scene !== null && splitId === payload.splitId && trackId === payload.trackId) {
      LOG.debug(
        `Handling alignments update (focusedRegion=${to1IndexedString(
          payload.focusedRegion
        )}, rows=${payload.alignments.rows.length})`
      );
      isLoading = false;
      scene!.setState({ focusedRegion: payload.focusedRegion, alignments: payload.alignments });
    }
  };

  const handleRegionBuffering = (payload: RegionBufferingPayload): void => {
    if (payload.splitId === splitId) {
      isLoading = true;
      scene?.clear();
    }
  };

  const handleAlignmentsPanned = (payload: FocusedRegionUpdatedPayload): void => {
    if (scene !== null && payload.splitId === splitId) {
      LOG.debug(`Panning alignments to ${to1IndexedString(payload.genomicRegion)}`);
      isLoading = false;
      scene.setState({ focusedRegion: payload.genomicRegion });
    }
  };

  const handleAlignmentsZoomed = (payload: FocusedRegionUpdatedPayload): void => {
    if (payload.splitId === splitId) {
      LOG.debug(`Zooming alignments to ${to1IndexedString(payload.genomicRegion)}`);
      isLoading = false;
      scene?.setState({ focusedRegion: payload.genomicRegion });
      scene?.draw();
    }
  };

  const handleGridFocusUpdate = (payload: GridCoord): void => {
    if (payload.trackId === trackId && payload.splitId === splitId && !isFocused) {
      isFocused = true;
    } else if ((payload.trackId !== trackId || payload.splitId !== splitId) && isFocused) {
      isFocused = false;
    }
  };

  listenForAlignmentsUpdated((event) => {
    handleAlignmentsUpdated(event.payload);
    scene?.draw();
  });

  listenForAlignmentsUpdateQueued((event) => handleAlignmentsUpdated(event.payload));
  listenForRegionBuffering((event) => handleRegionBuffering(event.payload));
  listenForRegionPanned((event) => handleAlignmentsPanned(event.payload));
  listenForRegionZoomed((event) => handleAlignmentsZoomed(event.payload));
  listenForGridFocusUpdated((event) => handleGridFocusUpdate(event.payload));
</script>

<div
  class="alignments-view"
  style:width={`${widthPct}%`}
  bind:offsetHeight={canvasHeight}
  bind:offsetWidth={canvasWidth}
>
  {#if isLoading}
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
