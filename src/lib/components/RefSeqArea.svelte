<!-- Wraps multiple RefSeqViews (one per split in the split grid). -->
<svelte:options immutable={true} />

<script lang="ts">
  import GridDivider from "@lib/components/GridDivider.svelte";
  import RefSeqView from "@lib/components/RefSeqView.svelte";
  import type { DividerDragHandler, SplitState } from "@lib/components/SplitGrid.types";

  export let splits: SplitState[] = [];

  // Function to call when a grid divider is dragged
  export let handleVerticalDividerDrag: DividerDragHandler;
</script>

<div class="ref-seq-area">
  {#each splits as split, splitIndex}
    <RefSeqView splitId={split.id} widthPct={split.widthPct} />
    {#if splitIndex + 1 < splits.length}
      <GridDivider
        orientation="vertical"
        dragHandler={(mousePos) =>
          handleVerticalDividerDrag({ mousePos, dividerIndex: splitIndex })}
      />
    {/if}
  {/each}
</div>

<style>
  .ref-seq-area {
    display: flex;
    width: 100%;
    height: 30px;
  }
</style>
