<!-- A row in the split grid, holding multiple AlignmentViews which display genomic data.-->
<svelte:options immutable={true} />

<script lang="ts">
  import AlignmentsView from "@lib/components/AlignmentsView.svelte";
  import GridDivider from "@lib/components/GridDivider.svelte";
  import type { DividerDragHandler, SplitState } from "@lib/components/SplitGrid.types";

  // Track name
  export let name: string;

  // Track UUID
  export let id: string;

  // Path to the file containing the data to display
  export let filePath: string;

  export let heightPct: number;
  export let splits: SplitState[];

  // Function to call when a vertical grid divider is dragged
  export let handleVerticalDividerDrag: DividerDragHandler;
</script>

<div class="track" style:height={`${heightPct}%`}>
  <div class="track-label">
    {name}
  </div>
  <div class="split-container">
    {#each splits as split, splitIndex}
      <AlignmentsView trackId={id} splitId={split.id} {filePath} widthPct={split.widthPct} />
      {#if splitIndex < splits.length}
        <GridDivider
          orientation="vertical"
          dragHandler={(mousePos) =>
            handleVerticalDividerDrag({ mousePos, dividerIndex: splitIndex })}
        />
      {/if}
    {/each}
  </div>
</div>

<style>
  .track {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .track-label {
    background-color: var(--color-trackLabelBackground);
    font-size: 12px;
    color: var(--color-secondaryText);
    width: 100%;
  }

  .split-container {
    display: flex;
    flex-direction: row;
    width: 100%;
    flex-grow: 1;
  }
</style>
