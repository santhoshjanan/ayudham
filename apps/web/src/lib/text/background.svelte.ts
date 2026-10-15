import { answer, type Answer, type Job } from './jobs.ts';

type Reply = { id: number; answer: Answer };

/** The one worker for the page: not started until a converter needs it; null where there is none. */
let worker: Worker | null | undefined;
const waiting = new Map<number, { job: Job; resolve: (reply: Answer) => void }>();
let sent = 0;

function connect(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Reply>) => {
      const asked = waiting.get(event.data.id);
      waiting.delete(event.data.id);
      asked?.resolve(event.data.answer);
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
  for (const { job, resolve } of held) {
    try {
      resolve(answer(job));
    } catch {
      resolve({ rows: [] });
    }
  }
}

function work(job: Job): Promise<Answer> {
  const to = connect();
  if (!to) return Promise.resolve(answer(job));
  return new Promise((resolve) => {
    sent += 1;
    const id = sent;
    waiting.set(id, { job, resolve });
    try {
      to.postMessage({ id, job });
    } catch {
      // A job the worker cannot be handed (it could not be copied across) is answered here.
      waiting.delete(id);
      resolve(answer(job));
    }
  });
}

/**
 * One converter's answers, worked out off the page's main thread. Only the latest job is ever
 * shown: while one is being worked on, further keystrokes replace the next job instead of
 * queueing behind it. The last answer stays on screen until the new one arrives.
 */
export class Background {
  current = $state.raw<Answer | undefined>(undefined);
  busy = $state(false);
  #latest: Job | undefined;
  #asked = 0;
  #answered = 0;
  #running = false;

  /** Asks for a job's answer; `undefined` clears the answer, as for an empty box. */
  ask(job: Job | undefined): void {
    this.#asked += 1;
    this.#latest = job;
    if (!job) {
      this.#answered = this.#asked;
      this.current = undefined;
      this.busy = false;
      return;
    }
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
          this.current = reply;
          this.#answered = asked;
          this.busy = false;
        }
      }
    } finally {
      // Whatever happened, the next keystroke starts the work again.
      this.#running = false;
    }
  }

  /**
   * The answer for what is typed now. Called by Copy: if the worker has not answered yet, the
   * answer is worked out here, at once, so a copy never holds results for older text.
   */
  exact(): Answer | undefined {
    if (this.#answered < this.#asked && this.#latest) {
      this.current = answer(this.#latest);
      this.#answered = this.#asked;
      this.busy = false;
    }
    return this.current;
  }
}
