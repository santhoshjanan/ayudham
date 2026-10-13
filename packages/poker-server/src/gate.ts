/** Thrown when work is turned away because too much is already waiting. */
export class GateFull extends Error {
  constructor() {
    super('too much work is waiting');
  }
}

export interface Gate {
  run<T>(work: () => Promise<T>, options?: { mustRun?: boolean }): Promise<T>;
}

/**
 * Lets at most `max` pieces of work run at once. Up to `maxWaiting` more wait
 * their turn in order; beyond that, work is refused unless it must run.
 */
export function createGate(max: number, maxWaiting: number): Gate {
  let running = 0;
  const waiting: (() => void)[] = [];
  return {
    async run(work, options = {}) {
      if (running >= max) {
        if (waiting.length >= maxWaiting && !options.mustRun) throw new GateFull();
        // The finishing job hands its place straight to this one.
        await new Promise<void>((resolve) => waiting.push(resolve));
      } else {
        running += 1;
      }
      try {
        return await work();
      } finally {
        const next = waiting.shift();
        if (next) next();
        else running -= 1;
      }
    },
  };
}
