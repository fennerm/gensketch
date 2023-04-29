<!-- The primary area where genomic data is displayed.default

The split grid is divided vertically into multiple splits and divided horizontally into multiple 
tracks. For each split x track combination there is a view which displays genomic data.

-->
<svelte:options immutable={true} />

<script lang="ts">
  import _ from "lodash";
  import { afterUpdate, onMount } from "svelte";

  import { getSplits, listenForSplitAdded, listenForTrackAdded } from "@lib/backend";
  import type { AlignmentTrackData, SplitData } from "@lib/bindings";
  import RefSeqArea from "@lib/components/RefSeqArea.svelte";
  import type { DividerDragHandler, SplitState, TrackState } from "@lib/components/SplitGrid.types";
  import SplitToolbar from "@lib/components/SplitToolbar.svelte";
  import TrackArea from "@lib/components/TrackArea.svelte";
  import { DIVIDER_PX } from "@lib/constants";
  import { loadPixiAssets } from "@lib/drawing/drawing";
  import LOG from "@lib/logger";
  import { defaultErrorHandler } from "@lib/errorHandling";
  import DisplayError from "@lib/components/DisplayError.svelte";
  import Spinner from "@lib/components/Spinner.svelte";

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

  /**
   * Adjust a set of track/split dimensions based on the position of a divider that was dragged
   *
   * @param currentDimensions - The current dimensions of the tracks/splits as percentages
   * @param dividerIndex - The index of the divider that was dragged
   * @param mousePosPct - The mouse position as a percentage of the track area
   * */
  const adjustDimensions = ({
    currentDimensions,
    dividerIndex,
    mousePosPct,
  }: {
    readonly currentDimensions: number[];
    dividerIndex: number;
    mousePosPct: number;
  }): number[] => {
    // E.g start splits with dimensions = [33%, 33%, 33%]
    // - Divider 0 moved to 10%
    // - Set split 0 width to 10%
    // - Set other split widths to (33 - 23/2)%

    // Calculate a cumulative sum of the splits/tracks up to the current one. This is used to
    // determine where the mouse is in relation to the current split/track.
    const cumSumDim = _.sum(currentDimensions.slice(0, dividerIndex + 1));

    // The percentage to reduce the affected split/track by. The remaining splits/tracks will be
    // reduced by an equal fraction of this amount.
    let diff = mousePosPct - cumSumDim + (DIVIDER_PX / window.innerHeight) * 100;

    // Make sure that the split/track being resized doesn't go below the minimum size
    if (currentDimensions[dividerIndex] + diff < minCellPct) {
      diff = minCellPct - currentDimensions[dividerIndex];
    } else if (currentDimensions[dividerIndex + 1] - diff < minCellPct) {
      diff = currentDimensions[dividerIndex + 1] - minCellPct;
    }
    const newDimensions = _.map(currentDimensions, (dim, dimIndex) => {
      if (dimIndex === dividerIndex) {
        return dim + diff;
      } else if (dimIndex === dividerIndex + 1) {
        return dim - diff;
      } else {
        return dim;
      }
    });
    return newDimensions;
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
    const currentDimensions = _.map(tracks, (track) => track.heightPct);
    const updatedTrackHeights = adjustDimensions({
      mousePosPct,
      dividerIndex,
      currentDimensions,
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
    const currentDimensions = _.map(splits, (split) => split.widthPct);
    const updatedSplitWidths = adjustDimensions({
      mousePosPct,
      dividerIndex,
      currentDimensions,
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
