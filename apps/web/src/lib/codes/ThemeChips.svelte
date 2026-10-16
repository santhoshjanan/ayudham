<script lang="ts">
  import { THEMES, type Paint, type ThemeId } from '@pokerji/code-maker';
  import { cssVar } from '#lib/ui/cssVar.ts';

  let {
    chosen,
    onchoose,
    onsurprise,
  }: {
    chosen: ThemeId | null;
    onchoose: (id: ThemeId) => void;
    onsurprise: () => void;
  } = $props();

  const ends = (paint: Paint): [string, string] =>
    paint.type === 'solid'
      ? [paint.colour, paint.colour]
      : paint.type === 'linear'
        ? [paint.from, paint.to]
        : [paint.inner, paint.outer];
  const themes = Object.entries(THEMES) as [ThemeId, (typeof THEMES)[ThemeId]][];
</script>

<p class="group-label" id="c-themes-label">Themes</p>
<div class="switches" role="group" aria-labelledby="c-themes-label">
  {#each themes as [id, theme] (id)}
    {@const [from, to] = ends(theme.paint)}
    <button
      type="button"
      class="compact chip"
      aria-pressed={chosen === id}
      onclick={() => onchoose(id)}
    >
      <!-- The theme's own colours are data, set through custom properties. -->
      <span
        class="sample"
        class:radial={theme.paint.type === 'radial'}
        class:rainbow={id === 'rainbow'}
        aria-hidden="true"
        use:cssVar={{ '--from': from, '--to': to, '--paper': theme.background }}
      ></span>
      {theme.label}
    </button>
  {/each}
  <button type="button" class="compact chip" onclick={onsurprise}>
    <span class="sample surprise" aria-hidden="true"></span>
    Surprise me
  </button>
</div>

<style>
  .group-label {
    margin: 0 0 0.35rem;
    font-weight: 650;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  /* A small square sample of the theme on its own paper, bordered so it reads on either theme. */
  .sample {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: linear-gradient(135deg, var(--from) 0 50%, var(--to) 50% 100%);
  }
  .sample.radial {
    background: radial-gradient(circle, var(--from) 0 45%, var(--to) 46% 100%);
  }
  .sample.rainbow {
    background: linear-gradient(135deg, var(--from), var(--to));
  }
  /* Surprise me has no colours of its own until it is pressed: a dashed square, as "not yet". */
  .sample.surprise {
    background: none;
    border-style: dashed;
    border-color: currentColor;
  }
  button[aria-pressed='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
