// ═══════════════════════════════════════════════════════════════════════════
// Wave 95 — Lender Sustainability-Linked Loan (SLL) KPI Compliance & Margin
// Ratchet. Mounted at /api/lender/sll-kpi/chain.
//
// The ESG-DRIVEN MARGIN-PRICING layer of a best-in-class lender stack. W38
// covenant_certificate handles point-in-time FINANCIAL KPI (DSCR/LLCR); W77
// reserve_account handles cash-balance covenants; W86 dscr_monitoring is the
// rolling FINANCIAL coverage monitor; W45 loan_default catches what crystallises
// after cure_failed. W95 fills the gap: NON-FINANCIAL ESG KPIs (CO2 intensity,
// energy-efficiency, safety-LTIFR, B-BBEE, mandatory disclosure, taxonomy
// alignment) measured annually, INDEPENDENTLY VERIFIED, driving contractual
// margin step-up / step-down per the LMA SLL Principles and SA Green Finance
// Taxonomy 2025.
//
// DISTINCTIVE move (beat Sustainalytics / ISS-ESG / MSCI ESG / S&P RobecoSAM
// CSA / Bloomberg ESG / Refinitiv ESG / LMA SLL Portal / ICMA SLBP / JSE
// Sustainability Index — all of which surface ESG SCORES but none drive a live
// contractual margin ratchet against an independent attestation): every chain
// row is LIVE-scored on every fetch against a TCFD-completeness battery (4
// pillars: governance / strategy / risk-mgmt / metrics), SBTi alignment
// pathway, SA Green Finance Taxonomy 2025 alignment %, verification-provenance
// band (big4 / iso14065_accredited / industry / inadequate), effective margin
// (base + cumulative ratchet bps), cumulative-ratchet ZAR over remaining
// tenor, and a PREDICTED-AMENDMENT-DATE rolling forward from current state.
//
// Write model — SINGLE-PARTY {admin, lender}. READ platform-wide (BORROWER
// must see their own case via tenant scoping). actor_party (sustainability_
// officer / verifier / credit_committee / borrower) is per-action functional
// attribution, NOT an access split.
//
// Reportability — the W95 SIGNATURE is BREACH/CURE-FAILED-driven (every SLL
// KPI breach and every cure-failure is reportable to SARB Climate Prudential
// Supervisor regardless of tier):
//   record_breach     crosses regulator EVERY tier — SIGNATURE hard line.
//   fail_cure         crosses regulator EVERY tier — mandatory disclosure
//                      (SA Green Finance Taxonomy 2025 + JSE SRL).
//   raise_restatement crosses regulator material+severe (SARB CPS 2024).
//   amend_margin      crosses regulator severe only (material price change).
//   attest_kpi        crosses regulator on floor-at-material classes always
//                      (climate/safety/mandatory-disclosure are always public)
//                      or severe variance regardless of class.
//   sla_breached      crosses material+severe (procedural-window miss risk).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  tierFromVariance,
  effectiveVariancePct,
  isHighTier,
  isReportable,
  isFloorAtMaterialClass,
  actionCrossesRegulator,
  authorityFor,
  ratchetBpsFor,
  effectiveMarginBps,
  cumulativeRatchetZar,
  tcfdCompletenessPct,
  attestationCompletenessPct,
  sbtiPathwayFromGwp,
  taxonomyAlignmentPct,
  verificationProvenanceBand,
  daysToKpiDue,
  predictedAmendmentDate,
  urgencyBand,
  partyForAction,
  eventTypeFor as specEventTypeFor,
  inboxSeverityForTier,
  CURE_FAILED_PENALTY_BPS,
  RATCHET_STEP_BPS,
  SLA_MINUTES,
  type SllKpiStatus,
  type SllKpiAction,
  type SllKpiTier,
  type SllKpiMaterialityClass,
} from '../utils/sll-kpi-spec';

const READ_ROLES = new Set([
  'admin', 'lender', 'regulator',
  'ipp', 'ipp_developer', 'wind',
  'carbon_fund', 'offtaker', 'grid_operator', 'trader', 'support',
]);

const WRITE_ROLES = new Set(['admin', 'lender']);

