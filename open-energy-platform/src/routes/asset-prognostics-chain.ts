// ═══════════════════════════════════════════════════════════════════════════
// Wave 71 — Esums Predictive Asset Health & Prognostics chain (P6)
//
// Mounted at /api/asset-prognostics/chain.
//
// The NTT-beating predictive O&M brain. Sits ABOVE the existing Esums telemetry
// (om_telemetry / om_devices / om_faults / om_predictions, migration 058) and
// turns raw telemetry into explainable, revenue-ranked prognostics, then runs
// each one through a 12-state lifecycle from auto-detection to resolution /
// confirmed failure (closing the loop on false positives).
//
// Where NTT Data's IoT + O&M stack stops at black-box anomaly scores, this surface
// adds (see src/utils/asset-prognostics-spec.ts):
//   - a 6-method anomaly ENSEMBLE (EWMA SPC, z-score, Tukey IQR, rate-of-change,
//     persistence, fleet-percentile) with method-agreement confidence,
//     /compute exposes it live;
//   - physics expected-power + IEC 61724 performance ratio,
//   - OLS degradation trend + Remaining-Useful-Life projection,
//   - EXPLAINABLE failure-mode fingerprinting (12 modes, evidence strings) — the
//     "why" NTT's ML lacks,
//   - revenue-at-risk in ZAR and an O&M savings ledger that quantifies the
//     advantage over the ~30% industry/NTT predictive-maintenance benchmark.
//
//   predicted → triaged → diagnosed → action_planned → wo_raised → monitoring
//             → resolved
//   recurrence:   monitoring → diagnosed (reopen)
//   escalate:     {triaged,diagnosed,action_planned,monitoring} → escalated → wo_raised
//   false-positive close-out:  {predicted,triaged} → dismissed ; predicted → auto_suppressed
//   stale:        {predicted,triaged,diagnosed} → expired
//   materialised: ANY active → confirmed_failure  (feeds closed-loop tuning)
//
// Single-party write: the O&M / asset-performance desk ({admin, support}) drives
// the whole chain. All nine personas may READ the fleet health register.
//
// Reportability (the W71 signature, SAFETY-driven): record_failure crosses to the
// regulator for EVERY tier when the fault mode is safety-implicated (a materialised
// arc / thermal-runaway / hotspot event is always an OHSA / NRCS matter), otherwise
// for the high tiers; escalate_prognostic crosses for the high tiers when safety-
// implicated; SLA breaches cross for the high tiers (major + critical).
// ═══════════════════════════════════════════════════════════════════════════

import { Hono, Context } from 'hono';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { HonoEnv } from '../utils/types';
import { fireCascade } from '../utils/cascade';
import {
  nextStatus,
  isTerminal,
  slaDeadlineFor,
  slaWindowMinutes,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  prognosticTier,
  detectAnomalyEnsemble,
  degradationTrend,
  remainingUsefulLife,
  classifyFailureMode,
  revenueAtRiskZar,
  savingsLedger,
  healthScore,
  type PrognosticStatus,
  type PrognosticAction,
  type PrognosticTier,
  type SymptomVector,
} from '../utils/asset-prognostics-spec';

// All nine personas may read the fleet prognostics register.
const READ_ROLES = new Set([
  'admin', 'support', 'ipp_developer', 'offtaker', 'lender',
  'carbon_fund', 'regulator', 'grid_operator', 'trader',
]);

// Single-party write: the O&M / asset-performance desk.
const WRITE_ROLES = new Set(['admin', 'support']);

const app = new Hono<HonoEnv>();
app.use('*', authMiddleware);

interface PrognosticRow {
  id: string;
  site_id: string;
  device_id: string | null;
  asset_label: string | null;
  technology: string | null;
  status: PrognosticStatus;
  tier: PrognosticTier;
  prediction_type: string | null;
  fault_mode: string | null;
  fault_mode_confidence: number;
  safety_implicated: number;
  evidence_json: string | null;
  health_score: number;
  performance_ratio: number | null;
  anomaly_score: number;
  anomaly_confidence: number;
  methods_triggered_json: string | null;
  degradation_slope_per_day: number;
  degradation_r_squared: number;
  degradation_direction: string;
  rul_days: number | null;
  rul_confidence: number;
  rul_basis: string | null;
  lost_kwh_per_day: number;
  tariff_zar_per_mwh: number;
  revenue_at_risk_zar: number;
  reactive_cost_zar: number;
  predictive_cost_zar: number;
  savings_zar: number;
  savings_pct: number;
  benchmark_savings_zar: number;
  incremental_vs_benchmark_zar: number;
  lead_time_days: number;
  predicted_failure_at: string | null;
  detected_at: string | null;
  status_entered_at: string | null;
  sla_deadline: string | null;
  sla_breached: number;
  is_reportable: number;
  work_order_id: string | null;
  recurrence_count: number;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
}

