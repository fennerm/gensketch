<script lang="ts">
  import { onMount } from "svelte";

  import { getReferenceSequence, updateFocusedRegion } from "@lib/backend";
  import type { GenomicRegion, SeqLengthMap } from "@lib/bindings";
  import { defaultErrorHandler } from "@lib/errorHandling";
  import { getLength, parse1IndexedCoordinates, to1IndexedString } from "@lib/genomicCoordinates";
  import LOG from "@lib/logger";

  export let splitId: string;
  export let focusedRegion: GenomicRegion;

  let regionString: string = to1IndexedString(focusedRegion);
  let sanitizedRegion: GenomicRegion | null = null;
  let seqLengths: SeqLengthMap | null = null;

  $: focusedRegion, handleFocusedRegionUpdate();

  const minFocusedRegion: number = 20;

  onMount(async () => {
    getReferenceSequence()
      .then((refseq) => {
        seqLengths = refseq.seqLengths;
      })
      .catch(defaultErrorHandler);
  });

  const handleFocusedRegionUpdate = (): void => {
    const newRegionString = to1IndexedString(focusedRegion);
    if (newRegionString !== regionString) {
      regionString = newRegionString;
      sanitizedRegion = focusedRegion;
    }
  };

  const sanitizeInputRegion = (): GenomicRegion => {
    let genomicRegion = parse1IndexedCoordinates(regionString);
    const maxEnd = seqLengths![genomicRegion.seqName];

    if (maxEnd === undefined) {
      throw `Invalid sequence name: ${genomicRegion.seqName}`;
    }

    if (getLength(genomicRegion.interval) < minFocusedRegion) {
      genomicRegion.interval.start = genomicRegion.interval.start - BigInt(minFocusedRegion) / 2n;
      genomicRegion.interval.end += genomicRegion.interval.end + BigInt(minFocusedRegion) / 2n;
    }

    if (genomicRegion.interval.start < 0) {
      genomicRegion.interval.start = 0n;
    }
    if (genomicRegion.interval.end > maxEnd) {
      genomicRegion.interval.end = maxEnd;
    }
    return genomicRegion;
  };

  const handleInputFinalized = (): void => {
    if (sanitizedRegion !== null) {
      updateFocusedRegion({ splitId: splitId, genomicRegion: sanitizedRegion });
    } else {
      LOG.warn(`Attempted to update focused region with invalid input: ${regionString}`);
    }
  };

  const handleInputChanged = (): void => {
    try {
      sanitizedRegion = sanitizeInputRegion();
    } catch (error) {
      sanitizedRegion = null;
      // TODO Display error in UI
      return;
    }
  };
</script>

<input
  class="genomic-region-input"
  bind:value={regionString}
  on:change={handleInputFinalized}
  on:input={handleInputChanged}
/>

<style>
  .genomic-region-input {
    font-size: 1em;
    padding: 0.1em;
  }
</style>
