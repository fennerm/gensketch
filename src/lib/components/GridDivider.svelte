<!--
@component
Divider between tracks/splits in the split grid which can be dragged to resize.

Props:
- orientation = "horizontal" if this is a divider between tracks. "vertical" if this
 is a divider between splits.
- dragHandler = Callback to fire when divider is dragged.
-->
<script lang="ts">
  import { DIVIDER_PX } from "@lib/constants";
  import LOG from "@lib/logger";
  import type { DividerOrientation, MouseHandler } from "@lib/types";

  export let orientation: DividerOrientation = "horizontal";
  export let dragHandler: MouseHandler;
  $: cursor = orientation === "horizontal" ? "row-resize" : "col-resize";
  $: height = orientation === "horizontal" ? `${DIVIDER_PX}px` : "100%";
  $: width = orientation === "horizontal" ? "100%" : `${DIVIDER_PX}px`;

  const handleMouseDown = (): void => {
    LOG.debug("Dragging divider...");
    document.addEventListener("mousemove", dragHandler);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseUp = (): void => {
    console.log("Stopped dragging divider...");
    document.removeEventListener("mousemove", dragHandler);
    document.removeEventListener("mouseup", handleMouseUp);
  };
</script>

<div class="divider" on:mousedown={handleMouseDown} style:height style:width style:cursor />

<style>
  .divider {
    background-color: var(--color-foreground);
  }
</style>
