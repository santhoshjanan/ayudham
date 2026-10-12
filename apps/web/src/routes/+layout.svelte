<script lang="ts">
  import '@fontsource-variable/big-shoulders';
  import '@fontsource-variable/atkinson-hyperlegible-next';
  import '../app.css';
  import ThemeToggle from '#lib/ui/ThemeToggle.svelte';
  import TileRipple from '#lib/ui/TileRipple.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<TileRipple />

<div class="shell">
  <header class="bar">
    <a class="mark" href="/">pokerji</a>
    <nav aria-label="Site">
      <a href="/poker">Planning poker</a>
      <a href="/privacy">Privacy</a>
    </nav>
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
    gap: 1.25rem;
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
  @media (max-width: 30rem) {
    nav a:first-child {
      display: none;
    }
  }
</style>
