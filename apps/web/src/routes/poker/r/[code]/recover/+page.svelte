<script lang="ts">
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();

  // The secret is in the part of the address after "#", which the browser never
  // sends to a server. It is read here and sent in the body of the form instead.
  let token = $state('');
  $effect(() => {
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
    <p>Join the room first, then open your moderator link again.</p>
    <p><a href="/poker/r/{data.code}">Join the room</a></p>
  {:else}
    <p>This link lets you run the room from this browser.</p>
    <form method="POST">
      <input type="hidden" name="token" value={token} />
      <button disabled={token === ''}>Become a moderator</button>
    </form>
    <noscript><p>This page needs JavaScript to read the link.</p></noscript>
  {/if}
</main>
