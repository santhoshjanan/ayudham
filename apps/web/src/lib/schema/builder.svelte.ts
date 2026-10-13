import {
  accepts,
  addItem,
  addValue,
  check,
  emptyDraft,
  itemAt,
  moveItem,
  moveValue,
  needsVocabulary,
  newItem,
  pack,
  parseVocabulary,
  refersTo,
  removeItem,
  removeValue,
  setType,
  setValue,
  STORAGE_KEY,
  toJson,
  topDefinition,
  toScriptTag,
  unpack,
  type Change,
  type Draft,
  type ItemPath,
  type OutputForm,
  type Refusal,
  type Step,
  type Value,
  type Vocabulary,
} from '@pokerji/schema-builder';

/** Something the person is asked to confirm before it happens. */
export type Pending =
  | { kind: 'clear' }
  | { kind: 'remove'; key: string }
  | { kind: 'retype'; at: ItemPath; type: string; dropped: string[] };

const VOCABULARY = '/schema/vocabulary.json';
const SAVE_AFTER = 300;

/**
 * The builder page's state. Every rule lives in the package; this holds the draft, calls the
 * package to change it, and keeps a copy in the browser's own storage. Nothing here sends
 * the draft anywhere.
 */
export class Builder {
  draft = $state.raw<Draft>(emptyDraft());
  form = $state<OutputForm>('script');
  vocabulary = $state.raw<Vocabulary | undefined>(undefined);
  loading = $state<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  /** Why the last change was refused, if it was. */
  refusal = $state<Refusal | undefined>(undefined);
  /** False once the browser has refused to store the draft. */
  stored = $state(true);
  pending = $state<Pending | null>(null);
  /** The top-level items the person has closed, by key. */
  closed = $state<Record<string, boolean>>({});

  output = $derived(this.form === 'script' ? toScriptTag(this.draft) : toJson(this.draft));
  findings = $derived(check(this.draft, this.vocabulary));

  #timer: ReturnType<typeof setTimeout> | undefined;

  #apply(change: Change): boolean {
    if (change.refused) {
      this.refusal = change.refused;
      return false;
    }
    this.refusal = undefined;
    this.draft = change.draft;
    this.#save();
    return true;
  }

  /** Adds a top-level item and gives back its key, or nothing if the draft is full. */
  addItem(type: string): string | undefined {
    const key = crypto.randomUUID();
    return this.#apply(addItem(this.draft, newItem(key, type))) ? key : undefined;
  }

  /** Removes a top-level item, asking first if anything refers to it. */
  removeItem(key: string): void {
    if (refersTo(this.draft, key)) this.pending = { kind: 'remove', key };
    else this.#apply(removeItem(this.draft, key));
  }

  moveItem(key: string, by: -1 | 1): void {
    this.#apply(moveItem(this.draft, key, by));
  }

  /** Changes a top-level item's type, asking first if properties would be lost. */
  retype(at: ItemPath, type: string): void {
    const item = itemAt(this.draft, at);
    if (!item || item.type === type) return;
    const dropped = item.properties
      .filter((property) => !this.#keeps(type, property.name))
      .map((property) => property.name);
    if (dropped.length > 0) this.pending = { kind: 'retype', at, type, dropped };
    else this.#retype(at, type);
  }

  #keeps(type: string, property: string): boolean {
    return accepts(type, topDefinition(type), this.vocabulary, property);
  }

  #retype(at: ItemPath, type: string): void {
    this.#apply(setType(this.draft, at, type, (property) => this.#keeps(type, property)));
  }

  addValue(at: ItemPath, property: string, value: Value): void {
    this.#apply(addValue(this.draft, at, property, value));
  }

  setValue(at: ItemPath, step: Step, value: Value): void {
    this.#apply(setValue(this.draft, at, step, value));
  }

  removeValue(at: ItemPath, step: Step): void {
    this.#apply(removeValue(this.draft, at, step));
  }

  moveValue(at: ItemPath, step: Step, by: -1 | 1): void {
    this.#apply(moveValue(this.draft, at, step, by));
  }

  setForm(form: OutputForm): void {
    this.form = form;
    this.#save();
  }

  /** Asks before emptying the draft. */
  clear(): void {
    this.pending = { kind: 'clear' };
  }

  /** Carries out whatever is waiting for a yes. */
  confirm(): void {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;
    if (pending.kind === 'remove') this.#apply(removeItem(this.draft, pending.key));
    if (pending.kind === 'retype') this.#retype(pending.at, pending.type);
    if (pending.kind === 'clear') {
      this.draft = emptyDraft();
      this.refusal = undefined;
      this.closed = {};
      this.flush();
    }
  }

  /** Reads the stored draft, if there is a usable one. Call once, in the browser. */
  restore(): void {
    try {
      const found = unpack(localStorage.getItem(STORAGE_KEY));
      if (!found) return;
      this.draft = found.draft;
      this.form = found.form;
      if (needsVocabulary(found.draft)) void this.loadVocabulary();
    } catch {
      this.stored = false;
    }
  }

  #save(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.flush(), SAVE_AFTER);
  }

  /** Writes the draft to the browser's storage now. An empty draft removes the entry. */
  flush(): void {
    clearTimeout(this.#timer);
    try {
      if (this.draft.items.length === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, pack({ draft: this.draft, form: this.form }));
      this.stored = true;
    } catch {
      this.stored = false;
    }
  }

  /** Fetches the vocabulary from this site, once. Safe to call again after a failure. */
  async loadVocabulary(): Promise<void> {
    if (this.loading === 'loading' || this.loading === 'ready') return;
    this.loading = 'loading';
    try {
      const response = await fetch(VOCABULARY);
      const parsed = response.ok ? parseVocabulary(await response.json()) : undefined;
      this.vocabulary = parsed;
      this.loading = parsed ? 'ready' : 'failed';
    } catch {
      this.loading = 'failed';
    }
  }
}
