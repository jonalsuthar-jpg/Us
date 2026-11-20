/**
 * Our House, kept: every saved thing (house_items), shared between the two
 * of us. A change shows at once on my screen, goes to my partner's straight
 * away over the channel, then saves with the version I last saw. If my
 * partner changed the same thing first the save comes back 'stale', and I
 * load what's there instead. Saves of one thing go one after another.
 */
import { cleanLook, cleanState, type ItemState, type LookState } from './items';
import { KEY, type ItemOp } from './presence';

export interface HouseRow {
  key: string;
  state: Record<string, unknown>;
  version: number;
}

export interface HouseApi {
  load(): Promise<HouseRow[]>;
  /** Resolves to the new version (0 once removed); rejects with StaleHouseError. */
  save(key: string, state: Record<string, unknown> | null, version: number): Promise<number>;
}

export class StaleHouseError extends Error {
  constructor() {
    super('stale');
  }
}

type Listener = () => void;

export class HouseStore {
  private rows = new Map<string, { state: Record<string, unknown>; version: number }>();
  /** What the server has, as far as I know: the version my next save of each thing checks against. */
  private server = new Map<string, number>();
  private queue = new Map<string, Promise<unknown>>();
  private listeners = new Set<Listener>();
  private cache: { items: Map<string, ItemState> } | null = null;
  loaded = false;

  constructor(
    private readonly api: HouseApi,
    private readonly send: (op: Omit<ItemOp, 'op'>) => void,
  ) {}

  async load() {
    const rows = await this.api.load();
    const ok = rows.filter((r) => KEY.test(r.key));
    this.rows = new Map(ok.map((r) => [r.key, { state: r.state, version: r.version }]));
    this.server = new Map(ok.map((r) => [r.key, r.version]));
    this.loaded = true;
    this.changed();
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Every thing's saved state, cleaned. Same Map until something changes. */
  items(): ReadonlyMap<string, ItemState> {
    if (!this.cache) {
      const items = new Map<string, ItemState>();
      for (const [k, r] of this.rows) {
        if (k.startsWith('avatar:')) continue;
        const s = cleanState(r.state);
        if (s) items.set(k, s);
      }
      this.cache = { items };
    }
    return this.cache.items;
  }

  /** Every saved thing's key. */
  keys(): string[] {
    return [...this.rows.keys()];
  }

  get(key: string): Record<string, unknown> | null {
    return this.rows.get(key)?.state ?? null;
  }

  look(key: string): LookState | null {
    return cleanLook(this.get(key));
  }

  /** Change (or with null, take away) one thing. */
  set(key: string, state: Record<string, unknown> | null) {
    if (!KEY.test(key)) return;
    const v = this.version(key) + 1;
    if (state) this.rows.set(key, { state, version: v });
    else this.rows.delete(key);
    this.changed();
    this.send({ k: key, s: state, v });
    const run = (this.queue.get(key) ?? Promise.resolve())
      .then(() => this.api.save(key, state, this.server.get(key) ?? 0))
      .then((saved) => {
        if (saved > 0) this.server.set(key, saved);
        else this.server.delete(key);
      })
      .catch((e) => {
        if (e instanceof StaleHouseError) void this.load().catch(() => {});
      });
    this.queue.set(key, run);
  }

  /** My partner changed something: show it, unless I already have that version or newer. */
  receive(op: ItemOp) {
    if (this.version(op.k) >= op.v) return;
    if (op.s) this.rows.set(op.k, { state: op.s, version: op.v });
    else this.rows.delete(op.k);
    // Their save is on its way; if it doesn't land, my next save comes back stale and I reload.
    if (op.s) this.server.set(op.k, op.v);
    else this.server.delete(op.k);
    this.changed();
  }

  /** The version I'm showing for a thing, or the server's when I'm showing none. */
  private version(key: string) {
    return this.rows.get(key)?.version ?? this.server.get(key) ?? 0;
  }

  private changed() {
    this.cache = null;
    for (const fn of [...this.listeners]) fn();
  }
}
