<script lang="ts">
  import { coins, dice, LIMITS, pick } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import TextBox from './TextBox.svelte';
  import { say, type Row } from './tools.ts';

  let mode = $state<'dice' | 'coin' | 'pick'>('dice');
  let count = $state(1);
  let sides = $state(6);
  let list = $state('');
  let turn = $state(0);

  type Made = { rows: Row[] } | { problem: string; keepLast: boolean };

  const made = $derived.by((): Made => {
    void turn;
    if (mode === 'dice') {
      const rolled = dice(count, sides, random);
      if (!rolled.ok) {
        return {
          keepLast: rolled.problem !== 'no-random',
          problem: say(
            rolled.problem,
            `Dice must be 1 to ${LIMITS.results}, and sides ${LIMITS.sidesMin} to ${LIMITS.sidesMax.toLocaleString('en')}.`,
          ),
        };
      }
      const rows: Row[] = rolled.value.rolls.map((roll) => ({ value: String(roll) }));
      if (rows.length > 1) rows.push({ name: 'Total', value: String(rolled.value.total) });
      return { rows };
    }
    if (mode === 'coin') {
      const flipped = coins(count, random);
      if (!flipped.ok) {
        return { keepLast: flipped.problem !== 'no-random', problem: say(flipped.problem, `Flips must be 1 to ${LIMITS.results}.`) };
      }
      return { rows: flipped.value.map((face) => ({ value: face === 'heads' ? 'Heads' : 'Tails' })) };
    }
    const picked = pick(list, count, random);
    if (!picked.ok) {
      return { keepLast: picked.problem !== 'no-random', problem: say(picked.problem, `How many to pick must be 1 to ${LIMITS.results}.`) };
    }
    return { rows: picked.value.map((value) => ({ value })) };
  });
</script>

<Frame
  title="Chance"
  blurb="Roll dice, flip a coin, or pick from a list of your own. No outcome is favoured."
  rows={'rows' in made ? made.rows : []}
  problem={'problem' in made ? made.problem : undefined}
  keepLast={'rows' in made || made.keepLast}
  waiting="The outcome appears here."
  again={() => (turn += 1)}
  made={'rows' in made ? `${made.rows.length} made.` : ''}
>
  <p class="field">
    <label for="t-use">Use</label>
    <select id="t-use" bind:value={mode}>
      <option value="dice">Dice</option>
      <option value="coin">A coin</option>
      <option value="pick">A list of your own</option>
    </select>
  </p>
  {#if mode === 'dice'}
    <NumberField id="t-dice" label="Dice" min={1} max={LIMITS.results} bind:value={count} />
    <NumberField
      id="t-sides"
      label="Sides"
      min={LIMITS.sidesMin}
      max={LIMITS.sidesMax}
      bind:value={sides}
    />
  {:else if mode === 'coin'}
    <NumberField id="t-flips" label="Flips" min={1} max={LIMITS.results} bind:value={count} />
  {:else}
    <TextBox id="t-list" label="List" bind:value={list} />
    <NumberField
      id="t-picks"
      label="How many to pick"
      min={1}
      max={LIMITS.results}
      bind:value={count}
    />
  {/if}
</Frame>
