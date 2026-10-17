<script lang="ts">
  import { explain, LINE_DEFAULTS, lines, type LineOrder } from '@ayudham/text-tools';
  import { Background } from './background.svelte.ts';
  import Frame from './Frame.svelte';
  import { random } from './random.ts';
  import TextBox from '#lib/ui/TextBox.svelte';
  import Toggle from '#lib/ui/Toggle.svelte';

  const ORDER_NAMES: Array<[LineOrder, string]> = [
    ['keep', 'As typed'],
    ['az', 'A to Z'],
    ['za', 'Z to A'],
    ['reverse', 'Reversed'],
    ['shuffle', 'Shuffled'],
  ];

  const options = $state({ ...LINE_DEFAULTS, trim: false });
  let text = $state('');
  let turn = $state(0);

  // A shuffle draws random numbers, so it is worked out here, where the copy is the one shown.
  // Every other order is the same each time, and goes to the worker.
  const shuffling = $derived(options.order === 'shuffle');
  const shuffled = $derived.by(() => {
    void turn;
    if (!shuffling) return undefined;
    const made = lines(text, options, random);
    return made.ok
      ? { rows: made.value !== '' ? [{ value: made.value }] : [] }
      : { rows: [], problem: explain(made.problem) };
  });
  const work = new Background();
  $effect(() => {
    const job = { tool: 'lines' as const, text, options: $state.snapshot(options) };
    work.ask(shuffling || text === '' ? undefined : job);
  });
  const shown = $derived(shuffled ?? work.current);
</script>

<Frame
  title="Lines"
  blurb="Tidy a list, one step after another, in the order the steps are shown."
  rows={shown?.rows ?? []}
  problem={shown?.problem}
  exact={() => (shuffled ?? work.exact())?.rows ?? []}
  busy={work.busy}
  waiting="The tidied list appears here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
  <div class="switches" role="group" aria-label="Steps">
    <Toggle label="Trim each line" bind:on={options.trim} />
    <Toggle label="Remove blank lines" bind:on={options.blanks} />
    <Toggle label="Remove repeats" bind:on={options.unique} />
    <Toggle label="Ignore case" bind:on={options.ignoreCase} />
  </div>
  <p class="field">
    <label for="t-order">Order</label>
    <select id="t-order" bind:value={options.order}>
      {#each ORDER_NAMES as [value, name] (value)}
        <option {value}>{name}</option>
      {/each}
    </select>
  </p>
  {#if options.order === 'shuffle'}
    <p class="field"><button type="button" onclick={() => (turn += 1)}>Shuffle again</button></p>
  {/if}
  <div class="switches">
    <Toggle label="Number the lines" bind:on={options.number} />
  </div>
</Frame>