interface PrognosticEventRow {
  id: string;
  prognostic_id: string;
  event_type: string;
  actor_id: string | null;
  actor_party: string | null;
  from_status: string | null;
  to_status: string | null;
  detail: string | null;
  created_at: string;
}

function eventTypeFor(action: PrognosticAction): string {
  switch (action) {
    case 'triage_prediction':   return 'asset_prognostic.triaged';
    case 'dismiss_prediction':  return 'asset_prognostic.dismissed';
    case 'auto_suppress':       return 'asset_prognostic.auto_suppressed';
    case 'diagnose_root_cause': return 'asset_prognostic.diagnosed';
    case 'plan_action':         return 'asset_prognostic.action_planned';
    case 'raise_work_order':    return 'asset_prognostic.wo_raised';
    case 'begin_monitoring':    return 'asset_prognostic.monitoring';
    case 'confirm_resolved':    return 'asset_prognostic.resolved';
    case 'escalate_prognostic': return 'asset_prognostic.escalated';
    case 'record_failure':      return 'asset_prognostic.confirmed_failure';
    case 'expire_prognostic':   return 'asset_prognostic.expired';
    case 'reopen_recurrence':   return 'asset_prognostic.diagnosed';
  }
}

// Inline AI: surface the single most useful next action for each open prognostic,
// with a human-readable "why" and the endpoint to 1-click accept it. No popups —
// this rides along in the list payload as a per-item card.
function buildPrognosticAi(row: PrognosticRow): {
  action: PrognosticAction;
  endpoint: string;
  label: string;
  why: string;
} | null {
  const safety = !!row.safety_implicated;
  const conf = row.fault_mode_confidence || 0;
  const mode = row.fault_mode || 'fault';
  switch (row.status) {
    case 'predicted':
      if (safety && (conf >= 0.8 || row.health_score < 25)) {
        return {
          action: 'escalate_prognostic', endpoint: 'escalate-prognostic', label: 'Escalate now',
          why: `Safety-implicated ${mode} at ${Math.round(conf * 100)}% confidence — escalate ahead of triage`,
        };
      }
      if (row.anomaly_score < 0.2 && conf < 0.3) {
        return {
          action: 'dismiss_prediction', endpoint: 'dismiss-prediction', label: 'Dismiss as false positive',
          why: `Low anomaly score (${row.anomaly_score.toFixed(2)}) and weak fault signal — likely a transient blip`,
        };
      }
      return {
        action: 'triage_prediction', endpoint: 'triage-prediction', label: 'Triage prediction',
        why: `${mode} predicted with ${Math.round(conf * 100)}% confidence — confirm and rank for action`,
      };
    case 'triaged':
      return {
        action: 'diagnose_root_cause', endpoint: 'diagnose-root-cause', label: 'Diagnose root cause',
        why: `Triaged ${mode} — run the diagnosis to lock the failure mode before planning the fix`,
      };
    case 'diagnosed':
      return {
        action: 'plan_action', endpoint: 'plan-action', label: 'Plan intervention',
        why: `Root cause confirmed (${mode}) — plan the predictive intervention while RUL is ${row.rul_days ?? '—'} days`,
      };
    case 'action_planned':
      return {
        action: 'raise_work_order', endpoint: 'raise-work-order', label: 'Raise work order',
        why: `Plan ready — raise the WO now to capture R${row.savings_zar.toLocaleString()} of avoided reactive cost`,
      };
    case 'wo_raised':
      return {
        action: 'begin_monitoring', endpoint: 'begin-monitoring', label: 'Begin monitoring',
        why: 'Work order dispatched — move to post-intervention monitoring to verify recovery',
      };
    case 'monitoring':
      return {
        action: 'confirm_resolved', endpoint: 'confirm-resolved', label: 'Confirm resolved',
        why: `Health recovered to ${row.health_score} — confirm resolution and bank the saving`,
      };
    case 'escalated':
      return {
        action: 'raise_work_order', endpoint: 'raise-work-order', label: 'Raise urgent work order',
        why: `Escalated ${mode} — raise the urgent WO to arrest the failure`,
      };
    default:
      return null;
  }
}

