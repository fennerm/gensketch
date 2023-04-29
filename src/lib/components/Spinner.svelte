<!--
  A simple loading wheel.
-->
<svelte:options immutable={true} />

<script lang="ts">
  import { Circle } from "svelte-loading-spinners";
</script>

<div class="spinner-wrapper">
  <Circle color="#222222" />
</div>

<style>
  .spinner-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }
</style>
