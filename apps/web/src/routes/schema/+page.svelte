<script lang="ts">
  import Builder from '#lib/schema/Builder.svelte';
  import Seo from '#lib/ui/Seo.svelte';
</script>

<Seo
  title="Schema markup builder: free JSON-LD generator · ayudham.app"
  description="Build Schema.org JSON-LD for articles, products, events, local businesses and more. Free, no sign-up, and nothing you type leaves your browser."
/>

<header class="band">
  <div class="band-inner flush">
    <h1>Schema markup builder</h1>
    <p>
      Fill in a form, copy the JSON-LD, paste it into your page. Nothing you type leaves your
      browser.
    </p>
  </div>
</header>

<main class="bleed">
  <noscript>
    <p class="noscript" role="status">
      The builder needs JavaScript, because it runs in your browser and nowhere else. Turn
      JavaScript on for this site to use it.
    </p>
  </noscript>

  <Builder />

  <section class="about">
    <h2>What this builds</h2>
    <p>
      Structured data tells search engines and other readers what a page is about: that it
      describes a product with a price, an event on a date, or a business at an address. This
      builder writes it as JSON-LD, the form Schema.org and Google recommend, for you to paste
      into your page’s HTML.
    </p>
    <p>
      Ten common types have guided forms that say what search engines require and recommend. Any
      other Schema.org type, and any property of any type, can be added from the full vocabulary.
      Several items can be built together and refer to each other.
    </p>

    <h2>Where your markup goes</h2>
    <p>
      Nowhere. What you type is never sent to this site. Your draft is kept in this browser, on
      this device, so that a reload does not lose it, until you press Clear.
      <a href="/privacy">Read exactly what is stored</a>
    </p>
    <p class="hint">
      The list of types and properties is adapted from
      <a href="https://schema.org/" rel="noopener">Schema.org</a>, under the
      <a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="noopener"
        >Creative Commons Attribution-ShareAlike 3.0 licence</a
      >. <a href="/schema/LICENSES.md">What was changed</a>
    </p>
  </section>
</main>

<style>
  /* The band's words share the floor's gutter, as the room's stage does. */
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