interface SllComplianceRow {
  id: string;
  compliance_number: string;
  source_event: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  source_wave: string | null;
  trigger_kind: string | null;
  borrower_party_id: string;
  borrower_party_name: string | null;
  borrower_persona: string | null;
  facility_id: string | null;
  facility_name: string | null;
  outstanding_zar: number;
  remaining_tenor_days: number;
  base_margin_bps: number;
  materiality_class: SllKpiMaterialityClass;
  kpi_code: string;
  kpi_name: string | null;
  kpi_unit: string | null;
  kpi_period_label: string | null;
  kpi_period_year: number | null;
  compliance_tier: SllKpiTier;
  authority_required: string | null;
  kpi_baseline_value: number | null;
  kpi_target_value: number | null;
  kpi_measured_value: number | null;
  kpi_forecast_value: number | null;
  measured_variance_pct: number | null;
  forecast_variance_pct: number | null;
  effective_variance_pct: number | null;
  ratchet_bps_this_period: number | null;
  cumulative_ratchet_bps: number;
  effective_margin_bps: number | null;
  cumulative_ratchet_zar: number | null;
  cure_failed_penalty_bps: number | null;
  tcfd_pillars_covered: number;
  tcfd_completeness_pct: number | null;
  attestation_fields_present: number;
  attestation_fields_required: number;
  attestation_completeness_pct: number | null;
  sbti_pathway: string | null;
  emissions_reduction_pct_per_year: number | null;
  taxonomy_eligible_zar: number | null;
  total_financing_zar: number | null;
  taxonomy_alignment_pct: number | null;
  verifier_slug: string | null;
  verification_provenance_band: string | null;
  cure_target_at: string | null;
  cure_actual_at: string | null;
  cure_basis: string | null;
  restatement_basis: string | null;
  baseline_ref: string | null;
  measurement_ref: string | null;
  verification_ref: string | null;
  attestation_ref: string | null;
  ratchet_ref: string | null;
  amendment_ref: string | null;
  breach_ref: string | null;
  cure_ref: string | null;
  restatement_ref: string | null;
  regulator_ref: string | null;
  facility_ref: string | null;
  sustainability_event_ref: string | null;
  baseline_basis: string | null;
  attestation_basis: string | null;
  breach_basis: string | null;
  fail_basis: string | null;
  cancellation_basis: string | null;
  reason_code: string | null;
  chain_status: SllKpiStatus;
  kpi_period_open_at: string;
  baseline_set_at: string | null;
  measurement_collected_at: string | null;
  independent_verification_at: string | null;
  kpi_attested_at: string | null;
  ratchet_computed_at: string | null;
  margin_amended_at: string | null;
  breach_recorded_at: string | null;
  cure_period_at: string | null;
  cure_failed_at: string | null;
  restatement_at: string | null;
  cancelled_at: string | null;
  sustainability_event_at: string | null;
  kpi_due_at: string | null;
  is_reportable: number;
  sla_deadline_at: string | null;
  last_sla_breach_at: string | null;
  escalation_level: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface SllEventRow {
  id: string;
  compliance_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_party: string | null;
  notes: string | null;
  payload: string | null;
  created_at: string;
}

const TIMESTAMP_COLUMN: Record<SllKpiStatus, keyof SllComplianceRow | null> = {
  kpi_period_open:          null,
  baseline_set:             'baseline_set_at',
  measurement_collected:    'measurement_collected_at',
  independent_verification: 'independent_verification_at',
  kpi_attested:             'kpi_attested_at',
  ratchet_computed:         'ratchet_computed_at',
  margin_amended:           'margin_amended_at',
  breach_recorded:          'breach_recorded_at',
  cure_period:              'cure_period_at',
  cure_failed:              'cure_failed_at',
  restatement:              'restatement_at',
  cancelled:                'cancelled_at',
  sustainability_event:     'sustainability_event_at',
};

function reasonCodeFor(action: SllKpiAction): string {
  switch (action) {
    case 'set_baseline':                 return 'BASELINE_FIXED';
    case 'collect_measurement':          return 'MEASUREMENT_COLLECTED';
    case 'start_verification':           return 'VERIFIER_ENGAGED';
    case 'attest_kpi':                   return 'KPI_ATTESTED';
    case 'record_breach':                return 'KPI_MISS';
    case 'compute_ratchet':              return 'RATCHET_COMPUTED';
    case 'amend_margin':                 return 'MARGIN_AMENDED';
    case 'open_cure_period':             return 'CURE_OPENED';
    case 'validate_cure':                return 'CURE_VALIDATED';
    case 'fail_cure':                    return 'CURE_FAILED';
    case 'raise_restatement':            return 'RESTATEMENT_RAISED';
    case 're_verify':                    return 'RE_VERIFY_INITIATED';
    case 'trigger_sustainability_event': return 'SUSTAINABILITY_EVENT';
    case 'cancel':                       return 'CANCELLED';
  }
}

function decorate(row: SllComplianceRow, now: Date) {
  const tier = row.compliance_tier;
  const status = row.chain_status;
  const slaIso = row.sla_deadline_at;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;

  const effectiveVarianceLive = effectiveVariancePct(
    row.measured_variance_pct,
    row.forecast_variance_pct,
  );
  const tierLive = tierFromVariance(effectiveVarianceLive, row.materiality_class);

  // Live ratchet recomputation: cumulative bps already on the row; effective
  // margin = base + cumulative ratchet (no recompute of cumulative — that's a
  // ledger built by compute_ratchet transitions).
  const effectiveMarginLive = effectiveMarginBps(
    row.base_margin_bps,
    row.cumulative_ratchet_bps,
  );
  const cumulativeRatchetZarLive = cumulativeRatchetZar(
    row.cumulative_ratchet_bps,
    row.outstanding_zar,
    row.remaining_tenor_days,
  );

  const tcfdLive = tcfdCompletenessPct(row.tcfd_pillars_covered, 4);
  const attestationLive = attestationCompletenessPct(
    row.attestation_fields_present,
    row.attestation_fields_required,
  );
  const sbtiLive = sbtiPathwayFromGwp(row.emissions_reduction_pct_per_year ?? 0);
  const taxonomyLive = taxonomyAlignmentPct(
    row.taxonomy_eligible_zar ?? 0,
    row.total_financing_zar ?? 0,
  );
  const provenanceLive = verificationProvenanceBand(row.verifier_slug);

  const stateEnteredCol = TIMESTAMP_COLUMN[status];
  const stateEnteredIso = stateEnteredCol ? (row[stateEnteredCol] as string | null) : row.kpi_period_open_at;
  const stateEnteredAt = stateEnteredIso ? new Date(stateEnteredIso) : now;
  const predictedAmendmentLive = predictedAmendmentDate(status, tierLive, stateEnteredAt);

  const daysToKpiDueLive = daysToKpiDue(row.kpi_due_at, now);
  const urgency = urgencyBand(status, slaIso ? new Date(slaIso) : null, now);

  const floorApplied = isFloorAtMaterialClass(row.materiality_class);

  return {
    ...row,
    is_terminal: isTerminal(status),
    minutes_until_sla: minutesUntilSla,
    sla_breached: minutesUntilSla != null && minutesUntilSla < 0 && !isTerminal(status),
    sla_window_minutes: SLA_MINUTES[status]?.[tier] ?? 0,
    urgency_band: urgency,
    is_reportable_flag: !!row.is_reportable,
    high_tier_flag: isHighTier(tier),
    floor_at_material_class_flag: floorApplied,
    signature_class_flag: floorApplied,
    authority_required_live: authorityFor(tier),
    effective_variance_pct_live: effectiveVarianceLive,
    tier_live: tierLive,
    effective_margin_bps_live: effectiveMarginLive,
    cumulative_ratchet_zar_live: cumulativeRatchetZarLive,
    tcfd_completeness_pct_live: tcfdLive,
    attestation_completeness_pct_live: attestationLive,
    sbti_pathway_live: sbtiLive,
    taxonomy_alignment_pct_live: taxonomyLive,
    verification_provenance_band_live: provenanceLive,
    predicted_amendment_date_live: predictedAmendmentLive,
    days_to_kpi_due_live: daysToKpiDueLive,
    inbox_severity_live: inboxSeverityForTier(tier),
    reportable_per_spec: isReportable(tier),
    ratchet_step_bps_per_tier: RATCHET_STEP_BPS,
    cure_failed_penalty_bps: CURE_FAILED_PENALTY_BPS,
  };
}

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const compliance_tier   = c.req.query('compliance_tier');
  const status            = c.req.query('status');
  const materiality_class = c.req.query('materiality_class');
  const kpi_code          = c.req.query('kpi_code');
  const borrower          = c.req.query('borrower_party_id');
  const facility_id       = c.req.query('facility_id');
  const breached          = c.req.query('breached');
  const reportable        = c.req.query('reportable');
  const floor_only        = c.req.query('floor_only');

