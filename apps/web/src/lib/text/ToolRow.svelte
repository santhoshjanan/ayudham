<script lang="ts">
  import { GROUPS, TOOLS, type ToolId } from './tools.ts';

  let { current = $bindable() }: { current: ToolId } = $props();

  /** A plain click opens the tool here; a click meant for a new tab or window leaves this one alone. */
  const choose = (event: MouseEvent, id: ToolId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    current = id;
  };
</script>

<nav aria-label="Tools">
  {#each GROUPS as group (group)}
    <div class="group">
      <h2>{group}</h2>
      <ul>
        {#each TOOLS.filter((tool) => tool.group === group) as tool (tool.id)}
          <li>
            <a href="#{tool.id}" onclick={(event) => choose(event, tool.id)} aria-current={tool.id === current ? 'true' : undefined}
              >{tool.label}</a
            >
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</nav>

<style>
  nav {
    display: grid;
    gap: 1.1rem;
    padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 6vw, 5rem) 0;
  }
  h2 {
    margin: 0 0 0.6rem;
    font-size: 1.25rem;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* A link drawn as the system's compact button: each names a place, the tool's fragment. */
  a {
    display: inline-flex;
    align-items: center;
    min-height: 2.25rem;
    padding: 0.2rem 0.7rem;
    font-size: 0.95rem;
    font-weight: 650;
    text-decoration: none;
    color: var(--ink);
    background: var(--surface);
    border: 1.5px solid var(--ink);
    border-radius: var(--radius);
  }
  a:hover,
  a[aria-current='true'] {
    background: var(--ink);
    color: var(--ground);
  }
</style>