function decorate(row: PrognosticRow, now: Date) {
  const slaIso = row.sla_deadline;
  const minutesUntilSla = slaIso
    ? Math.floor((new Date(slaIso).getTime() - now.getTime()) / 60000)
    : null;
  const terminal = isTerminal(row.status);
  return {
    ...row,
    safety_implicated: !!row.safety_implicated,
    is_reportable: !!row.is_reportable,
    is_terminal: terminal,
    minutes_until_sla: minutesUntilSla,
    sla_breached_now: !terminal && minutesUntilSla != null && minutesUntilSla < 0,
    sla_window_minutes: slaWindowMinutes(row.status, row.tier),
    breach_crosses_regulator: slaBreachCrossesIntoRegulator(row.tier),
    evidence: row.evidence_json ? safeJson<string[]>(row.evidence_json, []) : [],
    methods_triggered: row.methods_triggered_json ? safeJson<string[]>(row.methods_triggered_json, []) : [],
    ai: terminal ? null : buildPrognosticAi(row),
  };
}

function safeJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ── /compute — the live predictive brain (read-level decision support) ───────
// Runs the full ensemble + RUL + fault fingerprint + savings ledger on a supplied
// telemetry window WITHOUT persisting. This is what a desk hits to decide whether
// a signal is real and what it is worth, and it powers the inline AI suggestions.
interface ComputeBody {
  series?: number[];
  latest?: number;
  degrade_direction?: 'down' | 'up';
  fault_flags?: boolean[];
  peer_latest?: number[];
  symptom?: SymptomVector;
  failure_threshold?: number;
  performance_ratio?: number;
  measured_kw?: number;
  expected_kw?: number;
  lost_kwh_per_day?: number;
  tariff_zar_per_mwh?: number;
  emergency_repair_zar?: number;
  planned_repair_zar?: number;
}

app.post('/compute', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const b = (await c.req.json().catch(() => ({}))) as ComputeBody;
  const series = Array.isArray(b.series) ? b.series.filter((x) => typeof x === 'number') : [];
  const dir = b.degrade_direction === 'up' ? 'up' : 'down';
  const latest = typeof b.latest === 'number' ? b.latest : (series.length ? series[series.length - 1] : 0);

  const anomaly = detectAnomalyEnsemble({
    series,
    latest,
    degradeDirection: dir,
    faultFlags: Array.isArray(b.fault_flags) ? b.fault_flags : undefined,
    peerLatest: Array.isArray(b.peer_latest) ? b.peer_latest : undefined,
  });

  const trend = degradationTrend(series, dir);

  const failureThreshold = typeof b.failure_threshold === 'number' ? b.failure_threshold : (dir === 'down' ? 0.6 : 100);
  const rul = remainingUsefulLife(latest, trend.slopePerDay, failureThreshold, trend.rSquared, dir);

  const ranking = b.symptom ? classifyFailureMode(b.symptom) : [];
  const top = ranking[0] ?? null;

  const pr = typeof b.performance_ratio === 'number'
    ? b.performance_ratio
    : (typeof b.measured_kw === 'number' && typeof b.expected_kw === 'number' && b.expected_kw > 0
      ? Math.max(0, b.measured_kw / b.expected_kw)
      : undefined);

  const revenue = revenueAtRiskZar(
    b.lost_kwh_per_day ?? 0,
    b.tariff_zar_per_mwh ?? 0,
    rul.rulDays,
  );

  const ledger = savingsLedger({
    revenueAtRiskZar: revenue,
    emergencyRepairZar: b.emergency_repair_zar ?? 0,
    plannedRepairZar: b.planned_repair_zar ?? 0,
    rulDays: rul.rulDays,
  });

  const safety = top?.safety ?? false;
  const tier = prognosticTier(revenue, safety);
  const health = healthScore({
    performanceRatio: pr,
    anomalyScore: anomaly.score,
    faultModeConfidence: top?.confidence,
    rulDays: rul.rulDays,
  });

  return c.json({
    success: true,
    data: {
      anomaly,
      degradation: trend,
      rul,
      performance_ratio: pr ?? null,
      fault_ranking: ranking,
      top_fault: top,
      safety_implicated: safety,
      revenue_at_risk_zar: revenue,
      savings: ledger,
      recommended_tier: tier,
      health_score: health,
      is_reportable: isReportable(tier, safety),
    },
  });
});