  let sql = 'SELECT * FROM oe_sll_kpi_compliance WHERE 1=1';
  const binds: unknown[] = [];
  if (compliance_tier)   { sql += ' AND compliance_tier = ?';   binds.push(compliance_tier); }
  if (status)            { sql += ' AND chain_status = ?';      binds.push(status); }
  if (materiality_class) { sql += ' AND materiality_class = ?'; binds.push(materiality_class); }
  if (kpi_code)          { sql += ' AND kpi_code = ?';          binds.push(kpi_code); }
  if (borrower)          { sql += ' AND borrower_party_id = ?'; binds.push(borrower); }
  if (facility_id)       { sql += ' AND facility_id = ?';       binds.push(facility_id); }

  sql += ' ORDER BY datetime(kpi_period_open_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<SllComplianceRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable_flag);
  if (floor_only === 'true') items = items.filter((r) => r.floor_at_material_class_flag);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_class: Record<string, number> = {};
  const by_borrower: Record<string, number> = {};
  const by_kpi: Record<string, number> = {};
  const by_urgency: Record<string, number> = {};
  const by_sbti: Record<string, number> = {};
  const by_provenance: Record<string, number> = {};
  for (const r of items) {
    by_status[r.chain_status] = (by_status[r.chain_status] || 0) + 1;
    by_tier[r.compliance_tier] = (by_tier[r.compliance_tier] || 0) + 1;
    by_class[r.materiality_class] = (by_class[r.materiality_class] || 0) + 1;
    by_borrower[r.borrower_party_id] = (by_borrower[r.borrower_party_id] || 0) + 1;
    by_kpi[r.kpi_code] = (by_kpi[r.kpi_code] || 0) + 1;
    by_urgency[r.urgency_band] = (by_urgency[r.urgency_band] || 0) + 1;
    by_sbti[r.sbti_pathway_live] = (by_sbti[r.sbti_pathway_live] || 0) + 1;
    by_provenance[r.verification_provenance_band_live] = (by_provenance[r.verification_provenance_band_live] || 0) + 1;
  }

