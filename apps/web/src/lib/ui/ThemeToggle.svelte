<script lang="ts">
  // The saved choice is applied before paint by the script in app.html.
  // This only changes it. Nothing about it is sent to the server.
  let dark = $state(false);

  const current = () =>
    document.documentElement.dataset.theme ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  $effect(() => {
    dark = current() === 'dark';
  });

  const toggle = () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    dark = next === 'dark';
    try {
      localStorage.setItem('pj-theme', next);
    } catch {
      // Private browsing: the choice lasts for this page only.
    }
  };
</script>

<button
  type="button"
  class="toggle"
  onclick={toggle}
  aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
>
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    {#if dark}
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </g>
    {:else}
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z" fill="currentColor" />
    {/if}
  </svg>
</button>

<style>
  .toggle {
    display: inline-grid;
    place-items: center;
    min-height: 2.5rem;
    width: 2.5rem;
    padding: 0;
    border-color: transparent;
    background: transparent;
    color: inherit;
  }
  .toggle:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 14%, transparent);
    color: inherit;
  }
</style>
