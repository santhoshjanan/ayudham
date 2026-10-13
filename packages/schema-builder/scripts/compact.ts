type Node = Record<string, unknown>;

const PREFIXES = ['schema:', 'https://schema.org/'];

/** The bare name of a Schema.org term, or nothing for a term from another vocabulary. */
const local = (id: unknown): string | undefined => {
  if (typeof id !== 'string') return undefined;
  const prefix = PREFIXES.find((candidate) => id.startsWith(candidate));
  return prefix === undefined ? undefined : id.slice(prefix.length);
};

const list = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const names = (value: unknown): string[] =>
  list(value)
    .map((node) => local((node as Node | null)?.['@id']))
    .filter((name) => name !== undefined)
    .sort();

const text = (value: unknown): string => {
  if (typeof value === 'string') return value;
  const held = (value as Node | null | undefined)?.['@value'];
  return typeof held === 'string' ? held : '';
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decode = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (/^#x/i.test(code)) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });

/** A description as one plain sentence of at most 200 characters. */
export const summary = (comment: string): string => {
  const plain = decode(
    comment
      .replaceAll('\\n', ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'),
  )
    .replace(/\s+/g, ' ')
    .trim();
  const end = /[.!?](?=\s+[A-Z]|$)/.exec(plain);
  const first = end ? plain.slice(0, end.index + 1) : plain;
  return first.length > 200 ? `${first.slice(0, 199)}…` : first;
};

const dropped = (node: Node): boolean =>
  /pending|attic/.test(String((node['schema:isPartOf'] as Node | undefined)?.['@id'] ?? ''));

const kindsOf = (node: Node): string[] => list(node['@type']).map(String);

/**
 * A Schema.org release file as the one line of JSON the builder reads. The output depends
 * only on the input: terms are sorted, and nothing about when or where it ran is written.
 */
export const compact = (release: unknown, version: string): string => {
  const graph = list((release as Node | null)?.['@graph']) as Node[];
  const kept = graph
    .map((node) => ({ node, name: local(node['@id']) }))
    .filter((entry): entry is { node: Node; name: string } => entry.name !== undefined)
    .filter((entry) => !dropped(entry.node))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const typeNames = new Set(
    kept.filter((entry) => kindsOf(entry.node).includes('rdfs:Class')).map((entry) => entry.name),
  );
  const known = (found: string[]): string[] => found.filter((name) => typeNames.has(name));

  const types: Record<string, string[]> = {};
  const properties: Record<string, { d: string[]; r: string[]; c: string }> = {};
  const enums: Record<string, string[]> = {};
  const dataTypes: string[] = [];

  for (const { node, name } of kept) {
    const kinds = kindsOf(node);
    if (kinds.includes('rdfs:Class')) {
      types[name] = known(names(node['rdfs:subClassOf']));
      if (kinds.includes('schema:DataType')) dataTypes.push(name);
    } else if (kinds.includes('rdf:Property')) {
      const d = known(names(node['schema:domainIncludes']));
      if (d.length === 0) continue;
      properties[name] = {
        d,
        r: known(names(node['schema:rangeIncludes'])),
        c: summary(text(node['rdfs:comment'])),
      };
    } else {
      for (const kind of kinds) {
        const owner = local(kind);
        if (owner !== undefined && typeNames.has(owner)) (enums[owner] ??= []).push(name);
      }
    }
  }
  return `${JSON.stringify({ version, types, properties, enums, dataTypes })}\n`;
};
