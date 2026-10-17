<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<svelte:head>
  <title>History · ayudham.app</title>
</svelte:head>

<header class="band">
  <div class="band-inner">
    <a class="back" href="/poker/r/{data.code}">Back to the room</a>
    <h1>History</h1>
  </div>
</header>

<main>

  {#if form && 'notice' in form}
    <p role="status">{form.notice}</p>
  {/if}
  {#if form && 'message' in form}
    <p role="alert">{form.message}</p>
  {/if}

  {#if data.rounds.length === 0}
    <p>No rounds have been saved yet.</p>
  {:else}
    <p class="hint">The newest rounds are shown, up to 200.</p>
    {#each data.rounds as round (round.id)}
      <article data-testid="round">
        <h2>{round.title || 'Untitled'}</h2>
        <p class="meta">{round.revealed}{round.summary ? ` · ${round.summary}` : ''}</p>
        <ul class="votes">
          {#each round.votes as entry, index (index)}
            <li><b>{entry.name ?? 'Anonymous'}</b><span>: {entry.card}</span></li>
          {/each}
        </ul>
        {#if data.moderator}
          <form method="POST" action="?/deleteRound">
            <input type="hidden" name="round" value={round.id} />
            <button>Delete this round</button>
          </form>
        {/if}
      </article>
    {/each}
  {/if}

  <section>
    <h2>Your name</h2>
    <p>
      You can remove your name from the votes you cast in this room. The votes stay and show as
      "Anonymous". This works for votes cast since you last joined; if you were removed or signed
      out and came back, ask a moderator to delete the earlier rounds.
    </p>
    <form method="POST" action="?/anonymise">
      <button>Remove my name from history</button>
    </form>
  </section>

  {#if data.moderator && data.rounds.length > 0}
    <section>
      <h2>Delete all history</h2>
      <p>This removes every saved round in this room. It cannot be undone.</p>
      <form method="POST" action="?/clear">
        <button>Delete all history</button>
      </form>
    </section>
  {/if}
</main>
