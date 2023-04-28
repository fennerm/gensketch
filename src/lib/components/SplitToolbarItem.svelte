<svelte:options immutable={true} />

<script lang="ts">
  import type { GenomicRegion } from "@lib/bindings";
  import FocusedRegionInput from "@lib/components/FocusedRegionInput.svelte";

  export let splitId: string;
  export let focusedRegion: GenomicRegion;
  export let widthPct: number;
</script>

<div style:width={`${widthPct}%`}>
  <FocusedRegionInput {splitId} {focusedRegion} />
</div>
