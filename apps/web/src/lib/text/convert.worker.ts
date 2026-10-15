// The converters' worker: a script served by this site, running beside the page so that long
// text never holds up typing. It receives text from the page and returns the answer to the page.
// It makes no request and keeps nothing.
import { answer, type Job } from './jobs.ts';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; job: Job }>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (event) => {
  scope.postMessage({ id: event.data.id, answer: answer(event.data.job) });
};
