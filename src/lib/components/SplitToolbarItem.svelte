<!-- Toolbar for a single split in the split grid. -->
<svelte:options immutable={true} />

<script lang="ts">
  import type { GenomicRegion } from "@lib/bindings";
  import FocusedRegionInput from "@lib/components/FocusedRegionInput.svelte";

  export let splitId: string;
  export let focusedRegion: GenomicRegion;

  // Width of the split as a percentage of the total width of the split grid
  export let widthPct: number;
</script>

<div style:width={`${widthPct}%`}>
  <FocusedRegionInput {splitId} {focusedRegion} />
</div>
