<script lang="ts">
  import { explain, LINE_DEFAULTS, lines, type LineOrder } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import { random } from './random.ts';
  import TextBox from './TextBox.svelte';
  import Toggle from './Toggle.svelte';

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

  const made = $derived.by(() => {
    void turn;
    return lines(text, options, random);
  });
</script>

<Frame
  title="Lines"
  blurb="Tidy a list, one step after another, in the order the steps are shown."
  rows={made.ok && made.value !== '' ? [{ value: made.value }] : []}
  problem={made.ok ? undefined : explain(made.problem)}
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