  const open_count             = items.filter((i) => !i.is_terminal).length;
  const margin_amended_count   = items.filter((i) => i.chain_status === 'margin_amended').length;
  const breach_recorded_count  = items.filter((i) => i.chain_status === 'breach_recorded').length;
  const cure_period_count      = items.filter((i) => i.chain_status === 'cure_period').length;
  const cure_failed_count      = items.filter((i) => i.chain_status === 'cure_failed').length;
  const restatement_count      = items.filter((i) => i.chain_status === 'restatement').length;
  const cancelled_count        = items.filter((i) => i.chain_status === 'cancelled').length;
  const sustainability_event_count = items.filter((i) => i.chain_status === 'sustainability_event').length;
  const breached_count         = items.filter((i) => i.sla_breached).length;
  const reportable_total       = items.filter((i) => i.is_reportable_flag).length;
  const signature_count        = items.filter((i) => i.signature_class_flag).length;
  const floor_applied_count    = items.filter((i) => i.floor_at_material_class_flag).length;

  const total_outstanding_zar      = items.reduce((s, i) => s + (i.outstanding_zar || 0), 0);
  const total_cumulative_ratchet_bps = items.reduce((s, i) => s + (i.cumulative_ratchet_bps || 0), 0);
  const total_cumulative_ratchet_zar = items.reduce((s, i) => s + (i.cumulative_ratchet_zar_live || 0), 0);
  const total_taxonomy_eligible_zar  = items.reduce((s, i) => s + (i.taxonomy_eligible_zar || 0), 0);
  const total_total_financing_zar    = items.reduce((s, i) => s + (i.total_financing_zar || 0), 0);
  const portfolio_taxonomy_alignment_pct = total_total_financing_zar > 0
    ? (total_taxonomy_eligible_zar / total_total_financing_zar) * 100
    : 0;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_class,
      by_borrower,
      by_kpi,
      by_urgency,
      by_sbti,
      by_provenance,
      open_count,
      margin_amended_count,
      breach_recorded_count,
      cure_period_count,
      cure_failed_count,
      restatement_count,
      cancelled_count,
      sustainability_event_count,
      breached: breached_count,
      reportable_total,
      signature_count,
      floor_applied_count,
      total_outstanding_zar,
      total_cumulative_ratchet_bps,
      total_cumulative_ratchet_zar,
      total_taxonomy_eligible_zar,
      total_total_financing_zar,
      portfolio_taxonomy_alignment_pct,
      ratchet_step_bps_per_tier: RATCHET_STEP_BPS,
      cure_failed_penalty_bps: CURE_FAILED_PENALTY_BPS,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_sll_kpi_compliance WHERE id = ?').bind(id).first<SllComplianceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_sll_kpi_events WHERE compliance_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<SllEventRow>();

