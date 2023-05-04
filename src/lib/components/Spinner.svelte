<!--
  A simple loading wheel.
-->
<svelte:options immutable={true} />

<script lang="ts">
  import { Circle } from "svelte-loading-spinners";
  export let size: string | number | undefined = undefined;
  export let style: string = "";
</script>

<div class="spinner-wrapper" {style}>
  <Circle color="#222222" {size} />
</div>

<style>
  .spinner-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
  }
</style>