app.get('/', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const tier        = c.req.query('tier');
  const technology  = c.req.query('technology');
  const site_id     = c.req.query('site_id');
  const status      = c.req.query('status');
  const breached    = c.req.query('breached');
  const reportable  = c.req.query('reportable');

  let sql = 'SELECT * FROM oe_asset_prognostics WHERE 1=1';
  const binds: unknown[] = [];
  if (tier)       { sql += ' AND tier = ?';        binds.push(tier); }
  if (technology) { sql += ' AND technology = ?';  binds.push(technology); }
  if (site_id)    { sql += ' AND site_id = ?';     binds.push(site_id); }
  if (status)     { sql += ' AND status = ?';      binds.push(status); }
  sql += ' ORDER BY datetime(detected_at) DESC LIMIT 500';

  const rs = await c.env.DB.prepare(sql).bind(...binds).all<PrognosticRow>();
  const now = new Date();
  let items = (rs.results || []).map((r) => decorate(r, now));
  if (breached === 'true')   items = items.filter((r) => r.sla_breached_now || r.sla_breached);
  if (reportable === 'true') items = items.filter((r) => r.is_reportable);

  const by_status: Record<string, number> = {};
  const by_tier: Record<string, number> = {};
  const by_technology: Record<string, number> = {};
  const by_prediction_type: Record<string, number> = {};
  for (const i of items) {
    by_status[i.status] = (by_status[i.status] || 0) + 1;
    by_tier[i.tier] = (by_tier[i.tier] || 0) + 1;
    if (i.technology) by_technology[i.technology] = (by_technology[i.technology] || 0) + 1;
    if (i.prediction_type) by_prediction_type[i.prediction_type] = (by_prediction_type[i.prediction_type] || 0) + 1;
  }

  const open = items.filter((i) => !i.is_terminal);
  const open_count          = open.length;
  const monitoring_count    = items.filter((i) => i.status === 'monitoring').length;
  const escalated_count     = items.filter((i) => i.status === 'escalated').length;
  const confirmed_failures  = items.filter((i) => i.status === 'confirmed_failure').length;
  const resolved_count      = items.filter((i) => i.status === 'resolved').length;
  const dismissed_count     = items.filter((i) => i.status === 'dismissed' || i.status === 'auto_suppressed').length;
  const breached_count      = open.filter((i) => i.sla_breached_now || i.sla_breached).length;
  const reportable_total    = items.filter((i) => i.is_reportable).length;
  const safety_open         = open.filter((i) => i.safety_implicated).length;
  const high_open           = open.filter((i) => i.tier === 'major' || i.tier === 'critical').length;

  const total_revenue_at_risk_zar    = items.reduce((s, i) => s + (i.revenue_at_risk_zar || 0), 0);
  const total_savings_zar            = items.reduce((s, i) => s + (i.savings_zar || 0), 0);
  const total_incremental_vs_benchmark_zar = items.reduce((s, i) => s + (i.incremental_vs_benchmark_zar || 0), 0);
  const total_benchmark_savings_zar  = items.reduce((s, i) => s + (i.benchmark_savings_zar || 0), 0);
  const avg_health_score = items.length
    ? Math.round(items.reduce((s, i) => s + (i.health_score || 0), 0) / items.length)
    : 100;

  return c.json({
    success: true,
    data: {
      items,
      total: items.length,
      by_status,
      by_tier,
      by_technology,
      by_prediction_type,
      open_count,
      monitoring_count,
      escalated_count,
      confirmed_failures,
      resolved_count,
      dismissed_count,
      breached: breached_count,
      reportable_total,
      safety_open,
      high_open,
      total_revenue_at_risk_zar,
      total_savings_zar,
      total_incremental_vs_benchmark_zar,
      total_benchmark_savings_zar,
      avg_health_score,
    },
  });
});

app.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!user || !READ_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const row = await c.env.DB.prepare('SELECT * FROM oe_asset_prognostics WHERE id = ?').bind(id).first<PrognosticRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const ev = await c.env.DB.prepare(
    'SELECT * FROM oe_asset_prognostics_events WHERE prognostic_id = ? ORDER BY datetime(created_at) ASC',
  ).bind(id).all<PrognosticEventRow>();

  return c.json({
    success: true,
    data: {
      prognostic: decorate(row, new Date()),
      events: ev.results || [],
    },
  });
});

interface TransitionBody {
  notes?: string;
  revenue_at_risk_zar?: number;
  safety_implicated?: boolean;
  fault_mode?: string;
  fault_mode_confidence?: number;
  predicted_failure_at?: string;
  work_order_id?: string;
  assigned_to?: string;
  resolution_summary?: string;
}

