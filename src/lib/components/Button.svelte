<svelte:options immutable={true} />

<button {...$$restProps} on:click>
  <slot />
</button>

<style>
  button {
    padding: 0.75rem 1.5rem;
    font-size: 1em;
    font-weight: 500;
    font-family: inherit;
    transition: border-color 0.25s;
    background-color: #e2e8f0;
    color: #64748b;
    border: none;
  }

  .btn-sm {
    font-size: 1em;
    padding: 0.1em;
  }
  .btn-lg {
    font-size: 2em;
  }
</style>
