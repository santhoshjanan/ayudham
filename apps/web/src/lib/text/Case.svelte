<script lang="ts">
  import { allCases, CASE_FORMS, explain, type CaseForm } from '@pokerji/text-tools';
  import Frame from './Frame.svelte';
  import TextBox from './TextBox.svelte';

  const NAMES: Record<CaseForm, string> = {
    camel: 'camelCase',
    pascal: 'PascalCase',
    snake: 'snake_case',
    constant: 'CONSTANT_CASE',
    kebab: 'kebab-case',
    train: 'Train-Case',
    dot: 'dot.case',
    path: 'path/case',
    title: 'Title Case',
    sentence: 'Sentence case',
    upper: 'UPPER CASE',
    lower: 'lower case',
  };

  let text = $state('');
  const made = $derived(allCases(text));
</script>

<Frame
  title="Case"
  blurb="The same words in twelve forms. Each line is converted on its own."
  rows={made.ok && text !== ''
    ? CASE_FORMS.map((form) => ({ name: NAMES[form], value: made.value[form] }))
    : []}
  problem={made.ok ? undefined : explain(made.problem)}
  waiting="The twelve forms appear here as you type."
>
  <TextBox id="t-text" label="Text" bind:value={text} />
</Frame>
