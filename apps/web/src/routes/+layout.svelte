<script lang="ts">
  import '@fontsource-variable/big-shoulders';
  import '@fontsource-variable/atkinson-hyperlegible-next';
  import '../app.css';
  import { roomBar } from '#lib/ui/roomBar.svelte.ts';
  import ThemeToggle from '#lib/ui/ThemeToggle.svelte';
  import TileRipple from '#lib/ui/TileRipple.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
  let copied = $state(false);

  const copyLink = async () => {
    if (!roomBar.room) return;
    try {
      await navigator.clipboard.writeText(`${location.origin}/poker/r/${roomBar.room.code}`);
      copied = true;
      setTimeout(() => (copied = false), 2_000);
    } catch {
      // The address bar still has the link.
    }
  };
</script>

<TileRipple />

<div class="shell">
  <header class="bar">
    <a class="mark" href="/">pokerji</a>
    {#if roomBar.room}
      <!-- In a room, the one bar carries the room's own things. -->
      <nav aria-label="Room">
        <button type="button" class="copy" onclick={copyLink}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M9 9h10v11H9zM5 15V4h10"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>{copied ? 'Link copied' : 'Copy room link'}</span>
        </button>
        <a href="/poker/r/{roomBar.room.code}/history">History</a>
        {#if roomBar.room.moderator}
          <a href="/poker/r/{roomBar.room.code}/settings">Settings</a>
        {/if}
      </nav>
      <span class="you">
        <span class="you-name">{roomBar.room.name}</span>
        {#if roomBar.room.owner}
          <span class="badge owner">Owner</span>
        {:else if roomBar.room.moderator}
          <span class="badge">Moderator</span>
        {/if}
      </span>
    {:else}
      <nav aria-label="Site">
        <a href="/poker">Planning poker</a>
        <a href="/privacy">Privacy</a>
      </nav>
    {/if}
    <ThemeToggle />
  </header>
  {@render children()}
</div>

<style>
  .shell {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.5rem 1.25rem;
    padding: 0.5rem clamp(1rem, 4vw, 2.5rem);
    background: var(--stage-deep);
    color: var(--stage-ink);
  }
  .mark {
    font-family: var(--font-display);
    font-weight: 900;
    font-size: 1.6rem;
    letter-spacing: 0.01em;
    text-decoration: none;
    margin-right: auto;
  }
  nav {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    font-size: 0.95rem;
  }
  nav a {
    text-decoration: none;
    padding-block: 0.4rem;
  }
  nav a:hover {
    text-decoration: underline;
  }
  .copy {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.25rem;
    padding: 0.2rem 0.7rem;
    background: transparent;
    color: inherit;
    border: 1px solid var(--stage-ink-soft);
    font-size: inherit;
  }
  .copy:hover:not(:disabled) {
    background: var(--stage-ink);
    color: var(--stage-deep);
  }
  .you {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 650;
    font-size: 0.95rem;
    min-width: 0;
  }
  .you-name {
    max-width: 12ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* On the bar the badge reads in the bar's own ink. */
  .you .badge.owner {
    background: var(--stage-ink);
    border-color: var(--stage-ink);
    color: var(--stage-deep);
  }
  @media (max-width: 34rem) {
    .bar {
      gap: 0.5rem 0.75rem;
    }
    nav {
      gap: 0.75rem;
    }
    nav[aria-label='Site'] a:first-child,
    .you-name,
    .copy span {
      display: none;
    }
    .copy {
      padding: 0.2rem 0.5rem;
    }
  }
</style>
