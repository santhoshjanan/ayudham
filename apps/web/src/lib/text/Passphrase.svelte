<script lang="ts">
  import { onMount } from 'svelte';
  import {
    LIMITS,
    many,
    passphrase,
    passphraseBits,
    PASSPHRASE_DEFAULTS,
    type Separator,
  } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import NumberField from './NumberField.svelte';
  import { random } from './random.ts';
  import Toggle from './Toggle.svelte';
  import { say } from './tools.ts';
  import { wordList } from './wordlist.svelte.ts';

  const SEPARATOR_NAMES: Array<[Separator, string]> = [
    ['-', 'Hyphen'],
    [' ', 'Space'],
    ['.', 'Full stop'],
    ['_', 'Underscore'],
  ];

  const options = $state({ ...PASSPHRASE_DEFAULTS });
  let count = $state(1);
  let turn = $state(0);

  const RANGE = `Words must be ${LIMITS.wordsMin} to ${LIMITS.wordsMax}, and how many 1 to ${LIMITS.results}.`;

  onMount(() => void wordList.load());

  const made = $derived.by(() => {
    void turn;
    if (wordList.state !== 'ready') return undefined;
    return many(count, () => passphrase(options, wordList.words, random));
  });
  const bits = $derived(passphraseBits(options));
  const problem = $derived(
    wordList.state === 'failed'
      ? 'The word list could not be loaded, so no passphrase was made.'
      : made && !made.ok
        ? say(made.problem, RANGE)
        : undefined,
  );
</script>

<Frame
  title="Passphrase"
  blurb="Random words from a list of 7,776: easier to type and to remember than a password."
  rows={made?.ok ? made.value.map((value) => ({ value })) : []}
  {problem}
  strength={bits.ok ? bits.value : undefined}
  keepLast={!made || made.ok || made.problem !== 'no-random'}
  waiting={wordList.state === 'loading' ? 'Loading the word list.' : 'A passphrase appears here.'}
  again={() => (turn += 1)}
  retry={wordList.state === 'failed' ? () => void wordList.retry() : undefined}
  made={made?.ok ? `${made.value.length} made.` : ''}
>
  <NumberField
    id="t-words"
    label="Words"
    min={LIMITS.wordsMin}
    max={LIMITS.wordsMax}
    bind:value={options.words}
  />
  <p class="field">
    <label for="t-separator">Separator</label>
    <select id="t-separator" bind:value={options.separator}>
      {#each SEPARATOR_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  <div class="switches">
    <Toggle label="Capitals" bind:on={options.capitals} />
    <Toggle label="Add a digit" bind:on={options.digit} />
  </div>
  <NumberField id="t-count" label="How many" min={1} max={LIMITS.results} bind:value={count} />
</Frame>
