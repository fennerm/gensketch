<script lang="ts">
  import GridDivider from "@lib/components/GridDivider.svelte";
  import type { DividerDragHandler } from "@lib/components/SplitGrid.types";
  import type { SplitState } from "@lib/components/SplitGrid.types";
  import SplitToolbarItem from "@lib/components/SplitToolbarItem.svelte";

  export let splits: SplitState[] = [];
  export let handleVerticalDividerDrag: DividerDragHandler;
</script>

<div class="split-toolbar">
  {#each splits as split, splitIndex}
    <SplitToolbarItem
      splitId={split.id}
      widthPct={split.widthPct}
      focusedRegion={split.focusedRegion}
    />
    {#if splitIndex != splits.length}
      <GridDivider
        orientation="vertical"
        dragHandler={(mouseEvent) =>
          handleVerticalDividerDrag({ mouseEvent, dividerIndex: splitIndex })}
      />
    {/if}
  {/each}
</div>

<style>
  .split-toolbar {
    display: flex;
    flex-direction: row;
    width: 100%;
  }
</style>
