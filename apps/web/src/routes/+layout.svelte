<script lang="ts">
  import '@fontsource-variable/big-shoulders';
  import '@fontsource-variable/atkinson-hyperlegible-next';
  import '../app.css';
  import { roomBar } from '#lib/ui/roomBar.svelte.ts';
  import SoundToggle from '#lib/ui/SoundToggle.svelte';
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
    <a class="mark" href="/">ayudham.app</a>
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
        <a href="/schema">Schema markup</a>
        <a href="/text">Text tools</a>
        <a href="/codes">Codes</a>
        <a href="/privacy">Privacy</a>
      </nav>
    {/if}
    {#if roomBar.room}<SoundToggle />{/if}
    <ThemeToggle />
  </header>
  {@render children()}
  {#if !roomBar.room}
    <!-- Not in the live room: the hand is docked along the bottom edge there. -->
    <footer class="foot">
      <p>
        Free and open source.
        <a href="https://github.com/santhoshjanan/pokerji" rel="noopener">Source on GitHub</a>
      </p>
      <p class="made">
        Made in New Jersey with
        <svg viewBox="0 0 24 24" width="16" height="16" role="img" aria-label="love">
          <path
            d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.6 4.5c2.1 0 3.8 1.1 5.4 3.1 1.6-2 3.3-3.1 5.4-3.1 3.6 0 5.7 3.8 4.2 7.2C19.5 16.4 12 21 12 21Z"
            fill="currentColor"
          />
        </svg>
      </p>
      <p class="more">
        Check out <a href="https://phostrich.com" rel="noopener">phostrich.com</a> and
        <a href="https://santhoshj.com" rel="noopener">santhoshj.com</a>
      </p>
    </footer>
  {/if}
</div>

<style>
  .shell {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  /* The foot of every page but the live room: one quiet line on the tile, pushed to the
     bottom. Source on the left, where it was made in the middle, the maker on the right. */
  .foot {
    margin-top: auto;
    display: grid;
    gap: 0.4rem 2rem;
    padding: 1.25rem clamp(1rem, 4vw, 2.5rem);
    border-top: 1px solid var(--line);
    font-size: 0.9rem;
    color: var(--ink-soft);
  }
  .foot p {
    margin: 0;
  }
  .foot a {
    color: var(--ink);
  }
  .made {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  /* The one place the flag colour is used for feeling and not for a flag. */
  .made svg {
    color: var(--flag);
  }
  @media (min-width: 52rem) {
    .foot {
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
    }
    .more {
      text-align: right;
    }
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
      gap: 0.5rem;
    }
    /* The room's row shows your role under your own card, so the bar lets it go here. */
    .you {
      display: none;
    }
    .bar :global(.toggle) {
      width: 2.25rem;
    }
    nav {
      gap: 0.75rem;
    }
    /* The tools are a tap away on the home page, which the wordmark opens. */
    nav[aria-label='Site'] a:not(:last-child),
    .copy span {
      display: none;
    }
    .copy {
      padding: 0.2rem 0.5rem;
    }
  }
</style>
