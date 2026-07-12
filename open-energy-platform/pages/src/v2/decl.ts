// ═══════════════════════════════════════════════════════════════════════════
// v2 frontend — the serialized chain-declaration model + the small amount of
// pure logic the four generative surfaces share.
//
// The backend serializes CHAINS via JSON.parse(JSON.stringify(...)), which drops
// every function-valued prop (title, derive, claim). So the shapes below are the
// DATA half of the domain types in src/v2/domain/types.ts — nothing more.
//
// There is NO server-side dry-run endpoint: the server never returns actions[]/
// enabled/blockedBy. Candidate actions are derived here from the decl (the edges
// whose `from` includes the current state) and submitted optimistically; a real
// guard/graph rejection surfaces in place as a result code. See REBUILD_FRONTEND
// §10.10.
// ═══════════════════════════════════════════════════════════════════════════

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface FieldDecl {
  // Only these four types exist in the backend FieldDecl. The design's richer
  // set (money/percent/enum/date) is NOT modelled server-side; do not invent it.
  type: 'string' | 'number' | 'boolean' | 'party';
  required?: boolean;
  role?: string; // party fields: the role_on_txn the referenced participant takes
  min?: number;
  max?: number;
  label?: string;
}

export interface StateDecl {
  label: string;
  terminal: boolean;
  holder: string; // role_on_txn | 'none'
  sla?: { days?: number; hours?: number; minutes?: number };
}

export interface TransitionDecl {
  id: string;
  from: '@new' | string | string[];
  to: string;
  by: string[]; // roles | 'system'
  label: string;
  intent: 'primary' | 'secondary' | 'destructive';
  decisionGroup?: string;
  input?: Record<string, FieldDecl>;
  guards: string[];
  requiresReason?: string[];
  actorBecomes?: string;
}

export interface ChainDecl {
  key: string;
  noun: string;
  refPrefix: string;
  legalBasis?: { instrument: string; provision: string; effect: string }[];
  visibility: 'public' | 'party' | 'owner';
  fields: Record<string, FieldDecl>;
  roles: string[];
  initial: string;
  states: Record<string, StateDecl>;
  transitions: TransitionDecl[];
  timers?: { onState: string; after: Record<string, number>; fire: string; kind: string }[];
  settles: boolean;
}

export type ChainMap = Record<string, ChainDecl>;

// ── list rows (GET /txns) ───────────────────────────────────────────────────
export interface TxnRow {
  id: string;
  chain_key: string;
  human_ref: string;
  title: string;
  state: string;
  seq: number;
  visibility: string;
  fields: Record<string, Json>;
  opened_at: string;
  closed_at: string | null;
}

export interface PartyRow {
  txn_id: string;
  participant_id: string;
  role_on_txn: string;
  terms: Json;
  from_event_id: string;
  until_event_id: string | null;
}

export interface EventRow {
  txn_id: string;
  seq: number;
  event_id: string;
  chain_key: string;
  type: string;
  from_state: string | null;
  to_state: string;
  actor_id: string;
  actor_kind: string;
  on_behalf_of: string | null;
  occurred_at: string;
  caused_by: string | null;
  reason_code: string | null;
  reason_text: string | null;
  payload: Json;
}

export interface TxnBundle {
  txn: TxnRow;
  parties: PartyRow[];
  events: EventRow[];
}

// ── the custody notice (R-S5-3) ─────────────────────────────────────────────
// ChainDecl carries NO record_only_notice field, so settles:false surfaces render
// this one constant. Never dismissible; --warn on --s1; in document flow.
export const RECORD_ONLY_NOTICE =
  'Record only. This transaction produces a tamper-evident, regulator-exportable ' +
  'record of what the parties agreed and did — it does not move money, hold ' +
  'custody, or effect settlement. Value transfer, if any, happens in the parties’ ' +
  'own settlement rails outside this system.';

// ── candidate actions (client-side dry-run substitute) ──────────────────────
export interface Candidate {
  t: TransitionDecl;
  enabled: boolean; // current user's role may fire this edge
  reason?: string; // why disabled (for the disabled tooltip)
}

/** Edges fireable FROM a state: `from` includes the state (never '@new'). */
export function candidatesFor(chain: ChainDecl, state: string, role: string): Candidate[] {
  return chain.transitions
    .filter((t) => t.from !== '@new' && fromStates(t).includes(state))
    .map((t) => {
      // 'system' edges are timer/cascade-driven, never user-fireable.
      if (t.by.includes('system') && !t.by.some((r) => r !== 'system')) {
        return { t, enabled: false, reason: 'System-driven — fires automatically' };
      }
      const allowed = t.by.includes(role) || t.by.includes('system');
      return allowed
        ? { t, enabled: true }
        : { t, enabled: false, reason: `Only ${t.by.filter((r) => r !== 'system').join(' / ')} can do this` };
    });
}

/** The '@new' edges of a chain — the "Start something" set for Find. */
export function newEdges(chain: ChainDecl): TransitionDecl[] {
  return chain.transitions.filter((t) => t.from === '@new');
}

export function fromStates(t: TransitionDecl): string[] {
  return t.from === '@new' ? [] : Array.isArray(t.from) ? t.from : [t.from];
}

/** A stable idempotency key: the caller supplies attempt entropy (index/ts). */
export function idemKey(prefix: string, entropy: string): string {
  return `${prefix}:${entropy}`;
}

// ── Home consequence sort ───────────────────────────────────────────────────
// Full design order is (blocking_others, sla_breach_imminent, money_value, due_at);
// the server returns none of the first two, so we sort on what's local:
// money_value DESC (largest numeric field), then opened_at ASC (oldest first).
// ponytail: no blocking/SLA signal client-side; add when the server projects it.
export function moneyValue(row: TxnRow): number {
  let m = 0;
  for (const v of Object.values(row.fields)) {
    if (typeof v === 'number' && Math.abs(v) > Math.abs(m)) m = v;
  }
  return m;
}

export function homeSort(rows: TxnRow[]): TxnRow[] {
  return [...rows].sort((a, b) => {
    const dm = Math.abs(moneyValue(b)) - Math.abs(moneyValue(a));
    if (dm !== 0) return dm;
    return a.opened_at.localeCompare(b.opened_at);
  });
}

// ── state → pill class (open/hold/done/dead/future) ─────────────────────────
export function stateKind(chain: ChainDecl, state: string): 'open' | 'hold' | 'done' | 'dead' {
  const s = chain.states[state];
  if (!s) return 'open';
  if (!s.terminal) return s.holder === 'none' ? 'open' : 'hold';
  // Terminal: a destructive/reject exit lands here → dead; else done.
  const arrivedBy = chain.transitions.filter((t) => t.to === state);
  const allDestructive = arrivedBy.length > 0 && arrivedBy.every((t) => t.intent === 'destructive');
  return allDestructive ? 'dead' : 'done';
}

export function fmtDuration(d?: { days?: number; hours?: number; minutes?: number }): string {
  if (!d) return '';
  if (d.days) return `${d.days}d`;
  if (d.hours) return `${d.hours}h`;
  if (d.minutes) return `${d.minutes}m`;
  return '';
}

export function fieldLabel(name: string, f: FieldDecl): string {
  return f.label || name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