  return c.json({
    success: true,
    data: {
      compliance: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

async function transition(
  c: Context<HonoEnv>,
  action: SllKpiAction,
  bodyHandler?: (row: SllComplianceRow, body: Record<string, unknown>) => Partial<SllComplianceRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_sll_kpi_compliance WHERE id = ?').bind(id).first<SllComplianceRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.chain_status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.chain_status} -> ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};
  // Tier RE-DERIVED on every transition from effective variance (measured
  // preferred over forecast) with floor-at-material override for climate /
  // safety / mandatory-disclosure classes (W95 distinctive class-floor).
  const measuredVariance = (overrides.measured_variance_pct as number | undefined) ?? row.measured_variance_pct;
  const forecastVariance = (overrides.forecast_variance_pct as number | undefined) ?? row.forecast_variance_pct;
  const materialityClass = (overrides.materiality_class as SllKpiMaterialityClass | undefined) ?? row.materiality_class;
  const effVariance = effectiveVariancePct(measuredVariance, forecastVariance);
  const tier = tierFromVariance(effVariance, materialityClass);
  overrides.compliance_tier = tier;
  overrides.authority_required = authorityFor(tier);
  overrides.effective_variance_pct = effVariance;

  // Reportability — RE-COMPUTED on every transition. record_breach + fail_cure
  // ALWAYS cross (W95 SIGNATURE); other actions depend on tier + materiality.
  const crosses = actionCrossesRegulator(action, tier, materialityClass);
  overrides.is_reportable = (isReportable(tier) || crosses) ? 1 : 0;

  const tsCol = TIMESTAMP_COLUMN[to];
  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, tier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const setClauses: string[] = ['chain_status = ?', 'updated_at = ?', 'sla_deadline_at = ?'];
  const setBinds: unknown[] = [to, nowIso, slaIso];
  if (tsCol) {
    setClauses.push(`${tsCol} = ?`);
    setBinds.push(nowIso);
  }
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_sll_kpi_compliance SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `sll_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  const reasonCode = (overrides.reason_code as string | undefined) ?? reasonCodeFor(action);
  await c.env.DB.prepare(
    'INSERT INTO oe_sll_kpi_events (id, compliance_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    specEventTypeFor(to),
    row.chain_status,
    to,
    user.id,
    partyForAction(action),
    notes,
    JSON.stringify({ ...overrides, action, reason_code: reasonCode }),
    nowIso,
  ).run();

  const eventName = specEventTypeFor(to) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'sll_kpi',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      compliance_tier: tier,
      materiality_class: materialityClass,
      chain_status: to,
      from_status: row.chain_status,
      action,
      reason_code: reasonCode,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_sll_kpi_compliance WHERE id = ?').bind(id).first<SllComplianceRow>();
  return c.json({ success: true, data: { compliance: refreshed ? decorate(refreshed, now) : null } });
}

interface BaselineBody {
  kpi_baseline_value?: number;
  kpi_target_value?: number;
  kpi_period_label?: string;
  kpi_period_year?: number;
  kpi_due_at?: string;
  baseline_ref?: string;
  baseline_basis?: string;
  reason_code?: string;
}

interface MeasurementBody {
  kpi_measured_value?: number;
  kpi_forecast_value?: number;
  measured_variance_pct?: number;
  forecast_variance_pct?: number;
  measurement_ref?: string;
  reason_code?: string;
}

interface VerificationBody {
  verifier_slug?: string;
  verification_ref?: string;
  tcfd_pillars_covered?: number;
  attestation_fields_present?: number;
  attestation_fields_required?: number;
  reason_code?: string;
}

interface AttestationBody {
  attestation_ref?: string;
  attestation_basis?: string;
  sbti_pathway?: string;
  emissions_reduction_pct_per_year?: number;
  taxonomy_eligible_zar?: number;
  total_financing_zar?: number;
  reason_code?: string;
}

interface BreachBody {
  breach_ref?: string;
  breach_basis?: string;
  reason_code?: string;
}

interface RatchetBody {
  ratchet_ref?: string;
  ratchet_bps_this_period?: number;
  reason_code?: string;
}

interface AmendmentBody {
  amendment_ref?: string;
  reason_code?: string;
}

interface CurePeriodBody {
  cure_ref?: string;
  cure_target_at?: string;
  cure_basis?: string;
  reason_code?: string;
}

interface CureValidateBody {
  cure_ref?: string;
  cure_actual_at?: string;
  reason_code?: string;
}

interface CureFailBody {
  cure_ref?: string;
  fail_basis?: string;
  reason_code?: string;
}

interface RestatementBody {
  restatement_ref?: string;
  restatement_basis?: string;
  reason_code?: string;
}

interface ReVerifyBody {
  verifier_slug?: string;
  verification_ref?: string;
  reason_code?: string;
}

interface SustainabilityEventBody {
  sustainability_event_ref?: string;
  reason_code?: string;
}

interface CancelBody {
  cancellation_basis?: string;
  reason_code?: string;
}

app.post('/:id/set-baseline', async (c) => transition(c, 'set_baseline', (_row, body) => {
  const b = body as Partial<BaselineBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.kpi_baseline_value === 'number') out.kpi_baseline_value = b.kpi_baseline_value;
  if (typeof b.kpi_target_value === 'number')   out.kpi_target_value = b.kpi_target_value;
  if (typeof b.kpi_period_label === 'string')   out.kpi_period_label = b.kpi_period_label;
  if (typeof b.kpi_period_year === 'number')    out.kpi_period_year = b.kpi_period_year;
  if (typeof b.kpi_due_at === 'string')         out.kpi_due_at = b.kpi_due_at;
  if (typeof b.baseline_ref === 'string')       out.baseline_ref = b.baseline_ref;
  if (typeof b.baseline_basis === 'string')     out.baseline_basis = b.baseline_basis;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/collect-measurement', async (c) => transition(c, 'collect_measurement', (row, body) => {
  const b = body as Partial<MeasurementBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.kpi_measured_value === 'number')   out.kpi_measured_value = b.kpi_measured_value;
  if (typeof b.kpi_forecast_value === 'number')   out.kpi_forecast_value = b.kpi_forecast_value;
  if (typeof b.measured_variance_pct === 'number') {
    out.measured_variance_pct = b.measured_variance_pct;
  } else if (
    typeof (b.kpi_measured_value ?? row.kpi_measured_value) === 'number' &&
    typeof row.kpi_target_value === 'number' &&
    row.kpi_target_value !== 0
  ) {
    const m = (b.kpi_measured_value ?? row.kpi_measured_value) as number;
    out.measured_variance_pct = ((m - row.kpi_target_value) / Math.abs(row.kpi_target_value)) * 100;
  }
  if (typeof b.forecast_variance_pct === 'number') out.forecast_variance_pct = b.forecast_variance_pct;
  if (typeof b.measurement_ref === 'string')       out.measurement_ref = b.measurement_ref;
  if (typeof b.reason_code === 'string')           out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/start-verification', async (c) => transition(c, 'start_verification', (_row, body) => {
  const b = body as Partial<VerificationBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.verifier_slug === 'string') {
    out.verifier_slug = b.verifier_slug;
    out.verification_provenance_band = verificationProvenanceBand(b.verifier_slug);
  }
  if (typeof b.verification_ref === 'string')         out.verification_ref = b.verification_ref;
  if (typeof b.tcfd_pillars_covered === 'number') {
    out.tcfd_pillars_covered = b.tcfd_pillars_covered;
    out.tcfd_completeness_pct = tcfdCompletenessPct(b.tcfd_pillars_covered, 4);
  }
  if (typeof b.attestation_fields_present === 'number')  out.attestation_fields_present = b.attestation_fields_present;
  if (typeof b.attestation_fields_required === 'number') out.attestation_fields_required = b.attestation_fields_required;
  if (typeof b.attestation_fields_present === 'number' && typeof b.attestation_fields_required === 'number') {
    out.attestation_completeness_pct = attestationCompletenessPct(
      b.attestation_fields_present,
      b.attestation_fields_required,
    );
  }
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/attest-kpi', async (c) => transition(c, 'attest_kpi', (_row, body) => {
  const b = body as Partial<AttestationBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.attestation_ref === 'string')   out.attestation_ref = b.attestation_ref;
  if (typeof b.attestation_basis === 'string') out.attestation_basis = b.attestation_basis;
  if (typeof b.sbti_pathway === 'string')      out.sbti_pathway = b.sbti_pathway;
  if (typeof b.emissions_reduction_pct_per_year === 'number') {
    out.emissions_reduction_pct_per_year = b.emissions_reduction_pct_per_year;
    out.sbti_pathway = sbtiPathwayFromGwp(b.emissions_reduction_pct_per_year);
  }
  if (typeof b.taxonomy_eligible_zar === 'number') out.taxonomy_eligible_zar = b.taxonomy_eligible_zar;
  if (typeof b.total_financing_zar === 'number')   out.total_financing_zar = b.total_financing_zar;
  if (typeof b.taxonomy_eligible_zar === 'number' && typeof b.total_financing_zar === 'number') {
    out.taxonomy_alignment_pct = taxonomyAlignmentPct(b.taxonomy_eligible_zar, b.total_financing_zar);
  }
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/record-breach', async (c) => transition(c, 'record_breach', (_row, body) => {
  const b = body as Partial<BreachBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.breach_ref === 'string')   out.breach_ref = b.breach_ref;
  if (typeof b.breach_basis === 'string') out.breach_basis = b.breach_basis;
  if (typeof b.reason_code === 'string')  out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/compute-ratchet', async (c) => transition(c, 'compute_ratchet', (row, body) => {
  const b = body as Partial<RatchetBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.ratchet_ref === 'string') out.ratchet_ref = b.ratchet_ref;
  // Compute ratchet from effective variance + tier RE-DERIVED.
  const effVariance = effectiveVariancePct(row.measured_variance_pct, row.forecast_variance_pct);
  const tier = tierFromVariance(effVariance, row.materiality_class);
  let bps: number;
  if (typeof b.ratchet_bps_this_period === 'number') {
    bps = b.ratchet_bps_this_period;
  } else {
    bps = ratchetBpsFor(effVariance, tier, false);
  }
  out.ratchet_bps_this_period = bps;
  const newCumulative = (row.cumulative_ratchet_bps || 0) + bps;
  out.cumulative_ratchet_bps = newCumulative;
  out.effective_margin_bps = effectiveMarginBps(row.base_margin_bps, newCumulative);
  out.cumulative_ratchet_zar = cumulativeRatchetZar(
    newCumulative,
    row.outstanding_zar,
    row.remaining_tenor_days,
  );
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/amend-margin', async (c) => transition(c, 'amend_margin', (_row, body) => {
  const b = body as Partial<AmendmentBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.amendment_ref === 'string') out.amendment_ref = b.amendment_ref;
  if (typeof b.reason_code === 'string')   out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/open-cure-period', async (c) => transition(c, 'open_cure_period', (_row, body) => {
  const b = body as Partial<CurePeriodBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.cure_ref === 'string')        out.cure_ref = b.cure_ref;
  if (typeof b.cure_target_at === 'string')  out.cure_target_at = b.cure_target_at;
  if (typeof b.cure_basis === 'string')      out.cure_basis = b.cure_basis;
  if (typeof b.reason_code === 'string')     out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/validate-cure', async (c) => transition(c, 'validate_cure', (_row, body) => {
  const b = body as Partial<CureValidateBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.cure_ref === 'string') out.cure_ref = b.cure_ref;
  if (typeof b.cure_actual_at === 'string') {
    out.cure_actual_at = b.cure_actual_at;
  } else {
    out.cure_actual_at = new Date().toISOString();
  }
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/fail-cure', async (c) => transition(c, 'fail_cure', (row, body) => {
  const b = body as Partial<CureFailBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.cure_ref === 'string')   out.cure_ref = b.cure_ref;
  if (typeof b.fail_basis === 'string') out.fail_basis = b.fail_basis;
  // Cure-failed penalty: +CURE_FAILED_PENALTY_BPS stacks onto the cumulative
  // ratchet. The margin step-up tier is severity-derived from the original
  // breach variance.
  const effVariance = effectiveVariancePct(row.measured_variance_pct, row.forecast_variance_pct);
  const tier = tierFromVariance(effVariance, row.materiality_class);
  const penaltyBps = ratchetBpsFor(Math.abs(effVariance) || 1, tier, true);
  out.cure_failed_penalty_bps = CURE_FAILED_PENALTY_BPS;
  out.ratchet_bps_this_period = penaltyBps;
  const newCumulative = (row.cumulative_ratchet_bps || 0) + penaltyBps;
  out.cumulative_ratchet_bps = newCumulative;
  out.effective_margin_bps = effectiveMarginBps(row.base_margin_bps, newCumulative);
  out.cumulative_ratchet_zar = cumulativeRatchetZar(
    newCumulative,
    row.outstanding_zar,
    row.remaining_tenor_days,
  );
  if (typeof b.reason_code === 'string') out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/raise-restatement', async (c) => transition(c, 'raise_restatement', (_row, body) => {
  const b = body as Partial<RestatementBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.restatement_ref === 'string')   out.restatement_ref = b.restatement_ref;
  if (typeof b.restatement_basis === 'string') out.restatement_basis = b.restatement_basis;
  if (typeof b.reason_code === 'string')       out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/re-verify', async (c) => transition(c, 're_verify', (_row, body) => {
  const b = body as Partial<ReVerifyBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.verifier_slug === 'string') {
    out.verifier_slug = b.verifier_slug;
    out.verification_provenance_band = verificationProvenanceBand(b.verifier_slug);
  }
  if (typeof b.verification_ref === 'string') out.verification_ref = b.verification_ref;
  if (typeof b.reason_code === 'string')      out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/trigger-sustainability-event', async (c) => transition(c, 'trigger_sustainability_event', (_row, body) => {
  const b = body as Partial<SustainabilityEventBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.sustainability_event_ref === 'string') out.sustainability_event_ref = b.sustainability_event_ref;
  if (typeof b.reason_code === 'string')              out.reason_code = b.reason_code;
  return out;
}));

app.post('/:id/cancel', async (c) => transition(c, 'cancel', (_row, body) => {
  const b = body as Partial<CancelBody>;
  const out: Partial<SllComplianceRow> = {};
  if (typeof b.cancellation_basis === 'string') out.cancellation_basis = b.cancellation_basis;
  if (typeof b.reason_code === 'string')        out.reason_code = b.reason_code;
  return out;
}));

export async function sllKpiSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const rs = await env.DB.prepare(
    `SELECT * FROM oe_sll_kpi_compliance
     WHERE chain_status NOT IN ('margin_amended','cure_failed','cancelled','sustainability_event')
       AND sla_deadline_at IS NOT NULL
       AND datetime(sla_deadline_at) < datetime(?)
       AND (last_sla_breach_at IS NULL OR datetime(last_sla_breach_at) < datetime(sla_deadline_at))`,
  ).bind(nowIso).all<SllComplianceRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      `UPDATE oe_sll_kpi_compliance
       SET last_sla_breach_at = ?, escalation_level = escalation_level + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(nowIso, nowIso, row.id).run();

    const evtId = `sll_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_sll_kpi_events (id, compliance_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'sll_kpi.sla_breached',
      row.chain_status,
      row.chain_status,
      'system',
      'system',
      `Auto-breach: ${row.chain_status} past SLA (tier ${row.compliance_tier})`,
      JSON.stringify({ sla_deadline_at: row.sla_deadline_at }),
      nowIso,
    ).run();

    // SLA-breach crosses regulator on material+severe (per W95 spec).
    if (isHighTier(row.compliance_tier)) {
      await fireCascade({
        event: 'sll_kpi.sla_breached',
        actor_id: 'system',
        entity_type: 'sll_kpi',
        entity_id: row.id,
        data: {
          ...row,
          crosses_into_regulator: true,
        },
        env,
      });
    }

    breached++;
  }
  return { scanned: rows.length, breached };
}

export default app;
