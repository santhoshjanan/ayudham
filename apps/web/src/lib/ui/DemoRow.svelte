<script lang="ts">
  import Scorecard from './Scorecard.svelte';

  // A picture of the product's one moment: a row face down, then every card at once.
  // Decoration only; it stands for no real people or votes.
  const cards: { value: string; flag?: 'High' | 'Low' }[] = [
    { value: '3', flag: 'Low' },
    { value: '5' },
    { value: '5' },
    { value: '8' },
    { value: '13', flag: 'High' },
  ];
  let turned = $state(false);

  $effect(() => {
    const wait = setTimeout(() => (turned = true), 900);
    return () => clearTimeout(wait);
  });
</script>

<div class="demo" data-testid="demo-row" aria-hidden="true">
  {#each cards as card, index (index)}
    <span class="seat">
      <Scorecard side={turned ? 'up' : 'down'} flag={turned ? (card.flag ?? null) : null} beat
        >{card.value}</Scorecard
      >
    </span>
  {/each}
</div>

<style>
  .demo {
    --card-w: clamp(2.9rem, 1.6rem + 5.2vw, 4.75rem);
    display: flex;
    gap: clamp(0.5rem, 1.4vw, 0.9rem);
  }
  .seat {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
  }
</style>
