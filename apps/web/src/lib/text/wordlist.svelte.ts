import { readWordList, toHex, WORD_LIST_SHA256 } from '@ayudham/text-tools';

const FILE = '/text/eff_large_wordlist.txt';

/**
 * The passphrase tool's words: a file served by this site, fetched the first time the tool is
 * opened and never before. Nothing typed or made is sent to get it.
 */
class WordList {
  state = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  words = $state.raw<string[]>([]);

  async load(): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    try {
      const response = await fetch(FILE);
      if (!response.ok) throw new Error('not served');
      const data = new Uint8Array(await response.arrayBuffer());
      // Checked against the checksum built into the page, then for its shape, before a word is used.
      const sum = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
      if (sum !== WORD_LIST_SHA256) throw new Error('not the list');
      const read = readWordList(new TextDecoder().decode(data));
      if (!read.ok) throw new Error('not the list');
      this.words = read.value;
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  async retry(): Promise<void> {
    if (this.state === 'failed') this.state = 'idle';
    await this.load();
  }
}

export const wordList = new WordList();
