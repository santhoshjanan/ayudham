<script lang="ts">
  import { BUILT_IN_DECKS } from '@pokerji/protocol';
  import { page } from '$app/state';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  const decks = Object.entries(BUILT_IN_DECKS);
</script>

<svelte:head>
  <title>Planning poker · pokerji</title>
</svelte:head>

<main>
  <h1>Planning poker</h1>

  {#if form?.created}
    <h2>Your room is ready</h2>
    <p><a href="/poker/r/{form.created.code}">Open the room</a></p>
    <p>Share that link with your team. Anyone who has it can join.</p>

    <h3>Save your moderator link</h3>
    <p>
      You run this room from this browser. To run it from another device, or if you clear your
      cookies, you need this link. It is shown only once.
    </p>
    <p>
      <code data-testid="recovery-link"
        >{page.url.origin}/poker/r/{form.created.code}/recover#m={form.created.recoveryToken}</code
      >
    </p>
  {:else}
    {#if form?.message}
      <p role="alert">{form.message}</p>
    {/if}
    <form method="POST">
      <p>
        <label for="name">Your name</label>
        <input id="name" name="name" required maxlength="30" autocomplete="nickname" />
      </p>
      <p>
        <label for="deck">Deck</label>
        <select id="deck" name="deck">
          {#each decks as [id, deck] (id)}
            <option value={id}>{deck.name}: {deck.deck.values.join(', ')}</option>
          {/each}
        </select>
      </p>
      <p>
        Votes are recorded under the name you enter and kept for {data.retentionDays} days after the room
        was last used.
      </p>
      <button>Create room</button>
    </form>
  {/if}
</main>
