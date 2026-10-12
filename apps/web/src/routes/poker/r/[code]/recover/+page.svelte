<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  // The secret is in the part of the address after "#", which the browser never
  // sends to a server. It is read here and sent in the body of the form instead.
  let token = $state('');
  $effect(() => {
    // Someone who has not joined cannot use the secret yet. It stays in the
    // address so that it is still there when they come back after joining.
    if (!data.joined) return;
    const read = () => {
      const found = new URLSearchParams(location.hash.slice(1)).get('m');
      if (found === null) return;
      token = found;
      // Take the secret out of the address bar and the history entry at once.
      // Browsers carry a fragment across a redirect, so leaving it would put the
      // secret on the room's address, where it could be copied and shared.
      history.replaceState(history.state, '', location.pathname);
    };
    read();
    // Opening another moderator link on this page changes only the fragment.
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  });
</script>

<svelte:head>
  <title>Moderator link · pokerji</title>
</svelte:head>

<main>
  <h1>Moderator link</h1>

  {#if form?.message}
    <p role="alert">{form.message}</p>
  {/if}

  {#if !data.joined}
    <p>
      Join the room first, then open your moderator link again. Keep the link: you will need it
      after you have joined.
    </p>
    <p><a href="/poker/r/{data.code}">Join the room</a></p>
  {:else}
    <p>This link lets you run the room from this browser.</p>
    <form method="POST">
      <input type="hidden" name="token" value={token} />
      <button disabled={token === ''}>Become a moderator</button>
    </form>
    {#if token === ''}
      <p>
        This page has no moderator link to use. Open the full link you saved; it ends in a long
        code after "#m=".
      </p>
    {/if}
    <noscript><p>This page needs JavaScript to read the link.</p></noscript>
  {/if}
</main>
