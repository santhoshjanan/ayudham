<script lang="ts">
  import { loadSound, setSound, setVolume, sound } from './sound.svelte.ts';

  // Off until asked for. Nothing about it is sent to the server.
  $effect(loadSound);
</script>

<span class="sound">
  <button
    type="button"
    class="toggle"
    onclick={() => setSound(!sound.on)}
    aria-label={sound.on ? 'Turn sound off' : 'Turn sound on'}
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        {#if sound.on}
          <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.3a8 8 0 0 1 0 11.4" />
        {:else}
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        {/if}
      </g>
    </svg>
  </button>
  {#if sound.on}
    <input
      class="volume"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={sound.volume}
      aria-label="Volume"
      aria-valuetext="{Math.round(sound.volume * 100)}%"
      oninput={(event) => setVolume(Number(event.currentTarget.value))}
    />
  {/if}
</span>

<style>
  .sound {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
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
  /* A plain slider in the bar's own ink; the phone's volume keys do this job on small screens. */
  .volume {
    width: 5rem;
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    accent-color: var(--stage-ink);
  }
  @media (max-width: 48rem) {
    .volume {
      display: none;
    }
  }
</style>
