<script lang="ts">
  import GridDivider from "@lib/components/GridDivider.svelte";
  import type { DividerDragHandler, SplitState, TrackState } from "@lib/components/SplitGrid.types";
  import Track from "@lib/components/Track.svelte";

  export let tracks: TrackState[];
  export let splits: SplitState[];
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
  {#if trackIndex < tracks.length}
    <GridDivider
      orientation="horizontal"
      dragHandler={(mouseEvent) =>
        handleHorizontalDividerDrag({ mouseEvent, dividerIndex: trackIndex })}
    />
  {/if}
{/each}
