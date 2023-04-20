<script lang="ts">
  import { getSplits, listenForSplitAdded, listenForTrackAdded } from "@lib/backend";
  import type { AlignmentTrackData, SplitData } from "@lib/bindings";
  import RefSeqArea from "@lib/components/RefSeqArea.svelte";
  import type { DividerDragHandler } from "@lib/components/SplitGrid.types";
  import type { SplitState, TrackState } from "@lib/components/SplitGrid.types";
  import SplitToolbar from "@lib/components/SplitToolbar.svelte";
  import TrackArea from "@lib/components/TrackArea.svelte";
  import { DIVIDER_PX } from "@lib/constants";
  import { loadPixiAssets } from "@lib/drawing/drawing";
  import LOG from "@lib/logger";
  import { sum } from "@lib/util";
  import { SvelteComponent, afterUpdate, onMount } from "svelte";

  // Minimum size that a split or track can be resized as percent of the split grid
  const minCellPct = 2;

  let trackArea: SvelteComponent;
  let splits: SplitState[] = [];
  let tracks: TrackState[] = [];
  let trackAreaHeight: number;
  let gridWidth: number;
  let offsetTop: number;
  let offsetLeft: number;
  let assetsLoaded: boolean = false;

  onMount(async () => {
    loadPixiAssets();
    assetsLoaded = true;
    getSplits().then((splits) => {
      splits.map((split) => handleNewSplit(split));
    });
  });

  const handleNewTrack = (newTrack: AlignmentTrackData): void => {
    LOG.debug(`Handling track-added event: ${JSON.stringify(newTrack)}`);
    const numTracks = tracks.length;
    const newTrackHeight = 100 / (numTracks + 1);
    tracks.map((track) => {
      track.heightPct = track.heightPct - newTrackHeight / numTracks;
    });
    const newTrackState: TrackState = {
      ...newTrack,
      heightPct: newTrackHeight,
    };
    tracks = [...tracks, newTrackState];
    LOG.debug(`Updating UI with new track: ${JSON.stringify(newTrackState)}`);
  };

  const handleNewSplit = (newSplit: SplitData): void => {
    LOG.debug(`Handling spit-added event: ${JSON.stringify(newSplit)}`);
    const numSplits = splits.length;
    const newSplitWidth = 100 / (numSplits + 1);
    splits.map((split) => {
      split.widthPct = split.widthPct - newSplitWidth / numSplits;
    });
    const newSplitState: SplitState = {
      id: newSplit.id,
      widthPct: newSplitWidth,
      focusedRegion: newSplit.focusedRegion,
      bufferedRegion: newSplit.bufferedRegion,
      refreshBoundRegion: newSplit.refreshBoundRegion,
    };
    LOG.debug(`Updating UI with new split: ${JSON.stringify(newSplitState)}`);
    splits = [...splits, newSplitState];
  };

  const adjustDimensions = ({
    currentDimensions,
    dividerIndex,
    mousePosPct,
  }: {
    readonly currentDimensions: number[];
    dividerIndex: number;
    mousePosPct: number;
  }): number[] => {
    // E.g start with 33%, 33%, 33%
    // Divider 0 moved to 10%
    // Set track 0 to 10%
    // Set other tracks to (33 - 23/2)%
    //
    // Calculate a cumulative sum of the splits/tracks up to the current one. This is used to
    // determine where the mouse is in relation to the current split/track.
    const cumSumDim = sum(currentDimensions.slice(0, dividerIndex + 1));
    let diff = mousePosPct - cumSumDim + (DIVIDER_PX / window.innerHeight) * 100;
    if (currentDimensions[dividerIndex] + diff < minCellPct) {
      diff = minCellPct - currentDimensions[dividerIndex];
    } else if (currentDimensions[dividerIndex + 1] - diff < minCellPct) {
      diff = currentDimensions[dividerIndex + 1] - minCellPct;
    }
    const updatedDimensions = Array.from(
      currentDimensions.map((dim, dimIndex) => {
        if (dimIndex === dividerIndex) {
          return dim + diff;
        } else if (dimIndex === dividerIndex + 1) {
          return dim - diff;
        } else {
          return dim;
        }
      })
    );
    return updatedDimensions;
  };

  const getMouseYPosPct = (mouseYPos: number) => {
    return ((mouseYPos - offsetTop) / trackAreaHeight) * 100;
  };

  const getMouseXPosPct = (mouseXPos: number) => {
    return ((mouseXPos - offsetLeft) / gridWidth) * 100;
  };

  const setSplitWidths = (widths: readonly number[]): void => {
    splits.map((split, index) => {
      split.widthPct = widths[index];
    });
    splits = splits;
  };

  const setTrackHeights = (heights: readonly number[]): void => {
    tracks.map((track, index) => {
      track.heightPct = heights[index];
    });
    tracks = tracks;
  };

  const handleHorizontalDividerDrag: DividerDragHandler = ({ mouseEvent, dividerIndex }) => {
    const mouseYPos = mouseEvent.clientY;
    const mousePosPct = getMouseYPosPct(mouseYPos);
    const currentDimensions = Array.from(tracks.map((track) => track.heightPct));
    const updatedTrackHeights = adjustDimensions({
      mousePosPct,
      dividerIndex,
      currentDimensions,
    });
    LOG.debug(
      `Handling divider drag event: mousePos=${mouseYPos}; ` +
        `windowHeight=${window.innerHeight}; mousePosPct=${mousePosPct}; ` +
        `initialTrackHeights=${currentDimensions} updatedTrackHeights=${updatedTrackHeights}`
    );
    setTrackHeights(updatedTrackHeights);
  };

  const handleVerticalDividerDrag: DividerDragHandler = ({ mouseEvent, dividerIndex }) => {
    const mouseXPos = mouseEvent.clientX;
    const mousePosPct = getMouseXPosPct(mouseXPos);
    const currentDimensions = Array.from(splits.map((split) => split.widthPct));
    const updatedSplitWidths = adjustDimensions({
      mousePosPct,
      dividerIndex,
      currentDimensions,
    });
    LOG.debug(
      `Handling divider drag event: mousePos=${mouseXPos}; ` +
        `windowWidth=${window.innerWidth}; mousePosPct=${mousePosPct}; ` +
        `initialSplitWidths=${currentDimensions} updatedSplitWidths=${updatedSplitWidths}`
    );
    setSplitWidths(updatedSplitWidths);
  };

  afterUpdate(() => {
    if (trackArea !== undefined) {
      gridWidth = trackArea.offsetWidth;
      trackAreaHeight = trackArea.offsetHeight;
      offsetLeft = trackArea.offsetLeft;
      offsetTop = trackArea.offsetTop;
    }
  });

  listenForSplitAdded((event) => handleNewSplit(event.payload));
  listenForTrackAdded((event) => handleNewTrack(event.payload));
</script>

<div class="split-grid">
  {#if assetsLoaded}
    <SplitToolbar {splits} {handleVerticalDividerDrag} />
    <RefSeqArea {splits} {handleVerticalDividerDrag} />
    <TrackArea
      bind:this={trackArea}
      {tracks}
      {splits}
      {handleHorizontalDividerDrag}
      {handleVerticalDividerDrag}
    />
    <!-- TODO add loading wheel while assets loading-->
  {/if}
</div>

<style>
  .split-grid {
    display: flex;
    flex-grow: 1;
    flex-direction: column;
    width: 100%;
  }
</style>
