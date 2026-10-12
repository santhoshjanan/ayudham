<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cssVar } from './cssVar.ts';

  // A judge's scorecard with the space for its flag above it. The width comes
  // from `--card-w` on an ancestor. `beat` plays the moment after a live turn:
  // the flags are stamped on, Low then High, or, with `wave` set to the card's
  // place in the row, the whole row hops in turn for a unanimous result.
  let {
    side,
    flag = null,
    beat = false,
    wave = null,
    children,
  }: {
    side: 'up' | 'down' | 'empty';
    flag?: 'High' | 'Low' | null;
    beat?: boolean;
    wave?: number | null;
    children?: Snippet;
  } = $props();
</script>

<span class="flag" class:on={flag !== null} class:beat data-flag={flag}>{flag ?? ''}</span>
<span
  class="card"
  class:beat
  class:wave={beat && wave !== null}
  data-state={side}
  data-flag={flag}
  use:cssVar={{ '--i': String(wave ?? 0) }}
>
  <span class="card-inner">
    <span class="back"></span>
    <span class="face">{@render children?.()}</span>
  </span>
</span>

<style>
  /* Red is reserved for this: who is highest and lowest. Always with the word. */
  .flag {
    height: 1.35rem;
    padding: 0 0.5rem;
    border-radius: 3px;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 0.95rem;
    line-height: 1.35rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    visibility: hidden;
  }
  .flag.on {
    visibility: visible;
    background: var(--flag);
    color: var(--flag-ink);
  }

  /* A scorecard. Face down while voting; every card turns in the same instant. */
  .card {
    width: var(--card-w, 5.5rem);
    aspect-ratio: 5 / 7;
    perspective: 40rem;
  }
  .card-inner {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .card[data-state='up'] .card-inner {
    transform: rotateY(180deg);
  }
  .back,
  .face {
    position: absolute;
    inset: 0;
    border-radius: var(--radius);
    backface-visibility: hidden;
  }
  .back {
    background-color: var(--card-back);
    background-image:
      linear-gradient(rgb(255 255 255 / 0.12) 1px, transparent 1px),
      linear-gradient(90deg, rgb(255 255 255 / 0.12) 1px, transparent 1px);
    background-size: 0.6rem 0.6rem;
    border: 3px solid var(--card);
    box-shadow: var(--shadow);
  }
  .face {
    transform: rotateY(180deg);
    display: grid;
    place-items: center;
    background: var(--card);
    color: var(--card-ink);
    border: 1.5px solid var(--card-edge);
    box-shadow: var(--shadow);
    font-family: var(--font-display);
    font-weight: 900;
    font-size: calc(var(--card-w, 5.5rem) * 0.52);
    line-height: 1;
  }
  /* Nobody has put a card here yet: an outline where it will go. */
  .card[data-state='empty'] .back {
    background: transparent;
    border: 2px dashed var(--line);
    box-shadow: none;
  }
  /* The highest and lowest cards carry the flag's colour on their edge. */
  .card[data-state='up'][data-flag] .face {
    border-color: var(--flag);
    box-shadow:
      0 0 0 3px var(--flag),
      var(--shadow);
  }

  /* ---- The beat after the turn: Low is stamped, then High ---- */
  .flag.beat.on {
    --at: 0.45s;
    animation: stamp 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.25) var(--at) both;
  }
  .flag.beat.on[data-flag='High'] {
    --at: 0.85s;
  }
  .card.beat[data-flag] {
    --at: 0.45s;
    animation: dip 0.32s cubic-bezier(0.16, 1, 0.3, 1) calc(var(--at) + 0.1s) both;
  }
  .card.beat[data-flag='High'] {
    --at: 0.85s;
  }
  .card.beat[data-flag] .face {
    animation: ring 0.2s linear calc(var(--at) + 0.1s) both;
  }
  /* Everyone agreed: the row hops, one card after the next. */
  .card.wave[data-state='up'] {
    animation: hop 0.42s cubic-bezier(0.16, 1, 0.3, 1) calc(0.35s + min(var(--i), 14) * 45ms)
      both;
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: translateY(-0.7rem) scale(1.8);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes dip {
    0% {
      transform: translateY(0);
    }
    35% {
      transform: translateY(0.3rem);
    }
    100% {
      transform: translateY(0);
    }
  }
  @keyframes ring {
    from {
      border-color: var(--card-edge);
      box-shadow:
        0 0 0 0 var(--flag),
        var(--shadow);
    }
  }
  @keyframes hop {
    0% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-0.7rem);
    }
    100% {
      transform: translateY(0);
    }
  }
  /* Without motion the flags and edges are simply there. */
  @media (prefers-reduced-motion: reduce) {
    .flag.beat.on,
    .card.beat,
    .card.beat .face {
      animation: none !important;
    }
  }
</style>
