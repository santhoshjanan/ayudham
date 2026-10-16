import type { Bwip } from '@pokerji/code-maker';
import { OTHER_GROUPS, QR_KINDS, type KindId } from './kinds.ts';
import { blankFields, payloadFor } from './payload.ts';
import { answer, type Answer, type Job, type Look, type Made, type Output } from './work.ts';

type Reply = { id: number; answer?: Answer; failed?: true };

/** bwip-js on the page, loaded only when there is no worker to load it. */
let local: Promise<Bwip> | undefined;
const loadHere = (): Promise<Bwip> =>
  (local ??= import('bwip-js/generic').then(
    (module) => ((module as { default?: Bwip }).default ?? module) as Bwip,
  ));

async function here(job: Job): Promise<Answer> {
  try {
    return await answer(job, await loadHere());
  } catch {
    return { ok: false, problem: 'not-encodable' };
  }
}

/** The one worker for the page: not started until a code is made; null where there is none. */
let worker: Worker | null | undefined;
const waiting = new Map<number, { job: Job; resolve: (reply: Answer) => void }>();
let sent = 0;

function connect(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      if (event.data.failed) return giveUp();
      const asked = waiting.get(event.data.id);
      waiting.delete(event.data.id);
      if (asked && event.data.answer) asked.resolve(event.data.answer);
    };
    worker.onerror = giveUp;
    worker.onmessageerror = giveUp;
  } catch {
    worker = null;
  }
  return worker;
}

/** The worker failed or never loaded: finish what it held here, and do all later work here too. */
function giveUp(): void {
  worker?.terminate();
  worker = null;
  const held = [...waiting.values()];
  waiting.clear();
  for (const { job, resolve } of held) void here(job).then(resolve);
}

function work(job: Job): Promise<Answer> {
  const to = connect();
  if (!to) return here(job);
  return new Promise((resolve) => {
    sent += 1;
    const id = sent;
    waiting.set(id, { job, resolve });
    try {
      to.postMessage({ id, job });
    } catch {
      // A worker that cannot be handed a job is no longer trusted with any.
      waiting.delete(id);
      giveUp();
      void here(job).then(resolve);
    }
  });
}

export const DEFAULT_LOOK: Look = {
  dots: 'square',
  ring: 'square',
  eye: 'square',
  foreground: { type: 'solid', colour: '#111417' },
  background: '#ffffff',
  corners: null,
  theme: null,
  quietZone: 4,
  logo: null,
};

const ALL_KINDS: KindId[] = [
  ...QR_KINDS.map((kind) => kind.id),
  ...OTHER_GROUPS.flatMap((group) => group.ids),
];

/**
 * Every choice on the page, and the code they make. Each kind keeps its own fields for the visit,
 * so switching kind never carries one kind's text into another's code. Only the latest request is
 * worked on: while one is being made, further changes replace the next instead of queueing, and
 * the last code stays on screen until the new one arrives.
 */
export class Maker {
  kind = $state<KindId>('qr-link');
  fields = $state<Record<string, Record<string, unknown>>>(
    Object.fromEntries(ALL_KINDS.map((kind) => [kind, blankFields(kind)])),
  );
  look = $state<Look>(structuredClone(DEFAULT_LOOK));
  /** The answer for the latest request: a code, or why there is none. */
  current = $state.raw<Answer | undefined>(undefined);
  /** The last code made, kept on screen beneath a refusal. */
  shown = $state.raw<Made | undefined>(undefined);
  busy = $state(false);
  #latest: Job | undefined;
  #asked = 0;
  #answered = 0;
  #running = false;

  /** The job for every choice as it is now, or the reason there is none. */
  job(output: Output): Job | Exclude<Answer, Made> | undefined {
    const payload = payloadFor(this.kind, $state.snapshot(this.fields[this.kind]) ?? {});
    if (!payload.ok) return payload.problem === 'empty' ? undefined : payload;
    return {
      request: { ...payload.value, options: {} },
      look: $state.snapshot(this.look) as Look,
      output,
    };
  }

  #show(reply: Answer | undefined): void {
    this.current = reply;
    if (reply?.ok) this.shown = reply;
    else if (!reply) this.shown = undefined;
  }

  /** Asks for the code every choice makes now. Reads them all, so an effect re-asks on any change. */
  ask(): void {
    const job = this.job('preview');
    this.#asked += 1;
    if (!job || !('request' in job)) {
      this.#latest = undefined;
      this.#answered = this.#asked;
      this.#show(job);
      this.busy = false;
      return;
    }
    this.#latest = job;
    this.busy = true;
    if (!this.#running) void this.#run();
  }

  async #run(): Promise<void> {
    this.#running = true;
    try {
      while (this.#answered < this.#asked && this.#latest) {
        const asked = this.#asked;
        const reply = await work(this.#latest);
        if (asked === this.#asked && this.#answered < asked) {
          this.#show(reply);
          this.#answered = asked;
          this.busy = false;
        }
      }
    } finally {
      this.#running = false;
    }
  }

  /** A file (or the preview) for every choice as it is now, never for an older request. */
  async exact(output: Output): Promise<Answer | undefined> {
    const job = this.job(output);
    if (!job || !('request' in job)) return job;
    return work(job);
  }
}
