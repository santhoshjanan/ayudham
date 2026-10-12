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

{#if form?.created}
  <header class="band">
    <div class="band-inner">
      <h1>Your room is ready</h1>
      <p>Share the room's link with your team. Anyone who has it can join.</p>
    </div>
  </header>
  <main>

    <p><a class="button" href="/poker/r/{form.created.code}">Open the room</a></p>

    <section class="secret">
      <h2>Save your moderator link</h2>
    <p>
      You own this room from this browser. To own it from another device, or if you clear your
      cookies, you need this link. Whoever opens it becomes the owner, so keep it private. It works
      once: whoever uses it is given a new one. It is shown only now.
    </p>
    <p>
      <code data-testid="recovery-link"
        >{page.url.origin}/poker/r/{form.created.code}/recover#m={form.created.recoveryToken}</code
      >
    </p>
    </section>
  </main>
{:else}
  <header class="band">
    <div class="band-inner">
      <h1>Planning poker</h1>
      <p>Start a room, share the link, and estimate together. Nobody signs up.</p>
    </div>
  </header>
  <main>

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
  </main>
{/if}
