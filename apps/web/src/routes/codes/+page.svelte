<script lang="ts">
  import { onMount } from 'svelte';
  import { explain } from '@pokerji/code-maker';
  import CodePicker from '#lib/codes/CodePicker.svelte';
  import LinkFields from '#lib/codes/fields/LinkFields.svelte';
  import { headingOf, kindFrom, symbologyOf } from '#lib/codes/kinds.ts';
  import { Maker } from '#lib/codes/maker.svelte.ts';
  import type { LinkFields as Link } from '#lib/codes/payload.ts';
  import PreviewBox from '#lib/codes/PreviewBox.svelte';
  import Seo from '#lib/ui/Seo.svelte';

  // The maker is drawn only once the page is running in a browser: the server never makes a code.
  let ready = $state(false);
  const maker = new Maker();

  onMount(() => {
    const read = () => (maker.kind = kindFrom(location.hash));
    read();
    ready = true;
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  });

  $effect(() => {
    if (ready) maker.ask();
  });

  const refusal = $derived(maker.current && !maker.current.ok ? maker.current : undefined);
  const exportable = $derived(
    !!maker.current?.ok && !maker.current.findings.some((finding) => finding.level === 'refusal'),
  );
</script>

<Seo
  title="Barcode and QR code maker: free, private, no sign-up · pokerji"
  description="Make QR codes for links, Wi-Fi, business cards and events, and barcodes such as EAN-13, Code 128, Data Matrix and PDF417. Nothing leaves your browser."
/>

<header class="band">
  <div class="band-inner flush">
    <h1>Barcodes and QR codes</h1>
    <p>
      Make a code for a link, a Wi-Fi network, a business card or a product. Nothing you type or
      add leaves your browser.
    </p>
  </div>
</header>

<main class="bleed">
  <noscript>
    <p class="noscript" role="status">
      The code maker needs JavaScript, because it makes every code in your browser and nowhere
      else. Turn JavaScript on for this site to use it.
    </p>
  </noscript>

  {#if ready}
    <div class="code-maker" data-ready>
      <CodePicker bind:kind={maker.kind} />
      <div class="floor">
        <!-- The code and what to do with it. Not offered to a browser's translator, which may send
             page text away. -->
        <aside class="rail" aria-label="Your code" translate="no">
          <PreviewBox
            shown={maker.shown}
            label={symbologyOf(maker.kind).label}
            old={!!refusal}
            busy={maker.busy}
            transparent={maker.look.background === null}
          />
          <button type="button" class="primary" disabled={!exportable}>Copy image</button>
          {#if refusal}
            <p role="status">
              {explain(refusal.problem)}
            </p>
          {/if}
        </aside>

        <div class="sections">
          <section aria-labelledby="c-content">
            <h2 id="c-content">{headingOf(maker.kind)}</h2>
            {#if maker.kind === 'qr-link'}
              <LinkFields fields={maker.fields['qr-link'] as Link} />
            {/if}
          </section>
        </div>
      </div>
    </div>
  {/if}

  <section class="about">
    <h2>What this makes</h2>
    <p>
      QR codes for a link, some text, a business card, an event, a Wi-Fi network, a place, an
      email, a text message or a phone number; and other 2D codes, product codes and barcodes:
      Data Matrix, Aztec, PDF417, MaxiCode, EAN-13, UPC, Code 128, Code 39 and more. Each is drawn
      to its standard, and the page tells you before you take it away if it may not scan.
    </p>

    <h2>Where your code goes</h2>
    <p>
      Nowhere. Nothing you type, choose or add is sent to this site or any other, and nothing is
      kept: not in this browser, not anywhere. Close the tab and it is gone. An image you copy is
      on your device’s clipboard for as long as your device keeps it there.
      <a href="/privacy">Read exactly what is stored</a>
    </p>
    <p class="hint">
      Codes are encoded by
      <a href="https://github.com/metafloor/bwip-js" rel="noopener">bwip-js</a>, by Mark Warren,
      and files are packed by <a href="https://github.com/101arrowz/fflate" rel="noopener">fflate</a
      >, by Arjun Barrett, both under the MIT licence and both served from this site.
    </p>
  </section>
</main>

<style>
  /* The band's words share the floor's gutter, as the text tools' do. */
  .band-inner.flush {
    width: auto;
    margin: 0;
    padding-inline: clamp(1rem, 6vw, 5rem);
  }
  .noscript {
    margin: 1.5rem clamp(1rem, 6vw, 5rem) 0;
    max-width: 40rem;
  }
  /* The floor: ruled sections, and the code's rail. Below 64rem the rail comes first, so a phone
     shows the code before the fields that change it. */
  .floor {
    display: grid;
    gap: 2rem;
    padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1rem, 6vw, 5rem) clamp(1.5rem, 4vw, 3rem);
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
  }
  @media (min-width: 64rem) {
    .floor {
      grid-template-columns: minmax(0, 40rem) minmax(22rem, 36rem);
      gap: 2.5rem;
    }
    .rail {
      grid-column: 2;
      grid-row: 1;
      position: sticky;
      top: 1rem;
      max-height: calc(100dvh - 2rem);
      overflow-y: auto;
    }
    .sections {
      grid-column: 1;
      grid-row: 1;
    }
  }
  .rail {
    display: grid;
    gap: 0.6rem;
    padding: 1.1rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-width: 0;
  }
  /* The rail's first control is the next thing to do, set as the room's Reveal is. */
  .rail .primary {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 1.5rem;
    letter-spacing: 0.03em;
    min-height: 3.5rem;
  }
  .rail [role='status'] {
    margin: 0;
  }
  .sections {
    min-width: 0;
  }
  /* Sections are separated by a rule, as the builder's are. */
  .sections > section + :global(section) {
    margin-top: 2.75rem;
    padding-top: 1.75rem;
    border-top: 1px solid var(--line);
  }
  .sections h2 {
    margin-top: 0;
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
