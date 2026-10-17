<script lang="ts">
  import {
    LIMITS,
    many,
    password,
    passwordBits,
    PASSWORD_DEFAULTS,
  } from '@ayudham/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from '#lib/ui/NumberField.svelte';
  import { random } from './random.ts';
  import Toggle from '#lib/ui/Toggle.svelte';
  import { say } from './tools.ts';

  const options = $state({ ...PASSWORD_DEFAULTS });
  let count = $state(1);
  let turn = $state(0);

  const RANGE = `Length must be ${LIMITS.passwordMin} to ${LIMITS.length}, and how many 1 to ${LIMITS.results}.`;

  // Made again whenever an option changes, and when Generate again adds a turn.
  const made = $derived.by(() => {
    void turn;
    return many(count, () => password(options, random));
  });
  const bits = $derived(passwordBits(options));
</script>

<Frame
  title="Password"
  blurb="Random characters, with at least one of every kind you leave on."
  rows={made.ok ? made.value.map((value) => ({ value })) : []}
  problem={made.ok ? undefined : say(made.problem, RANGE)}
  strength={bits.ok ? bits.value : undefined}
  keepLast={made.ok || made.problem !== 'no-random'}
  waiting="A password appears here."
  again={() => (turn += 1)}
  made={made.ok ? `${made.value.length} made.` : ''}
>
  <NumberField
    id="t-length"
    label="Length"
    min={LIMITS.passwordMin}
    max={LIMITS.length}
    bind:value={options.length}
  />
  <div class="switches" role="group" aria-label="Characters to use">
    <Toggle label="Lowercase" bind:on={options.lower} />
    <Toggle label="Uppercase" bind:on={options.upper} />
    <Toggle label="Digits" bind:on={options.digits} />
    <Toggle label="Symbols" bind:on={options.symbols} />
  </div>
  <div class="switches">
    <Toggle label="No look-alikes" bind:on={options.plain} />
  </div>
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
</Frame>
