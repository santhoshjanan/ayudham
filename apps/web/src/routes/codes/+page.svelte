<script lang="ts">
  import { onMount } from 'svelte';
  import { explain, prepareText } from '@pokerji/code-maker';
  import CodeFindings from '#lib/codes/CodeFindings.svelte';
  import CodePicker from '#lib/codes/CodePicker.svelte';
  import Downloads from '#lib/codes/Downloads.svelte';
  import CardFields from '#lib/codes/fields/CardFields.svelte';
  import EmailFields from '#lib/codes/fields/EmailFields.svelte';
  import EventFields from '#lib/codes/fields/EventFields.svelte';
  import LinkFields from '#lib/codes/fields/LinkFields.svelte';
  import PhoneFields from '#lib/codes/fields/PhoneFields.svelte';
  import PlaceFields from '#lib/codes/fields/PlaceFields.svelte';
  import SmsFields from '#lib/codes/fields/SmsFields.svelte';
  import SymbologyFields from '#lib/codes/fields/SymbologyFields.svelte';
  import WifiFields from '#lib/codes/fields/WifiFields.svelte';
  import { headingOf, kindFrom, symbologyOf } from '#lib/codes/kinds.ts';
  import LogoSection from '#lib/codes/LogoSection.svelte';
  import LookSection from '#lib/codes/LookSection.svelte';
  import OptionsSection from '#lib/codes/OptionsSection.svelte';
  import { Maker } from '#lib/codes/maker.svelte.ts';
  import PreviewBox from '#lib/codes/PreviewBox.svelte';
  import { readBack, type ReadBack } from '#lib/codes/readBack.ts';
  import SizeSection from '#lib/codes/SizeSection.svelte';
  import type { Refusal } from '#lib/codes/work.ts';
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

  // Copy image: the PNG is asked for inside the press, as a promise, so browsers that need the
  // press itself (Safari) still allow the clipboard while the file is made.
  let copied = $state('');
  const copy = () => {
    copied = '';
    const png = maker.exact('png').then((made) => {
      if (!made?.ok || !made.file) throw new Error('no image');
      return new Blob([made.file as BlobPart], { type: 'image/png' });
    });
    navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(
      () => (copied = 'Copied'),
      () => (copied = 'Copying was refused. Download the PNG instead.'),
    );
  };

  /** Whether what the browser's reader read is what the code was meant to hold. */
  function matcher(): ((read: string) => boolean) | null {
    const job = maker.job('preview');
    if (!job || !('request' in job)) return null;
    const { text, textOptions } = job.request;
    const meant = prepareText(text, { ...textOptions, eci: false }, 'utf8');
    if (!meant.ok) return null;
    const value = meant.value.text;
    // A check digit the person asked for comes back from the reader as one more character.
    const checked = maker.options[symbology.id]?.includecheck === true;
    if (symbology.group !== 'product')
      return (read) =>
        read === value || (checked && read.length === value.length + 1 && read.startsWith(value));
    // A product code's reader adds the check digit that was left off.
    const digits = value.replace(/-/g, '');
    return (read) => read === digits || (read.startsWith(digits) && read.length === digits.length + 1);
  }

  let readBackSaid = $state<ReadBack | 'reading'>('reading');
  let readings = 0;
  $effect(() => {
    // Each new code is read back; only a code that may be taken away.
    void maker.current;
    if (!exportable) return;
    const asked = ++readings;
    readBackSaid = 'reading';
    const matches = matcher();
    const format = symbology.decoder;
    const sizing = maker.sizing;
    const wide = Math.max(
      1,
      sizing.by === 'print'
        ? Math.round((Number(sizing.mm) / 25.4) * Number(sizing.dpi))
        : Number(sizing.pixels),
    );
    const timer = setTimeout(async () => {
      // Read at the size that will be taken away (at most 2,000 pixels wide), not some other.
      const png = await maker.exact('png', { kind: 'pixels', width: Math.min(2_000, wide) });
      if (asked !== readings) return;
      const said =
        png?.ok && png.file && matches ? await readBack(png.file, matches, format) : 'unavailable';
      if (asked === readings) readBackSaid = said;
    }, 300);
    return () => clearTimeout(timer);
  });
  const READ_BACK: Record<ReadBack | 'reading', string> = {
    reading: 'Reading the code back…',
    matched: 'Read back by this browser: it matched.',
    different:
      'Read back by this browser: it did not match what you typed. Change the look before using it.',
    unreadable:
      'Read back by this browser: it could not read the code. Some scanners may not read it either; see what to check below.',
    unavailable: 'This browser has no barcode reader for this code, so it was not read back here.',
  };
  const symbology = $derived(symbologyOf(maker.kind));
  // The fields of the kind on screen. Each kind keeps its own object for the visit.
  const fields = $derived(maker.fields[maker.kind] as never);

  /** A character as a person can see it: invisible ones by their code point. */
  const shownCharacter = (character: string): string =>
    /^[\p{L}\p{N}\p{P}\p{S}]$/u.test(character)
      ? character
      : `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;

  /** The sentence for a refusal, with what is known about where the trouble is. */
  const say = (refused: Refusal): string => {
    if (refused.problem === 'bad-character' && refused.detail) {
      return `${shownCharacter(refused.detail.character)} at position ${(refused.detail.at + 1).toLocaleString('en')} cannot be carried by ${symbology.label}.`;
    }
    if (refused.problem === 'too-long' && refused.over) {
      return `That is ${refused.over.toLocaleString('en')} ${refused.over === 1 ? 'character' : 'characters'} more than this code can hold at this error correction. Shorten it, or lower the error correction.`;
    }
    return explain(refused.problem);
  };
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
            transparent={maker.design.transparent}
          />
          <button type="button" class="primary" disabled={!exportable} onclick={copy}>Copy image</button>
          <span class="sr-only" role="status">{copied === 'Copied' ? 'Copied' : ''}</span>
          {#if copied && copied !== 'Copied'}<p role="status">{copied}</p>{/if}
          <Downloads {maker} disabled={!exportable} />
          {#if exportable}
            <p class="hint" data-testid="read-back" aria-live="polite">{READ_BACK[readBackSaid]}</p>
          {/if}
          {#if refusal}
            <p role="status">{say(refusal)}</p>
          {/if}
          {#if symbology.decoder === null}
            <p class="hint">
              {symbology.label} is drawn to its standard, but no reader is available here to check it.
              Test it with the reader that will scan it.
            </p>
          {/if}
          {#if maker.current?.ok}
            <CodeFindings findings={maker.current.findings} />
          {/if}
        </aside>

        <div class="sections">
          <section aria-labelledby="c-content">
            <h2 id="c-content">{headingOf(maker.kind)}</h2>
            {#if maker.kind === 'qr-link'}
              <LinkFields {fields} />
            {:else if maker.kind === 'qr-card'}
              <CardFields {fields} />
            {:else if maker.kind === 'qr-event'}
              <EventFields {fields} />
            {:else if maker.kind === 'qr-wifi'}
              <WifiFields {fields} />
            {:else if maker.kind === 'qr-place'}
              <PlaceFields {fields} />
            {:else if maker.kind === 'qr-email'}
              <EmailFields {fields} />
            {:else if maker.kind === 'qr-sms'}
              <SmsFields {fields} />
            {:else if maker.kind === 'qr-phone'}
              <PhoneFields {fields} />
            {:else}
              {#key maker.kind}
                <SymbologyFields {fields} {symbology} />
              {/key}
            {/if}
          </section>
          <OptionsSection
            {symbology}
            chosen={maker.options[symbology.id]!}
            onfix={(key) => maker.fix(symbology.id, key)}
          />
          <LookSection design={maker.design} {symbology} />
          {#if symbology.family !== 'drawn'}
            <LogoSection {maker} {symbology} />
          {/if}
          <SizeSection sizing={maker.sizing} modules={maker.shown?.width} tall={maker.shown?.height} />
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
  .rail [role='status'],
  .rail .hint {
    margin: 0;
  }
  .sections {
    min-width: 0;
  }
  /* Sections are separated by a rule, as the builder's are. */
  .sections > :global(section + section) {
    margin-top: 2.75rem;
    padding-top: 1.75rem;
    border-top: 1px solid var(--line);
  }
  .sections :global(section > h2:first-child) {
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
