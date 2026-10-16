import { describe, expect, it } from 'vitest';
import { explain, ok, PROBLEMS, refuse } from '../src/index.ts';

describe('results', () => {
  it('wraps a value and a refusal', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(refuse('too-long')).toEqual({ ok: false, problem: 'too-long' });
  });

  it('has a fixed sentence for every problem', () => {
    for (const problem of PROBLEMS) expect(explain(problem), problem).toMatch(/^[A-Z].*\.$/);
    expect(new Set(PROBLEMS.map(explain)).size).toBe(PROBLEMS.length);
  });
});
