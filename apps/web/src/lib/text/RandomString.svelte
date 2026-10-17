<script lang="ts">
  import {
    LIMITS,
    many,
    randomString,
    stringBits,
    STRING_SIZES,
    type LetterCase,
    type StringKind,
  } from '@ayudham/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from '#lib/ui/NumberField.svelte';
  import { random } from './random.ts';
  import { say } from './tools.ts';

  const KIND_NAMES: Array<[StringKind, string]> = [
    ['hex', 'Hex'],
    ['base64', 'Base64'],
    ['base64url', 'Base64URL'],
    ['digits', 'Digits'],
    ['letters', 'Letters'],
    ['alphanumeric', 'Letters and digits'],
    ['own', 'Your own characters'],
  ];
  const LETTER_NAMES: Array<[LetterCase, string]> = [
    ['both', 'Both cases'],
    ['lower', 'Lowercase'],
    ['upper', 'Uppercase'],
  ];

  let kind = $state<StringKind>('hex');
  let size = $state<number>(STRING_SIZES.hex);
  let letters = $state<LetterCase>('both');
  let alphabet = $state('');
  let count = $state(1);
  let turn = $state(0);

  // Hex and both Base64 kinds are sized in bytes; the rest in characters.
  const inBytes = $derived(kind === 'hex' || kind === 'base64' || kind === 'base64url');
  const unit = $derived(inBytes ? 'Bytes' : 'Characters');
  const top = $derived(inBytes ? LIMITS.bytes : LIMITS.length);
  const options = $derived({ kind, size, letters, alphabet });

  const made = $derived.by(() => {
    void turn;
    return many(count, () => randomString(options, random));
  });
  const bits = $derived(stringBits(options));
  const range = $derived(
    `${unit} must be 1 to ${top}, and how many 1 to ${LIMITS.results}.`,
  );

  /** A new kind starts at its own usual size. */
  const chosen = (event: Event & { currentTarget: HTMLSelectElement }) => {
    size = STRING_SIZES[event.currentTarget.value as StringKind] ?? size;
  };
</script>

<Frame
  mode={kind}
  title="Random string"
  blurb="Random bytes written as hex or Base64, or random characters from a set."
  rows={made.ok ? made.value.map((value) => ({ value })) : []}
  problem={made.ok ? undefined : say(made.problem, range)}
  strength={bits.ok ? bits.value : undefined}
  keepLast={made.ok || made.problem !== 'no-random'}
  waiting="A random string appears here."
  again={() => (turn += 1)}
  made={made.ok ? `${made.value.length} made.` : ''}
>
  <p class="field">
    <label for="t-kind">Kind</label>
    <select id="t-kind" bind:value={kind} onchange={chosen}>
      {#each KIND_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  {#if kind === 'letters'}
    <p class="field">
      <label for="t-letters">Letters</label>
      <select id="t-letters" bind:value={letters}>
        {#each LETTER_NAMES as [value, name] (value)}
          <option {value}>{name}</option>
        {/each}
      </select>
    </p>
  {/if}
  {#if kind === 'own'}
    <p class="field">
      <label for="t-alphabet">Characters to use</label>
      <input
        id="t-alphabet"
        type="text"
        maxlength={LIMITS.alphabetMax * 2}
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        aria-describedby="t-alphabet-hint"
        bind:value={alphabet}
      />
      <span class="hint" id="t-alphabet-hint"
        >{LIMITS.alphabetMin} to {LIMITS.alphabetMax} different characters, with no spaces.</span
      >
    </p>
  {/if}
  <NumberField id="t-size" label={unit} min={1} max={top} bind:value={size} />
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
</Frame>
