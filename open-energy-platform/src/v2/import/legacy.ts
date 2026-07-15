// ═══════════════════════════════════════════════════════════════════════════
// Legacy backfill importer — REBUILD_PLAN §11 / CUTOVER_COVERAGE §4.
//
// One `<chain>.imported` event per v1 row: seq 1, from_state null, full v1 row
// preserved in payload under { provenance: 'legacy' }, hash-chained from the
// same genesis prev_hash real initiations use — so verifyPack passes an
// imported log unmodified. Writes go through Store.commit() directly, NOT
// applyTransition: an import is a statement of fact about the legacy world,
// not a transition anyone authorised (actor_kind 'system:import').
//
// SECURITY invariant (same as chain-registry-meridian.ts): every value
// interpolated into a SQL identifier position comes from the static
// MERIDIAN_CHAINS registry. Request values only ever bind to `?` placeholders.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ChainDecl,
  Clock,
  CommitBatch,
  EventRow,
  IdSource,
  Json,
  PartyRow,
  Store,
  TimerRow,
  TxnRow,
} from '../domain/types';
import { ConstraintViolation } from '../domain/types';
import { eventHash, genesisPrevHash } from '../domain/hash';
import { addDuration, isoUtc } from '../domain/time';
import { MERIDIAN_CHAINS, type ChainDescriptor } from '../../utils/chain-registry-meridian';

/** The 20 EXACT-terminal-clean chains (CUTOVER_COVERAGE §1, mismatch = clean).
 *  Doubles as the party map: the descriptor's counterpartyCol maps to this
 *  role_on_txn — null where the column names a site/asset/free-text party we
 *  cannot confidently map to a participant. Static by design (allow-list). */
export const IMPORTABLE_CHAINS: Record<string, string | null> = {
  benchmark_transition: 'counterparty',
  carbon_offset_claim: 'sars',
  covenant_certificate: 'borrower',
  cyber_incident: null,
  esap_monitoring: null, // site_name — not a participant
  facility_amendment: null, // facility_id — not a participant
  hse_incident: null,
  insurance_claim: 'insurer',
  ipp_evm: null, // ball-in-court is a role token, not a participant id
  licence_application: 'applicant',
  loan_restructure: 'borrower',
  methodology_amendment: null,
  permit_to_work: 'holder',
  ppa_change_in_law: 'claimant',
  punch_list: 'contractor',
  security_perfection: 'grantor',
  security_remediation: null,
  soiling_audit: 'owner',
  spare_parts_provisioning: 'supplier',
  transmission_outage: null, // asset_label — not a participant
};

/** Written status-mapping decisions (CUTOVER_COVERAGE §1 header rule): v1
 *  statuses with no same-name v2 state map to the nearest v2 state by lifecycle
 *  position. The original v1 status survives verbatim in payload.row — the
 *  mapping only picks which v2 state the txn resumes in (and therefore which
 *  timers arm). Unmapped unknown statuses still quarantine. */
export const STATUS_MAP: Record<string, Record<string, string>> = {
  cyber_incident: {
    detected: 'reported',
    investigating: 'triaged',
    escalated: 'triaged',
    // POPIA s22 notifications happen post-containment in the v1 flow
    notified_regulator: 'contained',
    notified_subjects: 'contained',
    remediation_planned: 'eradicated',
    remediation_executing: 'eradicated',
    verified: 'recovered',
    false_alarm: 'dismissed',
  },
  hse_incident: {
    notified_authority: 'investigating',
    escalated: 'triaged',
    corrective_actions_planned: 'corrective_actions_assigned',
    corrective_actions_executing: 'corrective_actions_assigned',
    verified: 'corrective_actions_verified',
    false_alarm: 'dismissed',
  },
  ipp_evm: {
    // v1 change-request flow ≈ v2 reforecast flow
    CR_logged: 'variance_detected',
    CR_approved: 'reforecast_published',
    contingency_drawn: 'reforecast_published',
  },
  loan_restructure: {
    restructure_proposal_drafted: 'proposal_drafted',
    lender_credit_committee_review: 'committee_review',
    borrower_term_sheet_negotiation: 'term_negotiation',
    legal_documentation_drafted: 'legal_documentation',
    effective_date: 'effective',
  },
  ppa_change_in_law: {
    event_logged: 'notified',
    eligibility_review: 'assessing',
    impact_assessment: 'assessing',
    claim_submitted: 'assessing',
    counterparty_review: 'assessing',
    negotiation: 'assessing',
    in_arbitration: 'disputed',
    relief_granted: 'agreed',
  },
  transmission_outage: {
    extended: 'outage_in_progress',
  },
};

