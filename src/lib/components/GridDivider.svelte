<!--
Divider between tracks/splits in the split grid which can be dragged to resize.
-->
<svelte:options immutable={true} />

<script lang="ts">
  import { DIVIDER_PX } from "@lib/constants";
  import LOG from "@lib/logger";
  import type { DividerOrientation, MouseHandler } from "@lib/types";

  // "horizontal" if this is a divider between tracks. "vertical" if this
  // is a divider between splits.
  export let orientation: DividerOrientation = "horizontal";

  // Callback to fire when divider is dragged.
  export let dragHandler: MouseHandler;

  $: cursor = orientation === "horizontal" ? "row-resize" : "col-resize";
  $: height = orientation === "horizontal" ? `${DIVIDER_PX}px` : "100%";
  $: width = orientation === "horizontal" ? "100%" : `${DIVIDER_PX}px`;

  // The hover area is larger than the divider itself to make it easier to drag.
  const hoverPadding = DIVIDER_PX * 6;
  $: hoverHeight = orientation === "horizontal" ? `${hoverPadding}px` : "100%";
  $: hoverWidth = orientation === "horizontal" ? "100%" : `${hoverPadding}px`;
  $: translateX = orientation === "horizontal" ? "0" : "-50%";
  $: translateY = orientation === "horizontal" ? "-50%" : "0";

  let isDragging: boolean = false;
  let mouseX: number | undefined = undefined;
  let mouseY: number | undefined = undefined;
  $: draggedX = orientation === "horizontal" ? undefined : mouseX;
  $: draggedY = orientation === "horizontal" ? mouseY : undefined;

  const handleMouseMove = (event: MouseEvent): void => {
    window.requestAnimationFrame(() => {
      mouseX = event.pageX;
      mouseY = event.pageY;
    });
    event.preventDefault();
  };

  const handleMouseDown = (): void => {
    LOG.debug("Dragging divider...");
    isDragging = true;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseUp = (): void => {
    LOG.debug("Stopped dragging divider...");
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    isDragging = false;
    if (mouseX !== undefined && mouseY !== undefined) {
      dragHandler({ x: mouseX, y: mouseY });
    }
    mouseX = undefined;
    mouseY = undefined;
  };
</script>

<div class="divider" style:height style:width>
  <div
    class="divider-hover-area"
    on:mousedown={handleMouseDown}
    style:height={hoverHeight}
    style:width={hoverWidth}
    style:transform={`translate(${translateX}, ${translateY})`}
    style:cursor
  />
  {#if isDragging}
    <div
      class="dragged-divider"
      style:height
      style:width
      style:left={`${draggedX}px`}
      style:top={`${draggedY}px`}
    />
  {/if}
</div>

<style>
  .divider {
    background-color: var(--color-foreground);
  }

  .dragged-divider {
    background-color: var(--color-foreground);
    position: fixed;
    z-index: 999;
  }

  .divider-hover-area {
    position: absolute;
    z-index: 999;
  }
</style>
