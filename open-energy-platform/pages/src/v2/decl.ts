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

export interface TimerRow {
  id: string;
  txn_id: string;
  fire: string;
  due_at: string;
  key: string;
  class: 'sla' | 'time_bar';
}

export interface TxnBundle {
  txn: TxnRow;
  parties: PartyRow[];
  events: EventRow[];
  /** pending timers — optional so older cached responses still parse */
  timers?: TimerRow[];
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

/** Edges fireable FROM a state: `from` includes the state (never '@new').
 *  `roles` are the viewer's party-roles on the txn (a user may hold several). */
export function candidatesFor(chain: ChainDecl, state: string, roles: string[]): Candidate[] {
  return chain.transitions
    .filter((t) => t.from !== '@new' && fromStates(t).includes(state))
    .map((t) => {
      // 'system' edges are timer/cascade-driven, never user-fireable.
      if (t.by.includes('system') && !t.by.some((r) => r !== 'system')) {
        return { t, enabled: false, reason: 'System-driven — fires automatically' };
      }
      const allowed = t.by.some((r) => roles.includes(r)) || t.by.includes('system');
      return allowed
        ? { t, enabled: true }
        : { t, enabled: false, reason: `Only ${t.by.filter((r) => r !== 'system').join(' / ')} can do this` };
    });
}

/** snake_case / kebab / SCREAMING_CODE → human sentence-case. */
export function humanize(s: string): string {
  const words = s.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Props to make a table row behave as an accessible clickable control.
 *  Spread onto a <tr>: click + Enter/Space activate, keyboard-focusable, labelled. */
export function rowProps(onActivate: () => void, label: string) {
  return {
    onClick: onActivate,
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    style: { cursor: 'pointer' as const },
  };
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

// Display value: prefer a money-named numeric field (so "R" is only asserted
// when the number really is currency); else the largest numeric — shown bare,
// because it may be MWh/MW/% and labelling it Rand would be a lie.
// ponytail: name-hint heuristic; a unit tariff (R/kWh) could beat a notional if
// the notional isn't money-named — acceptable, upgrade when the server types fields.
const MONEY_HINT = /(zar|rand|price|amount|value|cost|fee|premium|penalty|payment|notional|charge|invoice|settle)/i;
export function zarValue(row: TxnRow): { amount: number; isMoney: boolean } {
  let money = 0, any = 0;
  for (const [k, v] of Object.entries(row.fields)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    if (Math.abs(v) > Math.abs(any)) any = v;
    if (MONEY_HINT.test(k) && Math.abs(v) > Math.abs(money)) money = v;
  }
  return money !== 0 ? { amount: money, isMoney: true } : { amount: any, isMoney: false };
}

/** Compact number: 1.5M / 50k / 812. Sign preserved; 0 → '—'. */
export function compact(n: number): string {
  if (!n) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return `${n}`;
}

/** Value cell text with an honest currency prefix. */
export function valueText(row: TxnRow): string {
  const { amount, isMoney } = zarValue(row);
  if (!amount) return '—';
  return isMoney ? `R ${compact(amount)}` : compact(amount);
}

// Age since a transaction opened, as a compact human string + an urgency tier.
// ponytail: age-since-opened, not age-in-current-state — list rows carry only
// opened_at, not the last-event ts. Upgrade the tier when the server projects
// state-entry time or an SLA-breach flag (see homeSort note).
export function ageSince(iso: string, now: number = Date.now()): { text: string; tier: 'ok' | 'warn' | 'bad' } {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return { text: '', tier: 'ok' };
  const mins = Math.max(0, Math.floor((now - t) / 60000));
  const h = mins / 60, d = h / 24;
  const text = d >= 1 ? `${Math.floor(d)}d` : h >= 1 ? `${Math.floor(h)}h` : `${mins}m`;
  const tier = d >= 7 ? 'bad' : d >= 2 ? 'warn' : 'ok';
  return { text, tier };
}

/** The chain's main-line states in reachable order (destructive exits excluded),
 *  for the Transaction progress spine. ponytail: BFS from initial — branches
 *  interleave rather than resolve to one true path, fine for a progress ribbon. */
export function spineStates(chain: ChainDecl): string[] {
  const adj = new Map<string, string[]>();
  for (const t of chain.transitions) {
    if (t.intent === 'destructive') continue;
    for (const f of fromStates(t)) {
      const to = t.to;
      const arr = adj.get(f) ?? [];
      arr.push(to);
      adj.set(f, arr);
    }
  }
  const order: string[] = [];
  const seen = new Set<string>();
  const queue: string[] = [chain.initial];
  while (queue.length) {
    const s = queue.shift()!;
    if (seen.has(s)) continue;
    seen.add(s);
    order.push(s);
    for (const n of adj.get(s) ?? []) if (!seen.has(n)) queue.push(n);
  }
  return order;
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

// ── result codes → what a person should read + do ───────────────────────────
// The engine's CmdResult codes (src/v2/domain/engine.ts). Kept 1:1 with that
// enum — do not invent codes the server never returns.
export interface RejectInfo {
  title: string;
  detail: string;
  retriable: boolean; // STALE/CONTENTION: reload seq and re-submit unchanged
}
export function explainReject(code: string | undefined, message?: string): RejectInfo {
  switch (code) {
    case 'STALE':
    case 'CONTENTION':
      return { title: 'Someone moved first', detail: 'This transaction changed while you were deciding. Reloading the latest, then you can act again.', retriable: true };
    case 'CONFLICT':
      return { title: 'Already recorded', detail: message || 'This action was already applied — nothing further to do.', retriable: false };
    case 'FORBIDDEN':
      return { title: 'Not your move', detail: message || 'Your role can’t take this action on this transaction.', retriable: false };
    case 'BLOCKED':
      return { title: 'Blocked by a rule', detail: message || 'A pre-condition isn’t met yet (credit, KYC, exposure, halt or mark-age). Resolve it, then retry.', retriable: false };
    case 'REJECTED':
      return { title: 'Rejected', detail: message || 'The action was valid but declined by a guard.', retriable: false };
    case 'ILLEGAL_TRANSITION':
      return { title: 'No longer available', detail: message || 'The transaction isn’t in a state this action can be taken from anymore.', retriable: false };
    case 'UNKNOWN_EDGE':
      return { title: 'Unknown action', detail: message || 'That action doesn’t exist on this chain.', retriable: false };
    case 'BAD_INPUT':
      return { title: 'Check the form', detail: message || 'Something in the input didn’t validate.', retriable: false };
    case 'NOT_FOUND':
      return { title: 'Not found', detail: message || 'The transaction no longer exists.', retriable: false };
    case 'INTERNAL':
      return { title: 'Something broke', detail: message || 'An unexpected error occurred. Try again shortly.', retriable: true };
    default:
      return { title: 'Could not complete', detail: message || 'The action didn’t go through.', retriable: false };
  }
}

// ── SAST display (UTC+2, no DST — RSA never observes it) ─────────────────────
// Stored timestamps are UTC ISO. The platform's audit/legal domain is SAST, so
// every human-facing time renders +02:00. ponytail: fixed offset, correct for
// ZA in perpetuity; revisit only if a non-SAST tenant is ever onboarded.
export function tsToSAST(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  const sast = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${sast.getUTCFullYear()}-${p(sast.getUTCMonth() + 1)}-${p(sast.getUTCDate())} ${p(sast.getUTCHours())}:${p(sast.getUTCMinutes())} SAST`;
}
