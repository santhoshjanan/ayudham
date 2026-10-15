import { describe, expect, it } from 'vitest';
import { allCases, CASE_FORMS, convertCase, refuse, words, type CaseForm } from '../src/index.ts';

const to = (text: string, form: CaseForm): string => {
  const made = convertCase(text, form);
  if (!made.ok) throw new Error(made.problem);
  return made.value;
};

describe('words', () => {
  it('splits at spaces and punctuation', () => {
    expect(words('hello, world! foo_bar-baz.qux/x')).toEqual([
      'hello',
      'world',
      'foo',
      'bar',
      'baz',
      'qux',
      'x',
    ]);
  });

  it('splits where the case changes and keeps a run of capitals together', () => {
    expect(words('parseHTTPResponse')).toEqual(['parse', 'HTTP', 'Response']);
    expect(words('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(words('HTTP')).toEqual(['HTTP']);
    expect(words('iPhone')).toEqual(['i', 'Phone']);
  });

  it('splits letters from digits', () => {
    expect(words('response2now')).toEqual(['response', '2', 'now']);
    expect(words('v10beta')).toEqual(['v', '10', 'beta']);
  });

  it('drops apostrophes so a word stays whole', () => {
    expect(words("don't stop")).toEqual(['dont', 'stop']);
    expect(words('it’s')).toEqual(['its']);
  });

  it('knows letters beyond ASCII', () => {
    expect(words('crèmeBrûlée')).toEqual(['crème', 'Brûlée']);
    expect(words('привет мир')).toEqual(['привет', 'мир']);
    expect(words('école')).toEqual(['école']);
    expect(words('日本語 テスト')).toEqual(['日本語', 'テスト']);
  });

  it('finds none in punctuation', () => {
    expect(words('  --  ')).toEqual([]);
  });
});

describe('the programming forms', () => {
  const INPUT = 'parseHTTPResponse2 now';
  const expected: Array<[CaseForm, string]> = [
    ['camel', 'parseHttpResponse2Now'],
    ['pascal', 'ParseHttpResponse2Now'],
    ['snake', 'parse_http_response_2_now'],
    ['constant', 'PARSE_HTTP_RESPONSE_2_NOW'],
    ['kebab', 'parse-http-response-2-now'],
    ['train', 'Parse-Http-Response-2-Now'],
    ['dot', 'parse.http.response.2.now'],
    ['path', 'parse/http/response/2/now'],
  ];
  for (const [form, value] of expected) {
    it(form, () => expect(to(INPUT, form)).toBe(value));
  }

  it('converts each line on its own', () => {
    expect(to('first name\r\nLastName\n\nUSER_ID', 'camel')).toBe('firstName\nlastName\n\nuserId');
  });

  it('handles accented letters', () => {
    expect(to('crème brûlée', 'pascal')).toBe('CrèmeBrûlée');
    expect(to('Élan vital', 'snake')).toBe('élan_vital');
  });
});

describe('title case', () => {
  it('capitalises words and keeps small words small', () => {
    expect(to("the return of the iPhone: a buyer's guide", 'title')).toBe(
      "The Return of the iPhone: A Buyer's Guide",
    );
  });

  it('capitalises a small word that is first, last or after a colon', () => {
    expect(to('of mice and men', 'title')).toBe('Of Mice and Men');
    expect(to('what it is for', 'title')).toBe('What It Is For');
    expect(to('war: the sequel', 'title')).toBe('War: The Sequel');
  });

  it('lowers a small word typed with a capital', () => {
    expect(to('Lord Of The Rings', 'title')).toBe('Lord of the Rings');
  });

  it('leaves words with a capital inside as typed, unless everything is capitals', () => {
    expect(to('a NASA and eBay story', 'title')).toBe('A NASA and eBay Story');
    expect(to('THE LORD OF THE RINGS', 'title')).toBe('The Lord of the Rings');
  });

  it('keeps spacing and punctuation, and treats each line as a title', () => {
    expect(to('  "hello"   (world)  ', 'title')).toBe('  "Hello"   (World)  ');
    expect(to('the end\nthe start', 'title')).toBe('The End\nThe Start');
  });
});

describe('sentence case', () => {
  it('capitalises only the start of each sentence', () => {
    expect(to("the return of the iPhone: a buyer's guide", 'sentence')).toBe(
      "The return of the iPhone: a buyer's guide",
    );
    expect(to('Hello World. How Are You? fine! OK then', 'sentence')).toBe(
      'Hello world. How are you? Fine! OK then',
    );
  });

  it('keeps the word I', () => {
    expect(to("so i said i'm sure i’ll go", 'sentence')).toBe("So I said I'm sure I’ll go");
  });

  it('starts a sentence after a closing quote or bracket', () => {
    expect(to('she said "no." then left (really.) yes', 'sentence')).toBe(
      'She said "no." Then left (really.) Yes',
    );
  });

  it('lowers everything first when the text is all capitals', () => {
    expect(to('HELLO WORLD. NASA ROCKS', 'sentence')).toBe('Hello world. Nasa rocks');
  });
});

describe('upper and lower', () => {
  it('changes every letter', () => {
    expect(to("The iPhone: a Buyer's Guide", 'upper')).toBe("THE IPHONE: A BUYER'S GUIDE");
    expect(to("The iPhone: a Buyer's Guide", 'lower')).toBe("the iphone: a buyer's guide");
  });
});

describe('convertCase', () => {
  it('gives an empty answer for empty text', () => {
    for (const form of CASE_FORMS) expect(to('', form)).toBe('');
  });

  it('refuses an unknown form and text over the limit', () => {
    expect(convertCase('a', 'sponge' as CaseForm)).toEqual(refuse('out-of-range'));
    expect(convertCase('x'.repeat(100_001), 'camel')).toEqual(refuse('too-long'));
  });

  it('is quick on a long run of punctuation inside a word', () => {
    const awkward = 'a' + '!'.repeat(99_990) + 'a';
    const started = performance.now();
    for (const form of CASE_FORMS) expect(convertCase(awkward, form).ok).toBe(true);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe('allCases', () => {
  it('gives every form at once', () => {
    const made = allCases('hello world');
    if (!made.ok) throw new Error(made.problem);
    expect(Object.keys(made.value)).toEqual([...CASE_FORMS]);
    expect(made.value.kebab).toBe('hello-world');
    expect(made.value.title).toBe('Hello World');
  });

  it('refuses text over the limit', () => {
    expect(allCases('x'.repeat(100_001))).toEqual(refuse('too-long'));
  });
});

describe('letters written with combining marks', () => {
  it('stay whole words', () => {
    expect(words('हिन्दी भाषा')).toEqual(['हिन्दी', 'भाषा']);
    expect(words('مَرْحَبًا بكم')).toEqual(['مَرْحَبًا', 'بكم']);
    expect(words('q̃a b')).toEqual(['q̃a', 'b']);
    // NFC joins A and its tilde into one letter; Q has no such form and keeps its mark.
    expect(words('Q\u0303A\u0303Bc')).toEqual(['Q\u0303\u00C3', 'Bc']);
  });

  it('survive every form', () => {
    expect(to('हिन्दी भाषा', 'snake')).toBe('हिन्दी_भाषा');
    expect(to('हिन्दी भाषा', 'title')).toBe('हिन्दी भाषा');
    expect(to('"q̃a"', 'title')).toBe('"Q̃a"');
  });
});
