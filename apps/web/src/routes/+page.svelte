<script lang="ts">
  import DemoRow from '#lib/ui/DemoRow.svelte';
  import Seo from '#lib/ui/Seo.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<Seo
  title="pokerji: free planning poker, schema markup, text tools and QR codes, no sign-up"
  description="Free tools without the sign-up: planning poker, a Schema.org JSON-LD builder, password and text tools, and a QR code and barcode maker. No account, no trackers."
/>

<header class="band wide">
  <div class="band-inner split">
    <div>
      <h1>Small tools, without the sign-up.</h1>
      <p>
        Free small tools for teams. No accounts, no trackers: open one, use it, get on with the
        work.
      </p>
    </div>
    <DemoRow />
  </div>
</header>

<main class="wide">
  <ul class="programme">
    <li>
      <div>
        <h2>Planning poker</h2>
        <p>
          Free online planning poker for sprint estimation. Everyone scores in secret, every card turns in the same
          instant, and the highest and lowest explain first.
        </p>
      </div>
      <a class="button" href="/poker">Start a room</a>
    </li>
    <li>
      <div>
        <h2>Schema markup builder</h2>
        <p>
          Build Schema.org JSON-LD for articles, products, events, local businesses and more.
          Fill in a form and copy the markup; nothing you type leaves your browser.
        </p>
      </div>
      <a class="button" href="/schema">Build markup</a>
    </li>

    <li>
      <div>
        <h2>Text tools</h2>
        <p>
          Passwords, passphrases, random strings and identifiers; case, Base64, hex, hashes and
          more. Everything is made in your browser, and nothing is sent or kept.
        </p>
      </div>
      <a class="button" href="/text">Open the tools</a>
    </li>

    <li>
      <div>
        <h2>Barcodes and QR codes</h2>
        <p>
          QR codes for links, Wi-Fi, business cards and events; product barcodes, Data Matrix,
          PDF417 and more, styled and checked to scan. Made in your browser, never sent or kept.
        </p>
      </div>
      <a class="button" href="/codes">Make a code</a>
    </li>
  </ul>

  <section>
    <h2>How it stays private</h2>
    <dl class="claims">
      <div>
        <dt>Nothing to sign up for</dt>
        <dd>There is no account, email field or login anywhere. You type a display name.</dd>
      </div>
      <div>
        <dt>Nothing from anyone else</dt>
        <dd>
          Your browser is told to refuse anything this site did not serve itself, so no tracker
          can load.
        </dd>
      </div>
      <div>
        <dt>Gone after {data.retentionDays} days</dt>
        <dd>
          A room and everything in it is deleted {data.retentionDays} days after it was last used,
          or at once when its owner says so.
        </dd>
      </div>
    </dl>
    <p><a href="/privacy">Read exactly what is stored</a></p>
  </section>
</main>
