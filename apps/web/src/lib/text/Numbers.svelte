<script lang="ts">
  import { LIMITS, many, numberBetween, pin } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import { say } from './tools.ts';

  let mode = $state<'pin' | 'number'>('pin');
  let digits = $state(6);
  let from = $state(1);
  let to = $state(100);
  let count = $state(1);
  let turn = $state(0);

  const made = $derived.by(() => {
    void turn;
    return many<string>(count, () => {
      if (mode === 'pin') return pin(digits, random);
      const drawn = numberBetween(from, to, random);
      return drawn.ok ? { ok: true as const, value: String(drawn.value) } : drawn;
    });
  });
  const range = $derived(
    mode === 'pin'
      ? `Digits must be ${LIMITS.pinMin} to ${LIMITS.pinMax}, and how many 1 to ${LIMITS.results}.`
      : `Both ends must be whole numbers no further from zero than ${LIMITS.bound.toLocaleString('en')}, and how many 1 to ${LIMITS.results}.`,
  );
</script>

<Frame
  mode={mode}
  title="PIN and number"
  blurb="A PIN of random digits, or a whole number between two ends, both included."
  rows={made.ok ? made.value.map((value) => ({ value })) : []}
  problem={made.ok ? undefined : say(made.problem, range)}
  keepLast={made.ok || made.problem !== 'no-random'}
  waiting="A number appears here."
  again={() => (turn += 1)}
  made={made.ok ? `${made.value.length} made.` : ''}
>
  <p class="field">
    <label for="t-make">Make</label>
    <select id="t-make" bind:value={mode}>
      <option value="pin">A PIN</option>
      <option value="number">A number in a range</option>
    </select>
  </p>
  {#if mode === 'pin'}
    <NumberField
      id="t-digits"
      label="Digits"
      min={LIMITS.pinMin}
      max={LIMITS.pinMax}
      bind:value={digits}
    />
  {:else}
    <NumberField id="t-from" label="From" min={-LIMITS.bound} max={LIMITS.bound} bind:value={from} />
    <NumberField id="t-to" label="To" min={-LIMITS.bound} max={LIMITS.bound} bind:value={to} />
  {/if}
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
</Frame>
