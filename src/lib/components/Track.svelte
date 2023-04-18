<script lang="ts">
  import AlignmentsView from "@lib/components/AlignmentsView.svelte";
  import GridDivider from "@lib/components/GridDivider.svelte";
  import type { DividerDragHandler, SplitState } from "@lib/components/SplitGrid.types";

  export let name: string;
  export let id: string;
  export let heightPct: number;
  export let splits: SplitState[];
  export let handleVerticalDividerDrag: DividerDragHandler;
</script>

<div class="track" style:height={`${heightPct}%`}>
  <div class="track-label">
    {name}
  </div>
  <div class="split-container">
    {#each splits as split, splitIndex}
      <AlignmentsView trackId={id} splitId={split.id} widthPct={split.widthPct} />
      {#if splitIndex < splits.length}
        <GridDivider
          orientation="vertical"
          dragHandler={(mouseEvent) =>
            handleVerticalDividerDrag({ mouseEvent, dividerIndex: splitIndex })}
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