export type LegacyRow = Record<string, Json | undefined>;

export interface ImportDeps {
  store: Store;
  clock: Clock;
  ids: IdSource;
  chains: Record<string, ChainDecl>;
}

export interface ImportReport {
  chain_key: string;
  imported: number;
  skipped_existing: number;
  quarantined: Array<{ id: string; status: string }>;
  dry_run: boolean;
}

/** Resolve the static v1 descriptor for an importable chain. Throws on any key
 *  outside the allow-list — the ONLY source of table/column identifiers. */
export function legacyDescriptor(chain_key: string): ChainDescriptor {
  if (!(chain_key in IMPORTABLE_CHAINS)) throw new Error(`chain '${chain_key}' is not importable`);
  const d = MERIDIAN_CHAINS.find((x) => x.key === chain_key);
  if (!d) throw new Error(`no MERIDIAN_CHAINS descriptor for '${chain_key}'`);
  return d;
}

export const importIdempotencyKey = (chain_key: string, rowId: string): string =>
  `import:${chain_key}:${rowId}`;

/** v1 timestamps are SQLite CURRENT_TIMESTAMP-ish ('YYYY-MM-DD HH:MM:SS', UTC,
 *  no zone marker) or already RFC3339. Normalise to RFC3339 UTC or give up. */
