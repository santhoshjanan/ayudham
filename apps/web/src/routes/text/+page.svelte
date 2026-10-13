<script lang="ts">
  import { onMount } from 'svelte';
  import Password from '#lib/text/Password.svelte';
  import ToolRow from '#lib/text/ToolRow.svelte';
  import { toolFrom, type ToolId } from '#lib/text/tools.ts';
  import Seo from '#lib/ui/Seo.svelte';

  // The tools are drawn only once the page is running in a browser. The server could make a
  // password too, and then it would cross the network: so the server is never asked to.
  let ready = $state(false);
  let tool = $state<ToolId>('password');

  onMount(() => {
    const read = () => (tool = toolFrom(location.hash));
    read();
    ready = true;
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  });
</script>

<Seo
  title="Text tools: password generator, case converter and more · pokerji"
  description="Generate passwords, passphrases, random strings and UUIDs; convert case, Base64, hex and more. Free, no sign-up, and nothing leaves your browser."
/>

<header class="band">
  <div class="band-inner flush">
    <h1>Text tools</h1>
    <p>
      Make a password, an identifier or a random string, or turn text into another form. Nothing
      you type or make leaves your browser.
    </p>
  </div>
</header>

<main class="bleed">
  <noscript>
    <p class="noscript" role="status">
      The text tools need JavaScript, because they run in your browser and nowhere else. Turn
      JavaScript on for this site to use them.
    </p>
  </noscript>

  {#if ready}
    <div data-ready>
      <ToolRow current={tool} />
      <Password />
    </div>
  {/if}

  <section class="about">
    <h2>What these do</h2>
    <p>
      The generators make passwords, passphrases, random strings, PINs, numbers and identifiers,
      and roll dice, flip coins and pick from a list. Every one draws from your browser’s
      cryptographic random source, and no choice is weighted. The strength shown for a password
      or a passphrase is the true figure for the rule that made it.
    </p>
    <p>
      The converters change the case of text, make a slug for an address, encode and decode
      Base64, hex, URL and HTML entities, hash text with SHA-2, tidy a list of lines, and count
      characters, words, lines and bytes.
    </p>

    <h2>Where your text goes</h2>
    <p>
      Nowhere. What you type and what is made are never sent to this site, and nothing is kept:
      not in this browser, not anywhere. Close the tab and it is gone. A value you copy stays on
      your clipboard until you copy something else.
      <a href="/privacy">Read exactly what is stored</a>
    </p>
    <p class="hint">
      Passphrases use the
      <a href="https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases" rel="noopener"
        >EFF long word list</a
      >, by the Electronic Frontier Foundation, under the
      <a href="https://creativecommons.org/licenses/by/3.0/us/" rel="noopener"
        >Creative Commons Attribution 3.0 United States licence</a
      >. <a href="/text/LICENSES.md">The file and its checksum</a>
    </p>
  </section>
</main>

<style>
  /* The band's words share the floor's gutter, as the builder's do. */
  .band-inner.flush {
    width: auto;
    margin: 0;
    padding-inline: clamp(1rem, 6vw, 5rem);
  }
  .noscript {
    margin: 1.5rem clamp(1rem, 6vw, 5rem) 0;
    max-width: 40rem;
  }
  .about {
    max-width: calc(40rem + 2 * clamp(1rem, 6vw, 5rem));
    padding: 0 clamp(1rem, 6vw, 5rem) 5rem;
  }
  .about h2:first-child {
    margin-top: 1rem;
    padding-top: 1.75rem;
    border-top: 1px solid var(--line);
  }
</style>