async function transition(
  c: Context<HonoEnv>,
  action: PrognosticAction,
  bodyHandler?: (row: PrognosticRow, body: Record<string, unknown>) => Partial<PrognosticRow>,
) {
  const user = getCurrentUser(c);
  if (!user || !WRITE_ROLES.has(user.role)) {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  const id = c.req.param('id')!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const notes = typeof body.notes === 'string' ? body.notes : null;

  const row = await c.env.DB.prepare('SELECT * FROM oe_asset_prognostics WHERE id = ?').bind(id).first<PrognosticRow>();
  if (!row) return c.json({ success: false, error: 'Not found' }, 404);

  const to = nextStatus(row.status, action);
  if (!to) {
    return c.json({
      success: false,
      error: `Invalid transition: ${row.status} → ${action}`,
    }, 422);
  }

  const overrides = bodyHandler ? bodyHandler(row, body) : {};

  // Re-derive tier whenever a transition restates the revenue-at-risk or the
  // safety implication (diagnosis often sharpens both).
  const effectiveRevenue = (overrides.revenue_at_risk_zar ?? row.revenue_at_risk_zar) ?? 0;
  const effectiveSafety = (overrides.safety_implicated ?? row.safety_implicated) ? true : false;
  let effectiveTier: PrognosticTier = row.tier;
  if (overrides.revenue_at_risk_zar != null || overrides.safety_implicated != null) {
    effectiveTier = prognosticTier(effectiveRevenue, effectiveSafety);
    overrides.tier = effectiveTier;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const sla = slaDeadlineFor(to, effectiveTier, now);
  const slaIso = sla ? sla.toISOString() : null;

  const crosses = crossesIntoRegulator(action, effectiveTier, effectiveSafety);
  if (crosses || isReportable(effectiveTier, effectiveSafety)) overrides.is_reportable = 1;
  if (action === 'record_failure') overrides.health_score = 0;

  const setClauses: string[] = ['status = ?', 'status_entered_at = ?', 'updated_at = ?', 'sla_deadline = ?'];
  const setBinds: unknown[] = [to, nowIso, nowIso, slaIso];
  for (const [k, v] of Object.entries(overrides)) {
    setClauses.push(`${k} = ?`);
    setBinds.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  setBinds.push(id);

  await c.env.DB.prepare(
    `UPDATE oe_asset_prognostics SET ${setClauses.join(', ')} WHERE id = ?`,
  ).bind(...setBinds).run();

  const evtId = `aprog_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  await c.env.DB.prepare(
    'INSERT INTO oe_asset_prognostics_events (id, prognostic_id, event_type, actor_id, actor_party, from_status, to_status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    evtId,
    id,
    eventTypeFor(action),
    user.id,
    user.role,
    row.status,
    to,
    notes,
    nowIso,
  ).run();

  const eventName = eventTypeFor(action) as Parameters<typeof fireCascade>[0]['event'];
  await fireCascade({
    event: eventName,
    actor_id: user.id,
    entity_type: 'asset_prognostic',
    entity_id: id,
    data: {
      ...row,
      ...overrides,
      tier: effectiveTier,
      status: to,
      from_status: row.status,
      action,
      safety_implicated: effectiveSafety,
      crosses_into_regulator: crosses,
    },
    env: c.env,
  });

  const refreshed = await c.env.DB.prepare('SELECT * FROM oe_asset_prognostics WHERE id = ?').bind(id).first<PrognosticRow>();
  return c.json({ success: true, data: { prognostic: refreshed ? decorate(refreshed, now) : null } });
}

function applyCommon(body: Record<string, unknown>, out: Partial<PrognosticRow>): Partial<PrognosticRow> {
  const b = body as Partial<TransitionBody>;
  if (typeof b.revenue_at_risk_zar === 'number')   out.revenue_at_risk_zar = b.revenue_at_risk_zar;
  if (typeof b.safety_implicated === 'boolean')    out.safety_implicated = b.safety_implicated ? 1 : 0;
  if (typeof b.fault_mode === 'string')            out.fault_mode = b.fault_mode;
  if (typeof b.fault_mode_confidence === 'number') out.fault_mode_confidence = b.fault_mode_confidence;
  if (typeof b.predicted_failure_at === 'string')  out.predicted_failure_at = b.predicted_failure_at;
  if (typeof b.assigned_to === 'string')           out.assigned_to = b.assigned_to;
  return out;
}

app.post('/:id/triage-prediction', async (c) => transition(c, 'triage_prediction', (_row, body) =>
  applyCommon(body, {})));

app.post('/:id/dismiss-prediction', async (c) => transition(c, 'dismiss_prediction', (_row, body) => {
  const out: Partial<PrognosticRow> = {};
  const b = body as Partial<TransitionBody>;
  if (typeof b.resolution_summary === 'string') out.notes = b.resolution_summary;
  return out;
}));

app.post('/:id/auto-suppress', async (c) => transition(c, 'auto_suppress', (_row, body) => {
  const out: Partial<PrognosticRow> = {};
  const b = body as Partial<TransitionBody>;
  if (typeof b.resolution_summary === 'string') out.notes = b.resolution_summary;
  return out;
}));

app.post('/:id/diagnose-root-cause', async (c) => transition(c, 'diagnose_root_cause', (_row, body) =>
  applyCommon(body, {})));

app.post('/:id/plan-action', async (c) => transition(c, 'plan_action', (_row, body) =>
  applyCommon(body, {})));

app.post('/:id/raise-work-order', async (c) => transition(c, 'raise_work_order', (_row, body) => {
  const out: Partial<PrognosticRow> = {};
  const b = body as Partial<TransitionBody>;
  if (typeof b.work_order_id === 'string') out.work_order_id = b.work_order_id;
  if (typeof b.assigned_to === 'string')   out.assigned_to = b.assigned_to;
  return out;
}));

app.post('/:id/begin-monitoring', async (c) => transition(c, 'begin_monitoring'));

app.post('/:id/confirm-resolved', async (c) => transition(c, 'confirm_resolved', (_row, body) => {
  const out: Partial<PrognosticRow> = {};
  const b = body as Partial<TransitionBody>;
  if (typeof b.resolution_summary === 'string') out.notes = b.resolution_summary;
  return out;
}));

app.post('/:id/escalate-prognostic', async (c) => transition(c, 'escalate_prognostic', (_row, body) =>
  applyCommon(body, {})));

app.post('/:id/record-failure', async (c) => transition(c, 'record_failure', (_row, body) =>
  applyCommon(body, {})));

app.post('/:id/expire-prognostic', async (c) => transition(c, 'expire_prognostic'));

app.post('/:id/reopen-recurrence', async (c) => transition(c, 'reopen_recurrence', (row, body) => {
  const out: Partial<PrognosticRow> = { recurrence_count: (row.recurrence_count || 0) + 1 };
  return applyCommon(body, out);
}));

// SLA sweep: flag any non-terminal prognostic past its deadline, escalate the
// recurrence/breach counter, and cross to the regulator for the high tiers.
export async function assetPrognosticsSlaSweep(env: HonoEnv['Bindings']): Promise<{ scanned: number; breached: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  const rs = await env.DB.prepare(
    `SELECT * FROM oe_asset_prognostics
     WHERE status NOT IN ('resolved','dismissed','auto_suppressed','expired','confirmed_failure')
       AND sla_deadline IS NOT NULL
       AND datetime(sla_deadline) < datetime(?)
       AND sla_breached = 0`,
  ).bind(nowIso).all<PrognosticRow>();

  const rows = rs.results || [];
  let breached = 0;
  for (const row of rows) {
    await env.DB.prepare(
      'UPDATE oe_asset_prognostics SET sla_breached = 1, updated_at = ? WHERE id = ?',
    ).bind(nowIso, row.id).run();

    const evtId = `aprog_evt_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    await env.DB.prepare(
      'INSERT INTO oe_asset_prognostics_events (id, prognostic_id, event_type, actor_id, actor_party, from_status, to_status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      evtId,
      row.id,
      'asset_prognostic.sla_breached',
      'system',
      'system',
      row.status,
      row.status,
      `Auto-breach: ${row.status} past SLA (tier ${row.tier})`,
      nowIso,
    ).run();

    if (slaBreachCrossesIntoRegulator(row.tier)) {
      await env.DB.prepare('UPDATE oe_asset_prognostics SET is_reportable = 1 WHERE id = ?').bind(row.id).run();
      await fireCascade({
        event: 'asset_prognostic.sla_breached',
        actor_id: 'system',
        entity_type: 'asset_prognostic',
        entity_id: row.id,
        data: { ...row, crosses_into_regulator: true },
        env,
      });
    }

    breached++;
  }

  return { scanned: rows.length, breached };
}

export default app;
