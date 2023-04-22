<script lang="ts">
  import GridDivider from "@lib/components/GridDivider.svelte";
  import RefSeqView from "@lib/components/RefSeqView.svelte";
  import type { SplitState } from "@lib/components/SplitGrid.types";

  import type { DividerDragHandler } from "./SplitGrid.types";

  export let splits: SplitState[] = [];
  export let handleVerticalDividerDrag: DividerDragHandler;
</script>

<div class="ref-seq-area">
  {#each splits as split, splitIndex}
    <RefSeqView splitId={split.id} widthPct={split.widthPct} />
    {#if splitIndex < splits.length}
      <GridDivider
        orientation="vertical"
        dragHandler={(mouseEvent) =>
          handleVerticalDividerDrag({ mouseEvent, dividerIndex: splitIndex })}
      />
    {/if}
  {/each}
</div>

<style>
  .ref-seq-area {
    display: flex;
    width: 100%;
    height: 24px;
  }
</style>
