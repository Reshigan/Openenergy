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

/** The EXACT chains cleared for import (CUTOVER_COVERAGE §1 + §4.1): the 20
 *  terminal-clean chains plus 69 EXACT-with-mismatch chains whose status
 *  mappings are written below. `ccp_assessment` and `disposition` are held
 *  out pending a domain decision (v1/v2 semantics diverge — see §4.1 notes).
 *  Doubles as the party map: the descriptor's counterpartyCol maps to this
 *  role_on_txn — null where the column names a site/asset/free-text/ref value
 *  we cannot confidently map to a participant. Static by design (allow-list). */
export const IMPORTABLE_CHAINS: Record<string, string | null> = {
  availability_guarantee: 'contractor',
  benchmark_transition: 'counterparty',
  best_execution: 'client',
  black_start: 'provider',
  carbon_budget: null,
  carbon_credit_rating: 'issuer',
  carbon_erpa: 'buyer',
  carbon_issuance: 'proponent',
  carbon_offset_claim: 'sars',
  carbon_registration: 'developer',
  carbon_registry_transfer: 'transferee',
  carbon_retirement: null, // beneficiary_name — free text, doubles as titleCol
  carbon_reversal: 'proponent',
  certificate_bundle: null,
  complaint_resolution: 'complainant',
  compliance_inspection: 'licensee',
  connection_energization: 'operator',
  construction_cost_report: 'contractor',
  counterparty_margin: 'counterparty',
  covenant_certificate: 'borrower',
  cp_clearance: 'borrower',
  credit_insurance: 'insurer',
  cross_border_trade: null, // counterparty_jurisdiction — not a participant
  curtailment_claim: 'generator',
  cyber_incident: null,
  drawdown: 'lender',
  ed_commitment: 'authority',
  enforcement_action: 'respondent',
  enforcement_action_s35: 'respondent',
  eop_activation: null,
  esap_compliance: null,
  esap_monitoring: null, // site_name — not a participant
  esg_disclosure: 'reporting_entity',
  export_curtailment: null, // ppa_ref — contract ref, not a participant
  facility_amendment: null, // facility_id — not a participant
  fsca_conduct_report: null,
  grid_code_compliance: 'facility_party',
  handover_dossier: null, // ball-in-court is a role token, not a participant id
  hse_incident: null,
  insurance_claim: 'insurer',
  interconnector_schedule: 'neighbour_utility',
  ipp_evm: null, // ball-in-court is a role token, not a participant id
  ipp_schedule: null,
  isda_agreement: 'party_b',
  itp: 'contractor',
  levy_assessment: null, // regulator-originated, no counterparty column
  licence_application: 'applicant',
  licence_renewal: 'holder',
  load_curtailment: 'consumer',
  loan_default: 'borrower',
  loan_restructure: 'borrower',
  loan_transfer: 'borrower',
  market_conduct_exam: 'entity',
  methodology_amendment: null,
  oem_fco: 'oem',
  permit_to_work: 'holder',
  planned_outage: 'requester',
  pm_compliance: 'assignee',
  poa_cpa_inclusion: 'coordinator',
  ppa_annual_recon: 'seller',
  ppa_change_in_law: 'claimant',
  ppa_nomination: 'seller',
  ppa_termination: 'seller',
  project_change_order: 'contractor',
  project_risk: 'risk_owner',
  public_consultation: null,
  punch_list: 'contractor',
  rec_lifecycle: 'issuer',
  reserve_account: 'borrower',
  reserve_activation: 'provider',
  security_perfection: 'grantor',
  security_remediation: null,
  service_contract: 'customer',
  service_request: 'requester',
  settlement_fail: 'counterparty',
  sll_kpi: 'borrower',
  soiling_audit: 'owner',
  spare_parts_provisioning: 'supplier',
  sseg_registration: 'applicant',
  submittal_rfi: 'contractor',
  tariff_determination: 'applicant',
  trade_allocation: 'counterparty',
  transmission_outage: null, // asset_label — not a participant
  vcm_project_development: 'validator',
  vendor_escalation: 'vendor',
  virtual_ppa_settlement: 'generator', // migration 488: participant, not asset
  warranty_claim: 'vendor',
  warranty_recovery: 'vendor',
  wheeling_access: null,
};

/** Written status-mapping decisions (CUTOVER_COVERAGE §1 header rule): v1
 *  statuses with no same-name v2 state map to the nearest v2 state by lifecycle
 *  position. The original v1 status survives verbatim in payload.row — the
 *  mapping only picks which v2 state the txn resumes in (and therefore which
 *  timers arm). Unmapped unknown statuses still quarantine. */
