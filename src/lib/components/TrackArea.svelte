<!-- Area of the split grid where tracks are displayed -->
<svelte:options immutable={true} />

<script lang="ts">
  import GridDivider from "@lib/components/GridDivider.svelte";
  import type { DividerDragHandler, SplitState, TrackState } from "@lib/components/SplitGrid.types";
  import Track from "@lib/components/Track.svelte";

  export let tracks: TrackState[];
  export let splits: SplitState[];

  // Functions to call when grid dividers are dragged
  export let handleVerticalDividerDrag: DividerDragHandler;
  export let handleHorizontalDividerDrag: DividerDragHandler;
</script>

{#each tracks as track, trackIndex}
  <Track
    id={track.id}
    name={track.name}
    filePath={track.filePath}
    heightPct={track.heightPct}
    {splits}
    {handleVerticalDividerDrag}
  />
  {#if trackIndex + 1 < tracks.length}
    <GridDivider
      orientation="horizontal"
      dragHandler={(mousePos) =>
        handleHorizontalDividerDrag({ mousePos, dividerIndex: trackIndex })}
    />
  {/if}
{/each}
