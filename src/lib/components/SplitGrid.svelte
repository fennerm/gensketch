<!-- The primary area where genomic data is displayed.default

The split grid is divided vertically into multiple splits and divided horizontally into multiple 
tracks. For each split x track combination there is a view which displays genomic data.

-->
<svelte:options immutable={true} />

<script lang="ts">
  import { map } from "lodash";
  import { afterUpdate, onMount } from "svelte";

  import { getSplits, listenForSplitAdded, listenForTrackAdded } from "@lib/backend";
  import type { AlignmentTrackData, SplitData } from "@lib/bindings";
  import DisplayError from "@lib/components/DisplayError.svelte";
  import RefSeqArea from "@lib/components/RefSeqArea.svelte";
  import Spinner from "@lib/components/Spinner.svelte";
  import type { DividerDragHandler, SplitState, TrackState } from "@lib/components/SplitGrid.types";
  import SplitToolbar from "@lib/components/SplitToolbar.svelte";
  import TrackArea from "@lib/components/TrackArea.svelte";
  // import { DIVIDER_PX } from "@lib/constants";
  import { loadPixiAssets } from "@lib/drawing/drawing";
  import { defaultErrorHandler } from "@lib/errorHandling";
  import LOG from "@lib/logger";
  import { adjustDimensions } from "@lib/util";

  // Minimum size that a split or track can be resized as percent of the split grid
  const minCellPct = 2;

  let trackArea: HTMLDivElement;
  let splits: SplitState[] = [];
  let tracks: TrackState[] = [];
  let trackAreaHeight: number;
  let gridWidth: number;

  // Number of pixels from the top of the window to the top of the track area
  let trackAreaOffsetTop: number;

  // Number of pixels from the left of the window to the left of the track area
  let trackAreaOffsetLeft: number;

  // True if PIXi assets have been loaded
  let assetsLoaded: boolean = false;

  let errorMsg: string | null = null;

  const handleNewSplit = (newSplit: SplitData): void => {
    LOG.debug(`Received new split data from backend: ${JSON.stringify(newSplit)}`);
    const newSplitWidth = 100 / (splits.length + 1);
    splits.forEach((split) => {
      split.widthPct = split.widthPct - newSplitWidth / splits.length;
    });
    const newSplitState: SplitState = {
      ...newSplit,
      widthPct: newSplitWidth,
    };
    LOG.debug(`Updating UI with new split: ${JSON.stringify(newSplitState)}`);
    splits = [...splits, newSplitState];
  };

  const loadInitialData = (): void => {
    getSplits()
      .then((splits) => {
        splits.map((split) => handleNewSplit(split));
      })
      .catch((error) => {
        errorMsg = `Failed to load main display area`;
        defaultErrorHandler({
          msg: `Failed to load splits: ${error}`,
          displayAlert: false,
          rethrowError: error,
        });
      });
  };

  const loadAssets = (): void => {
    loadPixiAssets();
    assetsLoaded = true;
  };

  const handleNewTrack = (newTrack: AlignmentTrackData): void => {
    LOG.debug(`Received new track data from backend: ${JSON.stringify(newTrack)}`);
    const newTrackHeight = 100 / (tracks.length + 1);
    tracks.forEach((track) => {
      track.heightPct = track.heightPct - newTrackHeight / tracks.length;
    });
    const newTrackState: TrackState = {
      ...newTrack,
      heightPct: newTrackHeight,
    };
    tracks = [...tracks, newTrackState];
    LOG.debug(`Updating UI with new track: ${JSON.stringify(newTrackState)}`);
  };

  const getMouseYPosPct = (mouseYPos: number) => {
    return ((mouseYPos - trackAreaOffsetTop) / trackAreaHeight) * 100;
  };

  const getMouseXPosPct = (mouseXPos: number) => {
    return ((mouseXPos - trackAreaOffsetLeft) / gridWidth) * 100;
  };

  const setSplitWidths = (widths: readonly number[]): void => {
    splits.map((split, index) => {
      split.widthPct = widths[index];
    });
    splits = [...splits];
  };

  const setTrackHeights = (heights: readonly number[]): void => {
    tracks.map((track, index) => {
      track.heightPct = heights[index];
    });
    tracks = [...tracks];
  };

  const handleHorizontalDividerDrag: DividerDragHandler = ({ mousePos, dividerIndex }) => {
    const mousePosPct = getMouseYPosPct(mousePos.y);
    const currentDimensions = map(tracks, (track) => track.heightPct);
    const updatedTrackHeights = adjustDimensions({
      dimensions: currentDimensions,
      targetPos: mousePosPct,
      targetIndex: dividerIndex,
      minDim: minCellPct,
    });
    LOG.debug(
      `Handling divider drag event: mousePos=${mousePos.y}; ` +
        `windowHeight=${window.innerHeight}; mousePosPct=${mousePosPct}; ` +
        `initialTrackHeights=${currentDimensions} updatedTrackHeights=${updatedTrackHeights}`
    );
    setTrackHeights(updatedTrackHeights);
  };

  const handleVerticalDividerDrag: DividerDragHandler = ({ mousePos, dividerIndex }) => {
    const mousePosPct = getMouseXPosPct(mousePos.x);
    const currentDimensions = map(splits, (split) => split.widthPct);
    const updatedSplitWidths = adjustDimensions({
      dimensions: currentDimensions,
      targetPos: mousePosPct,
      targetIndex: dividerIndex,
      minDim: minCellPct,
    });
    LOG.debug(
      `Handling divider drag event: mousePos=${mousePos.x}; ` +
        `windowWidth=${window.innerWidth}; mousePosPct=${mousePosPct}; ` +
        `initialSplitWidths=${currentDimensions} updatedSplitWidths=${updatedSplitWidths}`
    );
    setSplitWidths(updatedSplitWidths);
  };

  listenForSplitAdded((event) => handleNewSplit(event.payload));
  listenForTrackAdded((event) => handleNewTrack(event.payload));

  onMount(async () => {
    loadAssets();
    loadInitialData();
  });

  afterUpdate(() => {
    if (trackArea !== undefined) {
      trackAreaOffsetLeft = trackArea.offsetLeft;
      trackAreaOffsetTop = trackArea.offsetTop;
    }
  });
</script>

<div class="split-grid fill-parent">
  {#if errorMsg !== null}
    <DisplayError message={errorMsg} />
  {:else if !assetsLoaded}
    <Spinner />
  {:else}
    <SplitToolbar {splits} {handleVerticalDividerDrag} />
    <RefSeqArea {splits} {handleVerticalDividerDrag} />
    <div
      class="fill-parent"
      bind:this={trackArea}
      bind:offsetHeight={trackAreaHeight}
      bind:offsetWidth={gridWidth}
    >
      <TrackArea {tracks} {splits} {handleHorizontalDividerDrag} {handleVerticalDividerDrag} />
    </div>
  {/if}
</div>

<style>
  .fill-parent {
    width: 100%;
    height: 100%;
  }

  .split-grid {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
  }
</style>
