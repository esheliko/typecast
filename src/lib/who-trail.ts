/**
 * /who trail and history: the steps you took inside the right pane, and the branches remembered under "Recently opened".
 * Pure; unit tested in tests/unit/who-trail.test.ts.
 *
 * The trail is a list of nodes after the root ("This title") and a cursor into it. Going back (clicking an earlier step) only moves
 * the cursor: later steps stay where they are until a NEW step is chosen from an earlier one, which replaces them and starts a new branch.
 */

export interface PRef { id: number; name: string; photo: string | null }
export type Node =
  | { t: "root" }
  | { t: "person"; id: number; name: string; photo: string | null; /** Title key to highlight in the person's timeline. */ hl?: string; /** Reached from a title in the trail: highlight the row but never scroll the details to it. */ still?: boolean }
  | { t: "title"; key: string; title: string; year: string; poster: string | null }
  | { t: "pair"; a: PRef; b: PRef }
  /** One episode of the series being watched, opened from a person's episode list. It never changes where you are. */
  | { t: "episode"; s: number; e: number };

export const nodeLabel = (n: Node, rootLabel = "This title") =>
  n.t === "root" ? rootLabel : n.t === "person" ? n.name : n.t === "title" ? n.title : n.t === "episode" ? `S${n.s}E${n.e}` : `${n.a.name} & ${n.b.name}`;
export const nodeId = (n: Node) =>
  n.t === "root" ? "root" : n.t === "person" ? `p${n.id}` : n.t === "title" ? n.key : n.t === "episode" ? `ep${n.s}-${n.e}` : `pair${n.a.id}-${n.b.id}`;

export const MAX_TRAIL = 14;

export interface TrailState {
  /** Steps after the root. */
  nodes: Node[];
  /** 0 = the root is showing; k = nodes[k - 1] is showing. */
  cur: number;
  /** Identifies the branch (one line of history) so the recents row can update it in place. */
  branch: string;
}

export const emptyTrail = (branch: string): TrailState => ({ nodes: [], cur: 0, branch });
export const currentNode = (s: TrailState): Node => (s.cur > 0 ? s.nodes[s.cur - 1] ?? { t: "root" } : { t: "root" });

/** Start a fresh line of history (a face or title opened from the finder, or a restored branch). */
export const startTrail = (first: Node[], branch: string): TrailState => ({ nodes: first.slice(-MAX_TRAIL), cur: Math.min(first.length, MAX_TRAIL), branch });

/** Go to step `i` (0 = root). Nothing is erased. */
export const jumpTo = (s: TrailState, i: number): TrailState => (i < 0 || i > s.nodes.length || i === s.cur ? s : { ...s, cur: i });

/**
 * Open `n` from the node showing now.
 * - It is the node already showing: nothing changes.
 * - It is the very next step of the trail: just move on (the steps after it stay).
 * - It is the step right before the one showing (not further back): that is just "back", so go one step back and change nothing else.
 * - Otherwise it goes after the current step; when that cuts off steps that were ahead, the cut-off steps stay only in the recents row
 *   (under the old branch) and this is a new branch.
 */
export function pushNode(s: TrailState, n: Node, newBranch: string): TrailState {
  const id = nodeId(n);
  if (s.cur > 0 && nodeId(s.nodes[s.cur - 1]) === id) return s;
  if (s.cur < s.nodes.length && nodeId(s.nodes[s.cur]) === id) return { ...s, cur: s.cur + 1 };
  if (s.cur >= 2 && nodeId(s.nodes[s.cur - 2]) === id) return { ...s, cur: s.cur - 1 };
  const forking = s.cur < s.nodes.length;
  const nodes = [...s.nodes.slice(0, s.cur), n];
  const over = Math.max(0, nodes.length - MAX_TRAIL);
  const kept = nodes.slice(over);
  return { nodes: kept, cur: kept.length, branch: forking ? newBranch : s.branch };
}

/* ---------- recently opened: one entry per branch ---------- */

export interface RecentTrail { id: string; /** The title being watched when it was made (trails only make sense under their own title). */ k: string; nodes: Node[] }
export const MAX_RECENT = 8;

const sig = (nodes: Node[]) => nodes.map(nodeId).join(">");

/** Put a branch first; the same branch is replaced in place and an identical line of steps is never listed twice. */
export function upsertRecent(list: RecentTrail[], r: RecentTrail, max = MAX_RECENT): RecentTrail[] {
  if (!r.nodes.length) return list;
  const s = sig(r.nodes);
  return [r, ...list.filter((x) => x.id !== r.id && !(x.k === r.k && sig(x.nodes) === s))].slice(0, max);
}

/** "Sara Rue > The Big Bang Theory": the tooltip of a recents chip. */
export const breadcrumb = (nodes: Node[]): string => nodes.map((n) => nodeLabel(n)).join(" > ");

/** Stored recents come back from sessionStorage: keep only well-formed entries. */
export function cleanRecents(v: unknown): RecentTrail[] {
  if (!Array.isArray(v)) return [];
  const ok = (n: unknown): n is Node => {
    if (!n || typeof n !== "object") return false;
    const o = n as Record<string, unknown>;
    if (o.t === "person") return typeof o.id === "number" && typeof o.name === "string";
    if (o.t === "title") return typeof o.key === "string" && typeof o.title === "string";
    if (o.t === "episode") return typeof o.s === "number" && typeof o.e === "number";
    if (o.t === "pair") return !!o.a && !!o.b && typeof (o.a as PRef).id === "number" && typeof (o.b as PRef).id === "number";
    return false;
  };
  return v.flatMap((r): RecentTrail[] => {
    const o = r as Partial<RecentTrail> | null;
    return o && typeof o.id === "string" && typeof o.k === "string" && Array.isArray(o.nodes) && o.nodes.length && o.nodes.every(ok) ? [{ id: o.id, k: o.k, nodes: o.nodes.slice(0, MAX_TRAIL) }] : [];
  }).slice(0, MAX_RECENT);
}

/** Where you were on the page (kept in sessionStorage so a refresh puts you back): the trail, its cursor and whether the details are open. */
export interface TrailSession { k: string; id: string; nodes: Node[]; cur: number; open: boolean }

/** Read a stored session back; anything malformed, or made under another title, is dropped. */
export function cleanSession(v: unknown, key: string): TrailSession | null {
  const o = v as Partial<TrailSession> | null;
  if (!o || typeof o !== "object" || o.k !== key || typeof o.id !== "string" || !Array.isArray(o.nodes)) return null;
  const r = cleanRecents([{ id: o.id, k: key, nodes: o.nodes }])[0];
  if (!r) return null;
  const cur = typeof o.cur === "number" && Number.isInteger(o.cur) ? Math.min(Math.max(o.cur, 0), r.nodes.length) : r.nodes.length;
  return { k: key, id: r.id, nodes: r.nodes, cur, open: o.open === true };
}
