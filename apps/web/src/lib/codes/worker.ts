// The code maker's worker: a script served by this site, running beside the page so that a large
// code never holds up typing. bwip-js, the encoder, is loaded here the first time a code is made,
// from this site. The worker makes no other request and keeps nothing.
import type { Bwip } from '@ayudham/code-maker';
import { answer, type Job } from './work.ts';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; job: Job }>) => void) | null;
  postMessage(message: unknown): void;
};

let bwip: Promise<Bwip> | undefined;
const load = (): Promise<Bwip> =>
  (bwip ??= import('bwip-js/generic').then(
    (module) => ((module as { default?: Bwip }).default ?? module) as Bwip,
  ));

scope.onmessage = async (event) => {
  const { id, job } = event.data;
  try {
    scope.postMessage({ id, answer: await answer(job, await load()) });
  } catch {
    // Anything unexpected hands the job back to the page, which works it out itself.
    scope.postMessage({ id, failed: true });
  }
};
