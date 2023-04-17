<script lang="ts">
  import {
    getAlignments,
    getFocusedRegion,
    listenForAlignmentsUpdateQueued,
    listenForAlignmentsUpdated,
    listenForRegionBuffering,
    listenForRegionPanned,
    listenForRegionZoomed,
  } from "@lib/backend";
  import type {
    AlignmentsClearedPayload,
    AlignmentsUpdatedPayload,
    FocusedRegionUpdatedPayload,
  } from "@lib/bindings";
  import { AlignedReadsScene } from "@lib/drawing/AlignedReadsScene";
  import { to0IndexedString } from "@lib/genomicCoordinates";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import { onDestroy, onMount } from "svelte";

  export let trackId: string;
  export let splitId: string;
  export let widthPct: number;

  let canvasWidth: number;
  let canvasHeight: number;
  let canvas: HTMLDivElement;
  let scene: AlignedReadsScene | null = null;
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

  onMount(async () => {
    scene = new AlignedReadsScene({
      canvas,
      dim: { width: canvasWidth, height: canvasHeight },
      styles: $USER_CONFIG_STORE!.styles,
    });
    handleCanvasResize();
    Promise.all([getAlignments({ trackId, splitId }), getFocusedRegion(splitId)]).then((values) => {
      LOG.debug(
        `Track=${trackId}, split=${splitId} received ${values[0].rows.length} rows of alignments from backend`
      );
      scene!.setState({ alignments: values[0], focusedRegion: values[1] });
      scene!.draw();
    });
  });

  onDestroy(async () => {
    scene?.destroy();
    LOG.debug("Destroyed AlignmentsView PIXI application");
  });

  const handleAlignmentsUpdated = (payload: AlignmentsUpdatedPayload): void => {
    if (scene !== null && splitId === payload.splitId && trackId === payload.trackId) {
      LOG.debug(
        `Handling alignments update (focusedRegion=${to0IndexedString(
          payload.focusedRegion
        )}, rows=${payload.alignments.rows.length})`
      );
      scene!.setState({ focusedRegion: payload.focusedRegion, alignments: payload.alignments });
    }
  };

  const handleAlignmentsCleared = (payload: AlignmentsClearedPayload): void => {
    // TODO Loading wheel
    if (payload.splitId === splitId) {
      scene?.clear();
    }
  };

  const handleAlignmentsPanned = (payload: FocusedRegionUpdatedPayload): void => {
    if (scene !== null && payload.splitId === splitId) {
      LOG.debug(`Panning alignments to ${to0IndexedString(payload.genomicRegion)}`);
      scene.setState({ focusedRegion: payload.genomicRegion });
    }
  };

  const handleAlignmentsZoomed = (payload: FocusedRegionUpdatedPayload): void => {
    if (payload.splitId === splitId) {
      LOG.debug(`Zooming alignments to ${to0IndexedString(payload.genomicRegion)}`);
      scene?.setState({ focusedRegion: payload.genomicRegion });
      scene?.draw();
    }
  };

  listenForAlignmentsUpdated((event) => {
    handleAlignmentsUpdated(event.payload);
    scene?.draw();
  });

  listenForAlignmentsUpdateQueued((event) => handleAlignmentsUpdated(event.payload));
  listenForRegionBuffering((event) => handleAlignmentsCleared(event.payload));
  listenForRegionPanned((event) => handleAlignmentsPanned(event.payload));
  listenForRegionZoomed((event) => handleAlignmentsZoomed(event.payload));
</script>

<div
  class="alignments-view"
  style:width={`${widthPct}%`}
  bind:offsetHeight={canvasHeight}
  bind:offsetWidth={canvasWidth}
>
  <div class="alignments-canvas" bind:this={canvas} />
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
