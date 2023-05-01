<!-- Main toolbar displayed above the split grid. 

  Contains shortcuts for common actions.
-->
<svelte:options immutable={true} />

<script lang="ts">
  import { addSplit } from "@lib/backend";
  import Button from "@lib/components/Button.svelte";
  import { defaultErrorHandler } from "@lib/errorHandling";
  import LOG from "@lib/logger";

  const newSplit = (): void => {
    LOG.info("Adding new split...");
    addSplit({
      focusedRegion: null,
    }).catch(defaultErrorHandler);
  };
</script>

<div style:display="flex">
  <Button class="btn-sm" on:click={newSplit}>Add Split</Button>
</div>