export const STATUS_MAP: Record<string, Record<string, string>> = {
  availability_guarantee: {
    settled: 'remedy_instructed',
    dispute_resolved: 'met_closed',
  },
  best_execution: {
    closed: 'attested',
    exception_escalated: 'rejected',
    rfq_expired: 'cancelled',
  },
  black_start: {
    recertified: 'certified', // non-terminal — re-arms test timers
    contract_terminated: 'decertified',
  },
  carbon_budget: {
    final: 'closed',
    appeal: 'rejected',
  },
  carbon_credit_rating: {
    re_rated: 'published',
    escalated_to_integrity: 'rating_declined',
    downgraded: 'published',
  },
  carbon_erpa: {
    completed: 'delivery_confirmed',
    withdrawn: 'negotiation_failed',
  },
  carbon_issuance: {
    cancelled: 'withdrawn',
  },
  carbon_registration: {
    crediting_active: 'registered',
  },
  carbon_registry_transfer: {
    ca_notified: 'transferred',
    completed: 'transferred',
    aml_rejected: 'rejected',
    registry_rejected: 'rejected',
    cancelled: 'withdrawn',
  },
  carbon_retirement: {
    cancelled: 'withdrawn',
  },
  carbon_reversal: {
    closed: 'compensated',
    escalated: 'under_assessment', // non-terminal
    false_alarm: 'rejected',
  },
  certificate_bundle: {
    retired: 'bundle_closed',
    expired: 'withdrawn',
    cancelled: 'withdrawn',
  },
  complaint_resolution: {
    appealed: 'escalated',
  },
  compliance_inspection: {
    compliant_closed: 'closed_compliant',
    enforcement_closed: 'referred_enforcement',
    withdrawn: 'cancelled',
  },
  connection_energization: {
    commercial_operation: 'energized',
    connection_withdrawn: 'withdrawn',
  },
  construction_cost_report: {
    budget_compliant: 'certified',
    resolved: 'certified',
    default_triggered: 'rejected',
    cancelled: 'withdrawn',
  },
  counterparty_margin: {
    recovered: 'margin_posted_instructed',
    written_off: 'defaulted',
  },
  cp_clearance: {
    expired: 'cp_defaulted',
  },
  credit_insurance: {
    claim_paid: 'claim_instructed',
    lapsed: 'expired',
  },
  cross_border_trade: {
    trade_executed: 'delivered',
    fsca_rejected: 'rejected',
    sarb_rejected: 'rejected',
    expired: 'cancelled',
  },
  curtailment_claim: {
    compensation_settled: 'compensated_instructed',
    // v2 'rejected' is a non-terminal appeal state — dismissed is the terminal
    arbitrated: 'dismissed',
    non_compensable: 'dismissed',
  },
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
  drawdown: {
    // 'disbursed' is a declared settlement-honesty terminal with no live edge —
    // legacy import is its only legitimate writer (Store.commit, not applyTransition)
    closed: 'disbursed',
    cancelled: 'withdrawn',
  },
  ed_commitment: {
    closed: 'commitment_closed',
  },
  enforcement_action: {
    paid: 'resolved',
  },
  enforcement_action_s35: {
    settled: 'action_closed',
    archived: 'action_closed',
    cancelled: 'withdrawn',
  },
  eop_activation: {
    per_completed: 'eop_closed',
    per_outstanding: 'post_event_review',
    escalated_to_regulator: 'eop_closed',
    withdrawn: 'stood_down',
  },
  esap_compliance: {
    accepted: 'compliant',
    verified: 'compliant',
  },
  esg_disclosure: {
    archived: 'published',
    cancelled: 'withdrawn',
  },
  export_curtailment: {
    settled: 'closed',
    rejected: 'disputed',
    withdrawn: 'cancelled',
  },
  fsca_conduct_report: {
    accepted: 'closed',
    escalated: 'closed',
  },
  grid_code_compliance: {
    compliant_closed: 'resolved',
    disconnection_issued: 'enforcement_referred',
  },
  handover_dossier: {
    archived: 'handed_over',
    rejected: 'dossier_rejected',
    voided: 'withdrawn',
  },
  interconnector_schedule: {
    cancelled: 'withdrawn',
  },
  ipp_evm: {
    // v1 change-request flow ≈ v2 reforecast flow
    CR_logged: 'variance_detected',
    CR_approved: 'reforecast_published',
    contingency_drawn: 'reforecast_published',
  },
  ipp_schedule: {
    completed: 'schedule_completed',
    cancelled: 'schedule_cancelled',
    late_finish: 'schedule_completed',
  },
  isda_agreement: {
    active: 'executed', // non-terminal live state
    suspended: 'executed', // v1 status survives in payload.row
  },
  itp: {
    archived: 'itp_closed',
    rejected: 'itp_rejected',
    voided: 'withdrawn',
  },
  levy_assessment: {
    settled: 'levy_settled',
    written_off: 'assessment_waived',
    withdrawn: 'assessment_withdrawn',
  },
  licence_renewal: {
    granted: 'renewal_granted', // non-terminal — arms 14d issue SLA
    amended: 'renewal_issued',
  },
  load_curtailment: {
    closed: 'curtailment_complete',
    refused: 'non_compliance',
    withdrawn: 'directive_cancelled',
  },
  loan_default: {
    restructured: 'waived',
    enforced_closed: 'enforced',
    written_off: 'enforced',
  },
  loan_restructure: {
    restructure_proposal_drafted: 'proposal_drafted',
    lender_credit_committee_review: 'committee_review',
    borrower_term_sheet_negotiation: 'term_negotiation',
    legal_documentation_drafted: 'legal_documentation',
    effective_date: 'effective',
  },
  loan_transfer: {
    completed: 'transfer_registered',
    declined: 'transfer_declined',
    rejected: 'transfer_declined',
    withdrawn: 'transfer_withdrawn',
  },
  market_conduct_exam: {
    enforcement_action: 'referred_enforcement',
    closed_satisfactory: 'closed',
    withdrawn: 'cancelled',
  },
  oem_fco: {
    completed: 'closed',
    withdrawn: 'cancelled',
  },
  planned_outage: {
    rejected: 'request_rejected',
    closed: 'returned_to_service',
  },
  pm_compliance: {
    closed: 'completed',
  },
  poa_cpa_inclusion: {
    excluded: 'rejected',
    completed: 'included',
  },
  ppa_annual_recon: {
    settled: 'settled_instructed',
    restated: 'computed', // non-terminal — re-arms agree/dispute timers
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
  ppa_nomination: {
    deviation_settled: 'accepted',
    excused: 'accepted',
    cancelled: 'withdrawn',
  },
  ppa_termination: {
    closed: 'terminated',
    reinstated: 'withdrawn',
  },
  project_change_order: {
    incorporated: 'approved',
    cancelled: 'withdrawn',
  },
  project_risk: {
    cancelled: 'withdrawn',
  },
  public_consultation: {
    closed: 'outcome_published',
  },
  rec_lifecycle: {
    rejected: 'cancelled',
    clawed_back: 'cancelled',
  },
  reserve_account: {
    breached: 'shortfall', // non-terminal — arms cure SLA
    cancelled: 'withdrawn',
  },
  reserve_activation: {
    settled: 'settlement_instructed',
    dispute_resolved: 'settlement_instructed',
    withdrawn: 'cancelled',
  },
  service_contract: {
    renewed: 'active', // non-terminal — live contract
    cancelled: 'terminated',
  },
  service_request: {
    archived: 'closed',
  },
  settlement_fail: {
    closed_resolved: 'resolved',
    written_off: 'cancelled',
  },
  sll_kpi: {
    sustainability_event: 'breach_recorded', // non-terminal
  },
  sseg_registration: {
    referred_to_licensing: 'technical_review', // non-terminal
    refused: 'rejected',
    lapsed: 'withdrawn',
  },
  submittal_rfi: {
    closed_clean: 'closed',
  },
  tariff_determination: {
    implemented: 'determined',
    remitted: 'analysis', // non-terminal — remittal reopens analysis
  },
  trade_allocation: {
    settled: 'confirmed',
  },
  transmission_outage: {
    extended: 'outage_in_progress',
  },
  vcm_project_development: {
    credits_issued: 'registered',
    cancelled: 'withdrawn',
  },
  vendor_escalation: {
    // no disputed state in v2; remediation_in_progress has no SLA so no timer arms
    recall_issued: 'remediation_in_progress',
    arbitration: 'remediation_in_progress',
  },
  virtual_ppa_settlement: {
    settled: 'settled_instructed',
    written_off: 'cancelled',
  },
  warranty_claim: {
    closed: 'claim_closed',
  },
  warranty_recovery: {
    rejected: 'recovery_denied',
    written_off: 'withdrawn',
  },
  wheeling_access: {
    // post-grant v1 statuses land on the terminal grant — v1 status in payload.row
    terminated: 'access_granted',
    expired: 'access_granted',
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