function isoOrNull(v: Json | undefined): string | null {
  if (typeof v !== 'string' || !v) return null;
  const s = v.includes('T') ? v : v.replace(' ', 'T');
  const withZone = /[zZ]$|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`;
  const t = Date.parse(withZone);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// ponytail: participant-id confidence = "is a UUID". Display names ("Standard
// Bank") skip party creation; widen to an oe_users lookup if backfill ever
// needs name→id resolution.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resumable v1 fetch: only rows not yet imported (idempotency key absent).
 *  Table name is a static literal from the descriptor; chain_key and limit
 *  bind to `?` placeholders. */
export async function fetchLegacyRows(db: D1Database, chain_key: string, limit: number): Promise<LegacyRow[]> {
  const desc = legacyDescriptor(chain_key);
  const res = await db
    .prepare(
      `SELECT t.* FROM ${desc.table} t
       WHERE NOT EXISTS (SELECT 1 FROM v2_events e WHERE e.idempotency_key = 'import:' || ? || ':' || t.id)
       ORDER BY t.id LIMIT ?`,
    )
    .bind(chain_key, Math.max(1, Math.min(limit, 500)))
    .all<LegacyRow>();
  return res.results ?? [];
}

/** Import pre-fetched v1 rows for one chain. Store-agnostic: the D1 SELECT
 *  lives in fetchLegacyRows / the route; tests feed rows straight in. */
export async function importChain(
  rows: LegacyRow[],
  chain_key: string,
  deps: ImportDeps,
  opts: { dry_run?: boolean } = {},
): Promise<ImportReport> {
  const counterpartyRole = IMPORTABLE_CHAINS[chain_key];
  const chain = deps.chains[chain_key];
  if (counterpartyRole === undefined || !chain) throw new Error(`chain '${chain_key}' is not importable`);
  const desc = legacyDescriptor(chain_key);
  const dry_run = opts.dry_run === true;
  const report: ImportReport = { chain_key, imported: 0, skipped_existing: 0, quarantined: [], dry_run };

  for (const row of rows) {
    const rowId = row.id == null ? '' : String(row.id);
    const rawStatus = typeof row[desc.statusCol] === 'string' ? (row[desc.statusCol] as string) : '';
    const status = chain.states[rawStatus] ? rawStatus : (STATUS_MAP[chain_key]?.[rawStatus] ?? rawStatus);
    const state = chain.states[status];
    if (!rowId || !state) {
      report.quarantined.push({ id: rowId, status: rawStatus });
      continue;
    }
    const idem = importIdempotencyKey(chain_key, rowId);
    if (await deps.store.findEventByIdempotencyKey(idem)) {
      report.skipped_existing++;
      continue;
    }

    const occurred_at = isoOrNull(row.updated_at) ?? isoOrNull(row.created_at) ?? isoUtc(deps.clock.now());
    const opened_at = isoOrNull(row.created_at) ?? occurred_at;

    // fields: v1 columns the v2 decl declares under the same name.
    const fields: Record<string, Json> = {};
    for (const [name, decl] of Object.entries(chain.fields)) {
      const v = row[name];
      if (v === null || v === undefined) continue;
      fields[name] = decl.type === 'boolean' && typeof v === 'number' ? v !== 0 : v;
    }

    const event_id = deps.ids.uuid();
    const unhashed: Omit<EventRow, 'hash'> = {
      txn_id: rowId,
      seq: 1,
      event_id,
      chain_key,
      type: `${chain_key}.imported`,
      from_state: null,
      to_state: status,
      actor_id: 'system:import',
      actor_kind: 'system:import',
      on_behalf_of: null,
      occurred_at,
      caused_by: null,
      reason_code: null,
      reason_text: null,
      payload: { provenance: 'legacy', row: row as Json },
      payload_version: 1,
      prev_hash: await genesisPrevHash(chain_key),
      idempotency_key: idem,
    };
    const event: EventRow = { ...unhashed, hash: await eventHash(unhashed) };

    // party: only where the counterparty column holds a confident participant id.
    const parties: PartyRow[] = [];
    const cp = desc.counterpartyCol ? row[desc.counterpartyCol] : null;
    if (counterpartyRole && typeof cp === 'string' && UUID_RE.test(cp)) {
      parties.push({
        txn_id: rowId,
        participant_id: cp,
        role_on_txn: counterpartyRole,
        terms: null,
        from_event_id: event_id,
        until_event_id: null,
      });
    }

    // timers: non-terminal rows arm the state's TimerDecls from occurred_at
    // (may be immediately due — correct SLA semantics for stale legacy rows).
    // Terminal rows arm nothing. Same shape the engine arms (engine.ts).
    const timers: TimerRow[] = [];
    if (!state.terminal) {
      const at = { epoch_ms: Date.parse(occurred_at), zone: 'UTC' as const };
      for (const t of chain.timers ?? []) {
        if (t.onState !== status) continue;
        timers.push({
          id: deps.ids.uuid(),
          txn_id: rowId,
          fire: t.fire,
          due_at: isoUtc(addDuration(at, t.after)),
          key: `${rowId}:${t.onState}:${t.fire}`,
          class: t.kind,
        });
      }
    }

    const refVal = row[desc.refCol];
    const refBase = typeof refVal === 'string' && refVal ? refVal : rowId;
    const txn: TxnRow = {
      id: rowId,
      chain_key,
      human_ref: refBase,
      title: chain.title(fields),
      state: status,
      seq: 1,
      visibility: chain.visibility,
      fields,
      opened_at,
      closed_at: state.terminal ? occurred_at : null,
    };

    if (dry_run) {
      report.imported++;
      continue;
    }

    // Suffix-retry on human_ref collisions is safe: both stores validate ALL
    // constraints before mutating anything, so a failed commit wrote nothing.
    for (let attempt = 1; ; attempt++) {
      const batch: CommitBatch = {
        insertEvent: event,
        insertTxn: attempt === 1 ? txn : { ...txn, human_ref: `${refBase}~${attempt}` },
        ...(parties.length ? { insertParties: parties } : {}),
        ...(timers.length ? { insertTimers: timers } : {}),
      };
      try {
        await deps.store.commit(batch);
        report.imported++;
        break;
      } catch (e) {
        if (e instanceof ConstraintViolation) {
          if (e.constraint === 'idempotency_key' || e.constraint === 'event_pk') {
            report.skipped_existing++; // concurrent import raced us — same row landed
            break;
          }
          if (e.constraint === 'human_ref' && attempt < 6) continue;
        }
        throw e;
      }
    }
  }
  return report;
}
