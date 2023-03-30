<script lang="ts">
  import { addAlignmentTrack, addSplit, openFileDialog } from "@lib/backend";
  import Button from "@lib/components/Button.svelte";
  import { defaultErrorHandler } from "@lib/errorHandling";
  import LOG from "@lib/logger";

  const newTrack = () => {
    LOG.info("Adding new track...");
    openFileDialog()
      .then((fileNames) => {
        if (fileNames === null) {
          return;
        }
        fileNames.map((fileName) =>
          addAlignmentTrack({ bamPath: fileName }).catch(defaultErrorHandler)
        );
      })
      .catch((error) => defaultErrorHandler(error, "Failed to open file picker dialog"));
  };

  const newSplit = (): void => {
    LOG.info("Adding new split...");
    addSplit({
      focusedRegion: null,
    }).catch(defaultErrorHandler);
  };
</script>

<div style:display="flex">
  <Button class="btn-sm" on:click={newTrack}>Add Track</Button>
  <Button class="btn-sm" on:click={newSplit}>Add Split</Button>
</div>
