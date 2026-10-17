import {
  allCases,
  CASE_FORMS,
  count,
  decode,
  encode,
  explain,
  lines,
  slug,
  type CaseForm,
  type Encoding,
  type LineOptions,
  type RandomSource,
} from '@ayudham/text-tools';
import type { Row } from './tools.ts';

/**
 * A converter's work, as plain data. It crosses into the worker by structured clone, so it holds
 * nothing but text and plain options. Only work that draws no random number is sent: a shuffle
 * stays on the page, where its answer can be the one that is copied.
 */
export type Job =
  | { tool: 'case'; text: string }
  | { tool: 'slug'; text: string }
  | { tool: 'count'; text: string }
  | { tool: 'encode'; text: string; form: Encoding; decoding: boolean }
  | { tool: 'lines'; text: string; options: LineOptions };

/** What the rail shows for a job. */
export type Answer = {
  rows: Row[];
  problem?: string;
  /** Decoded bytes that are not text, shown as hex. */
  binary?: boolean;
  /** A slug line came out empty. */
  emptied?: boolean;
};

const CASE_NAMES: Record<CaseForm, string> = {
  camel: 'camelCase',
  pascal: 'PascalCase',
  snake: 'snake_case',
  constant: 'CONSTANT_CASE',
  kebab: 'kebab-case',
  train: 'Train-Case',
  dot: 'dot.case',
  path: 'path/case',
  title: 'Title Case',
  sentence: 'Sentence case',
  upper: 'UPPER CASE',
  lower: 'lower case',
};

/** A job never shuffles, so it never draws; if it ever did, the package would refuse. */
const NO_DRAWS: RandomSource = () => {
  throw new Error('a converter job drew a random number');
};

const said = (value: number): string => value.toLocaleString('en');

/** The answer to a job: the same function in the worker and, without one, on the page. */
export function answer(job: Job): Answer {
  if (job.tool === 'case') {
    const made = allCases(job.text);
    if (!made.ok) return { rows: [], problem: explain(made.problem) };
    return {
      rows: CASE_FORMS.map((form) => ({ name: CASE_NAMES[form], value: made.value[form] })),
    };
  }
  if (job.tool === 'slug') {
    const made = slug(job.text);
    if (!made.ok) return { rows: [], problem: explain(made.problem) };
    const value = made.value;
    return {
      rows: value.replaceAll('\n', '') !== '' ? [{ value }] : [],
      emptied: job.text.trim() !== '' && value.split('\n').some((line) => line === ''),
    };
  }
  if (job.tool === 'count') {
    const made = count(job.text);
    if (!made.ok) return { rows: [], problem: explain(made.problem) };
    return {
      rows: [
        { name: 'Characters', value: said(made.value.characters), plain: true },
        { name: 'Without white space', value: said(made.value.solid), plain: true },
        { name: 'Words', value: said(made.value.words), plain: true },
        { name: 'Lines', value: said(made.value.lines), plain: true },
        { name: 'Bytes', value: said(made.value.bytes), plain: true },
      ],
    };
  }
  if (job.tool === 'encode') {
    if (job.decoding) {
      const read = decode(job.text, job.form);
      if (!read.ok) return { rows: [], problem: explain(read.problem) };
      return {
        rows: read.value.text !== '' ? [{ value: read.value.text }] : [],
        binary: read.value.binary,
      };
    }
    const written = encode(job.text, job.form);
    if (!written.ok) return { rows: [], problem: explain(written.problem) };
    return { rows: written.value !== '' ? [{ value: written.value }] : [] };
  }
  const made = lines(job.text, job.options, NO_DRAWS);
  if (!made.ok) return { rows: [], problem: explain(made.problem) };
  return { rows: made.value !== '' ? [{ value: made.value }] : [] };
}
