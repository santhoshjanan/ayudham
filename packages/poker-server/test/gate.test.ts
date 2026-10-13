import { describe, expect, it } from 'vitest';
import { createGate, GateFull } from '../src/index.ts';

/** Work that finishes only when told to. */
function job() {
  let finish!: (value: string) => void;
  let fail!: (error: Error) => void;
  const done = new Promise<string>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  let started = false;
  const work = () => {
    started = true;
    return done;
  };
  return { work, finish, fail, started: () => started };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createGate', () => {
  it('runs at most the allowed number at once and starts the next as one finishes', async () => {
    const gate = createGate(2, 10);
    const jobs = [job(), job(), job()];
    const results = jobs.map((j) => gate.run(j.work));
    await settle();
    expect(jobs.map((j) => j.started())).toEqual([true, true, false]);
    jobs[0]!.finish('a');
    await settle();
    expect(jobs[2]!.started()).toBe(true);
    jobs[1]!.finish('b');
    jobs[2]!.finish('c');
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c']);
  });

  it('refuses work when the queue is full, without running it', async () => {
    const gate = createGate(1, 1);
    const [running, waiting, extra] = [job(), job(), job()];
    const first = gate.run(running.work);
    const second = gate.run(waiting.work);
    await expect(gate.run(extra.work)).rejects.toBeInstanceOf(GateFull);
    expect(extra.started()).toBe(false);
    running.finish('a');
    waiting.finish('b');
    expect(await Promise.all([first, second])).toEqual(['a', 'b']);
  });

  it('lets work that must run wait however long the queue is', async () => {
    const gate = createGate(1, 0);
    const [running, important] = [job(), job()];
    const first = gate.run(running.work);
    const second = gate.run(important.work, { mustRun: true });
    await settle();
    expect(important.started()).toBe(false);
    running.finish('a');
    important.finish('b');
    expect(await Promise.all([first, second])).toEqual(['a', 'b']);
  });

  it('frees its place when the work fails', async () => {
    const gate = createGate(1, 5);
    const [broken, next] = [job(), job()];
    const first = gate.run(broken.work);
    const second = gate.run(next.work);
    broken.fail(new Error('boom'));
    await expect(first).rejects.toThrow('boom');
    await settle();
    expect(next.started()).toBe(true);
    next.finish('ok');
    expect(await second).toBe('ok');
  });
});
