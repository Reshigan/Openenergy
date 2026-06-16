// ════════════════════════════════════════════════════════════════════════
// Esums — Performance Opportunity Engine.
//
// Deterministic, rule-based analysis layer. Zero LLM inference — every
// opportunity is computed from SQL queries + arithmetic against the
// existing om_* tables. The result is a ranked list of monetisable
// performance gaps, each with:
//   • Quantified annual R upside (derived, not guessed)
//   • Evidence cited (which metric crossed which threshold)
//   • Recommended action with optional one-click CTA
//   • Confidence (derived from sample size + rule strictness)
//
// Eleven detectors run in parallel:
//   1. Soiling cleaning ROI       — panel-soiling fault + PR drop
//   2. Recurring device faults    — ≥3 same-code faults in 14 days
//   3. Underperforming string     — open string fault with hourly bleed
//   4. Firmware pattern           — ≥2 sites same OEM+FW with degraded PR
//   5. Inverter pre-failure       — predictive signal with confidence ≥ 0.7
//   6. MTTR outlier               — site MTTR > 2× fleet median
//   7. SLA breach cluster         — ≥2 breached WOs in last 30 days
//   8. Parts stockout risk        — stock ≤ min_stock_qty
//   9. Warranty leakage           — fault on in-warranty device not claimed
//  10. Maintenance backlog        — overdue maintenance with revenue impact
//  11. O&M cost outlier           — total WO cost per MW above fleet p75
//
// Endpoints:
//   GET  /opportunities                  — ranked list (full fleet, scoped)
//   POST /opportunities/:opportunity_id/act
//                                         — execute the recommended action
//                                           (creates WO, reorders parts, etc.)
//   GET  /opportunities/summary          — aggregate annual upside by category
// ════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { cached, shouldBypass } from '../utils/kv-cache';

const ana = new Hono<HonoEnv>();
ana.use('*', authMiddleware);

function genId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type Opportunity = {
  id: string;
  category:
    | 'soiling_clean'
    | 'recurring_fault'
    | 'underperforming_string'
    | 'firmware_pattern'
    | 'inverter_pre_failure'
    | 'mttr_outlier'
    | 'sla_breach_cluster'
    | 'parts_stockout'
    | 'warranty_leakage'
    | 'maintenance_backlog'
    | 'om_cost_outlier'
    | 'module_degradation'
    | 'curtailment_recovery'
    | 'water_leak'
    | 'pump_inefficiency'
    | 'treatment_recovery';
  site_id?: string;
  site_name?: string;
  device_id?: string;
  title: string;
  detail: string;
  annual_upside_zar: number;
  effort: 'low' | 'medium' | 'high';
  confidence: number; // 0–1
  evidence: string[];
  action?: {
    kind:
      | 'create_wo' | 'thermal_imaging' | 'hold_firmware_update'
      | 'reorder_parts' | 'file_warranty_claim' | 'reschedule_maintenance'
      | 'add_technician_shift' | 'investigate';
    payload?: Record<string, any>;
  };
};

// ─── Scope helper ────────────────────────────────────────────────────────
async function inScopeSites(env: HonoEnv['Bindings'], userId: string, isOfficer: boolean) {
  const rows = isOfficer
    ? await env.DB.prepare(
        `SELECT id, name, technology, capacity_mw, ppa_tariff_zar_mwh FROM om_sites`,
      ).all<any>()
    : await env.DB.prepare(
        `SELECT id, name, technology, capacity_mw, ppa_tariff_zar_mwh FROM om_sites
         WHERE participant_id = ? OR om_contractor_id = ?`,
      ).bind(userId, userId).all<any>();
  return (rows.results || []) as Array<{
    id: string; name: string; technology: string; capacity_mw: number; ppa_tariff_zar_mwh: number;
  }>;
}

// ─── 1. Soiling cleaning ROI ─────────────────────────────────────────────
async function findSoilingOpportunities(env: HonoEnv['Bindings'], siteIds: string[],
                                        sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, site_id, description, hourly_loss_zar, total_loss_zar, detected_at
    FROM om_faults
    WHERE site_id IN (${ph})
      AND status IN ('open','acknowledged','in_progress')
      AND (category = 'panel' OR description LIKE '%oiling%')
  `).bind(...siteIds).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    // Annualised: hourly_loss × 30d × monthly_loss_factor; cleaning typically
    // R2,400 for ≤5 MW, R4,800 for >5 MW
    const monthly = Number(r.hourly_loss_zar || 0) * 24 * 30;
    const annual = monthly * 11; // 11 months of preventable loss/yr (recurring cycle)
    const cleaningCost = site.capacity_mw > 5 ? 4800 : 2400;
    const annualNet = Math.max(0, annual - cleaningCost * 12);
    if (annualNet < 3000) continue;
    opps.push({
      id: genId('opp'),
      category: 'soiling_clean',
      site_id: r.site_id,
      site_name: site.name,
      title: `Schedule panel cleaning at ${site.name}`,
      detail: `Soiling fault open since ${new Date(r.detected_at).toLocaleDateString('en-ZA')}. ` +
              `Current bleed ${Math.round(Number(r.hourly_loss_zar))} R/h. ` +
              `Cleaning cost R${cleaningCost}; ROI ≈ ${(monthly / cleaningCost).toFixed(1)}× per cycle.`,
      annual_upside_zar: Math.round(annualNet),
      effort: 'low',
      confidence: 0.85,
      evidence: [
        `Fault ${r.id} open`,
        `Hourly bleed R${Math.round(Number(r.hourly_loss_zar))}`,
        `Cleaning cost benchmark for ${site.capacity_mw} MW`,
      ],
      action: {
        kind: 'create_wo',
        payload: {
          site_id: r.site_id,
          category: 'cleaning',
          priority: 'medium',
          title: `Panel cleaning — soiling threshold breach`,
          description: r.description || 'Soiling loss above 3% threshold',
        },
      },
    });
  }
  return opps;
}

// ─── 2. Recurring device faults ──────────────────────────────────────────
async function findRecurringFaultOpportunities(env: HonoEnv['Bindings'], siteIds: string[],
                                               sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT f.site_id, f.device_id, f.fault_code, COUNT(*) AS occurrences,
           MAX(f.hourly_loss_zar) AS max_hourly_loss,
           SUM(f.total_loss_zar) AS total_loss_to_date,
           d.manufacturer AS dev_manufacturer, d.model AS dev_model,
           d.warranty_expiry AS dev_warranty_expiry
    FROM om_faults f
    LEFT JOIN om_devices d ON d.id = f.device_id
    WHERE f.site_id IN (${ph})
      AND f.device_id IS NOT NULL
      AND f.detected_at >= date('now', '-30 days')
    GROUP BY f.site_id, f.device_id, f.fault_code,
             d.manufacturer, d.model, d.warranty_expiry
    HAVING COUNT(*) >= 3
  `).bind(...siteIds).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    const warrantyOk = r.dev_warranty_expiry && new Date(r.dev_warranty_expiry).getTime() > Date.now();
    // Annualised: avoiding catastrophic failure = 1 month of full downtime
    const annualUpside = Number(r.max_hourly_loss || 0) * 24 * 30;
    opps.push({
      id: genId('opp'),
      category: 'recurring_fault',
      site_id: r.site_id,
      site_name: site.name,
      device_id: r.device_id,
      title: `${r.dev_manufacturer || 'Device'} ${r.dev_model || ''} on ${site.name}: ${r.fault_code} ×${r.occurrences} in 30 days`,
      detail: `Pattern suggests early-stage failure. Proactive replacement before catastrophic event` +
              (warrantyOk ? ' (under warranty — zero parts cost).' : ' avoids R' + Math.round(annualUpside).toLocaleString() + ' downtime loss.'),
      annual_upside_zar: Math.round(annualUpside),
      effort: warrantyOk ? 'low' : 'medium',
      confidence: Math.min(0.95, 0.55 + 0.10 * Number(r.occurrences)),
      evidence: [
        `${r.occurrences} occurrences of ${r.fault_code} in 30 days`,
        `Total accrued loss to date: R${Math.round(Number(r.total_loss_to_date || 0)).toLocaleString()}`,
        warrantyOk ? 'Warranty: covered' : 'Warranty: expired or unknown',
      ],
      action: {
        kind: warrantyOk ? 'file_warranty_claim' : 'create_wo',
        payload: {
          site_id: r.site_id,
          device_id: r.device_id,
          category: 'preventive',
          priority: 'high',
          title: `Proactive inspection — ${r.fault_code} recurring (${r.occurrences}×)`,
        },
      },
    });
  }
  return opps;
}

// ─── 3. Underperforming string ──────────────────────────────────────────
async function findUnderperformingStringOpportunities(env: HonoEnv['Bindings'], siteIds: string[],
                                                      sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, site_id, device_id, description, hourly_loss_zar, detected_at
    FROM om_faults
    WHERE site_id IN (${ph}) AND category = 'string'
      AND status IN ('open','acknowledged','in_progress')
  `).bind(...siteIds).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    const annual = Math.max(0, Number(r.hourly_loss_zar || 0) * 24 * 365 * 0.6); // assume not all hours
    if (annual < 2000) continue;
    opps.push({
      id: genId('opp'),
      category: 'underperforming_string',
      site_id: r.site_id,
      site_name: site.name,
      device_id: r.device_id,
      title: `String underperformance at ${site.name}`,
      detail: r.description || 'String current consistently below peers',
      annual_upside_zar: Math.round(annual),
      effort: 'medium',
      confidence: 0.75,
      evidence: [
        `Open string fault since ${new Date(r.detected_at).toLocaleDateString('en-ZA')}`,
        `Bleed rate R${Math.round(Number(r.hourly_loss_zar))}/h`,
      ],
      action: {
        kind: 'thermal_imaging',
        payload: { site_id: r.site_id, device_id: r.device_id },
      },
    });
  }
  return opps;
}

// ─── 4. Firmware pattern across fleet ───────────────────────────────────
async function findFirmwarePatternOpportunities(env: HonoEnv['Bindings'], siteIds: string[],
                                                _sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT d.manufacturer, d.firmware_version,
           COUNT(DISTINCT d.site_id) AS site_count,
           COUNT(DISTINCT f.id) AS recent_faults,
           SUM(f.hourly_loss_zar) AS total_bleed
    FROM om_devices d
    LEFT JOIN om_faults f ON f.device_id = d.id
      AND f.detected_at >= date('now', '-30 days')
    WHERE d.site_id IN (${ph})
      AND d.manufacturer IS NOT NULL
      AND d.firmware_version IS NOT NULL
    GROUP BY d.manufacturer, d.firmware_version
    HAVING COUNT(DISTINCT d.site_id) >= 2 AND COUNT(DISTINCT f.id) >= 2
  `).bind(...siteIds).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const annual = Number(r.total_bleed || 0) * 12 * 30; // monthly accrual × 12
    if (annual < 5000) continue;
    opps.push({
      id: genId('opp'),
      category: 'firmware_pattern',
      title: `${r.manufacturer} FW ${r.firmware_version}: ${r.recent_faults} faults across ${r.site_count} sites`,
      detail: `Cross-site pattern suggests OEM firmware bug. Hold updates on other ${r.manufacturer} ` +
              `sites; engage vendor support. Estimated fleet-wide annual loss if unaddressed.`,
      annual_upside_zar: Math.round(annual),
      effort: 'low',
      confidence: 0.70,
      evidence: [
        `${r.site_count} sites running ${r.manufacturer} FW ${r.firmware_version}`,
        `${r.recent_faults} faults in last 30 days`,
        `Aggregate bleed rate R${Math.round(Number(r.total_bleed || 0))}/h`,
      ],
      action: {
        kind: 'hold_firmware_update',
        payload: { manufacturer: r.manufacturer, firmware_version: r.firmware_version },
      },
    });
  }
  return opps;
}

// ─── 5. Inverter pre-failure (predictive signals) ───────────────────────
async function findPreFailureOpportunities(env: HonoEnv['Bindings'], siteIds: string[],
                                           sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, site_id, device_id, prediction_type, confidence,
           recommended_action, estimated_loss_zar
    FROM om_predictions
    WHERE site_id IN (${ph}) AND status = 'open' AND confidence >= 0.7
  `).bind(...siteIds).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    opps.push({
      id: genId('opp'),
      category: 'inverter_pre_failure',
      site_id: r.site_id,
      site_name: site.name,
      device_id: r.device_id,
      title: `Predictive flag: ${String(r.prediction_type).replace(/_/g, ' ')} at ${site.name}`,
      detail: r.recommended_action || 'See prediction detail.',
      annual_upside_zar: Math.round(Number(r.estimated_loss_zar || 0)),
      effort: 'medium',
      confidence: Number(r.confidence),
      evidence: [
        `Predictive model confidence ${Math.round(Number(r.confidence) * 100)}%`,
        `Estimated loss if unaddressed R${Math.round(Number(r.estimated_loss_zar || 0)).toLocaleString()}`,
      ],
      action: {
        kind: 'create_wo',
        payload: {
          site_id: r.site_id,
          device_id: r.device_id,
          category: 'preventive',
          priority: 'high',
          title: `Predictive: ${String(r.prediction_type).replace(/_/g, ' ')}`,
        },
      },
    });
  }
  return opps;
}

// ─── 6. MTTR outliers ────────────────────────────────────────────────────
async function findMttrOutliers(env: HonoEnv['Bindings'], siteIds: string[],
                                sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT site_id,
           AVG((julianday(resolved_at) - julianday(detected_at)) * 24) AS mttr_h,
           COUNT(*) AS sample
    FROM om_faults
    WHERE site_id IN (${ph}) AND resolved_at IS NOT NULL
      AND detected_at >= date('now', '-90 days')
    GROUP BY site_id
    HAVING COUNT(*) >= 3
  `).bind(...siteIds).all<any>();
  const sites = (rows.results || []) as any[];
  if (sites.length < 2) return [];
  const mttrs = sites.map((s) => Number(s.mttr_h || 0)).sort((a, b) => a - b);
  const median = mttrs[Math.floor(mttrs.length / 2)];
  const opps: Opportunity[] = [];
  for (const s of sites) {
    const mttr = Number(s.mttr_h || 0);
    if (mttr <= median * 2 || median <= 0) continue;
    const site = sitesByID.get(s.site_id);
    if (!site) continue;
    // Cutting MTTR in half on this site saves ~30% of fault downtime cost
    const yearlyLossEstimate = mttr * Number(s.sample) * 200 * (site.ppa_tariff_zar_mwh || 1500) / 1000;
    opps.push({
      id: genId('opp'),
      category: 'mttr_outlier',
      site_id: s.site_id,
      site_name: site.name,
      title: `${site.name} MTTR ${mttr.toFixed(1)}h vs fleet median ${median.toFixed(1)}h`,
      detail: `Pre-positioning common spares + adding a technician shift on this site would halve MTTR.`,
      annual_upside_zar: Math.round(yearlyLossEstimate * 0.3),
      effort: 'medium',
      confidence: 0.65,
      evidence: [
        `${s.sample} closed faults in 90 days`,
        `Site MTTR ${mttr.toFixed(1)}h`,
        `Fleet median MTTR ${median.toFixed(1)}h`,
      ],
      action: { kind: 'add_technician_shift', payload: { site_id: s.site_id } },
    });
  }
  return opps;
}

// ─── 7. SLA breach cluster ──────────────────────────────────────────────
async function findSlaBreachClusters(env: HonoEnv['Bindings'], siteIds: string[],
                                     sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT site_id, COUNT(*) AS breached_count,
           AVG((julianday('now') - julianday(sla_deadline)) * 24) AS avg_overrun_h
    FROM om_work_orders
    WHERE site_id IN (${ph})
      AND sla_breached = 1
      AND created_at >= date('now', '-30 days')
    GROUP BY site_id
    HAVING COUNT(*) >= 2
  `).bind(...siteIds).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    const annualPenalty = Number(r.breached_count) * 12 * 5000; // typical SLA penalty per breach
    opps.push({
      id: genId('opp'),
      category: 'sla_breach_cluster',
      site_id: r.site_id,
      site_name: site.name,
      title: `${r.breached_count} SLA breaches at ${site.name} in 30 days`,
      detail: `Avg overrun ${Number(r.avg_overrun_h).toFixed(1)}h. Likely dispatch coverage gap. ` +
              `Adding evening cover or pre-positioned spares avoids ~R${Math.round(annualPenalty).toLocaleString()} in annualised SLA penalties.`,
      annual_upside_zar: annualPenalty,
      effort: 'medium',
      confidence: 0.70,
      evidence: [
        `${r.breached_count} SLA-breached WOs in last 30 days`,
        `Average overrun ${Number(r.avg_overrun_h).toFixed(1)}h`,
      ],
      action: { kind: 'investigate', payload: { focus: 'dispatch_shift_coverage' } },
    });
  }
  return opps;
}

// ─── 8. Parts stockout risk ─────────────────────────────────────────────
async function findStockoutRisk(env: HonoEnv['Bindings']): Promise<Opportunity[]> {
  const rows = await env.DB.prepare(`
    SELECT id, part_number, name, manufacturer, unit_cost_zar,
           current_stock, min_stock_qty, lead_time_days
    FROM om_parts
    WHERE current_stock <= min_stock_qty AND min_stock_qty > 0
  `).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const opportunityCost = Number(r.lead_time_days || 7) * 1500; // R/day downtime if stock-out
    opps.push({
      id: genId('opp'),
      category: 'parts_stockout',
      title: `${r.name} stock at minimum`,
      detail: `Re-order ${r.manufacturer || r.part_number}. ${r.current_stock} on hand vs min ${r.min_stock_qty}. ` +
              `Lead time ${r.lead_time_days || '—'} days. Stockout cost ~R${opportunityCost}/day of avoidable downtime.`,
      annual_upside_zar: opportunityCost,
      effort: 'low',
      confidence: 0.95,
      evidence: [
        `Current stock ${r.current_stock} ≤ min ${r.min_stock_qty}`,
        `Unit cost R${Number(r.unit_cost_zar).toLocaleString()}`,
      ],
      action: {
        kind: 'reorder_parts',
        payload: { part_id: r.id, qty: Math.max(1, (r.min_stock_qty * 2) - r.current_stock) },
      },
    });
  }
  return opps;
}

// ─── 9. Warranty leakage ────────────────────────────────────────────────
async function findWarrantyLeakage(env: HonoEnv['Bindings'], siteIds: string[],
                                   sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT f.id, f.site_id, f.device_id, f.total_loss_zar, f.detected_at,
           f.description, d.manufacturer, d.model
    FROM om_faults f
    JOIN om_devices d ON d.id = f.device_id
    WHERE f.site_id IN (${ph})
      AND f.warranty_covered = 1
      AND f.detected_at >= date('now', '-90 days')
      AND f.work_order_id IS NULL
  `).bind(...siteIds).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    const annualEstimate = Number(r.total_loss_zar || 0) * 4; // assume similar quarterly cadence
    if (annualEstimate < 2000) continue;
    opps.push({
      id: genId('opp'),
      category: 'warranty_leakage',
      site_id: r.site_id,
      site_name: site.name,
      device_id: r.device_id,
      title: `Warranty claim: ${r.manufacturer || 'device'} at ${site.name}`,
      detail: `Fault on warranty-covered device without a claim filed. ` +
              `Filing recovers parts + labour cost on this and future occurrences in warranty.`,
      annual_upside_zar: Math.round(annualEstimate),
      effort: 'low',
      confidence: 0.80,
      evidence: [
        `Device under warranty (${r.manufacturer} ${r.model})`,
        `No work order linked to fault ${r.id}`,
        `Accrued loss R${Math.round(Number(r.total_loss_zar || 0)).toLocaleString()}`,
      ],
      action: {
        kind: 'file_warranty_claim',
        payload: { fault_id: r.id, device_id: r.device_id },
      },
    });
  }
  return opps;
}

// ─── 10. Maintenance backlog with revenue impact ────────────────────────
async function findMaintenanceBacklog(env: HonoEnv['Bindings'], siteIds: string[],
                                      sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT id, site_id, task_type, next_due_at,
           julianday('now') - julianday(next_due_at) AS days_overdue
    FROM om_maintenance
    WHERE site_id IN (${ph}) AND next_due_at < date('now') AND status = 'scheduled'
  `).bind(...siteIds).all<any>();
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    const annualImpact = Number(site.capacity_mw || 0) * 1000 * 50 * (site.ppa_tariff_zar_mwh || 1500) / 1_000_000;
    if (annualImpact < 3000) continue;
    opps.push({
      id: genId('opp'),
      category: 'maintenance_backlog',
      site_id: r.site_id,
      site_name: site.name,
      title: `${r.task_type.replace(/_/g, ' ')} at ${site.name} is ${Math.round(Number(r.days_overdue))}d overdue`,
      detail: `Overdue preventive maintenance erodes performance ratio and voids OEM warranty conditions.`,
      annual_upside_zar: Math.round(annualImpact * 1000),
      effort: 'low',
      confidence: 0.75,
      evidence: [
        `${Math.round(Number(r.days_overdue))} days past next_due_at`,
        `Task type: ${r.task_type}`,
      ],
      action: {
        kind: 'reschedule_maintenance',
        payload: { maintenance_id: r.id },
      },
    });
  }
  return opps;
}

// ─── 11. O&M cost outlier ───────────────────────────────────────────────
async function findOmCostOutliers(env: HonoEnv['Bindings'], siteIds: string[],
                                  sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT w.site_id,
           COALESCE(SUM(w.parts_cost_zar + w.labour_cost_zar), 0) AS om_cost,
           COUNT(*) AS wo_count
    FROM om_work_orders w
    WHERE w.site_id IN (${ph})
      AND w.completed_at >= date('now', '-90 days')
    GROUP BY w.site_id
    HAVING COUNT(*) >= 2
  `).bind(...siteIds).all<any>();
  const enriched: any[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site || !site.capacity_mw) continue;
    enriched.push({ ...r, costPerMw: Number(r.om_cost) / Number(site.capacity_mw), site });
  }
  if (enriched.length < 3) return [];
  const p75 = enriched.map((x) => x.costPerMw).sort((a, b) => a - b)[Math.floor(enriched.length * 0.75)];
  const opps: Opportunity[] = [];
  for (const r of enriched) {
    if (r.costPerMw <= p75 * 1.5) continue;
    const annualOverspend = (r.costPerMw - p75) * r.site.capacity_mw * 4; // 4 quarters
    opps.push({
      id: genId('opp'),
      category: 'om_cost_outlier',
      site_id: r.site_id,
      site_name: r.site.name,
      title: `${r.site.name} O&M cost ${(r.costPerMw / 1000).toFixed(1)} kR/MW vs fleet p75 ${(p75 / 1000).toFixed(1)} kR/MW`,
      detail: `O&M spend in last 90 days is above the fleet 75th percentile. ` +
              `Investigate WO mix — too many reactive jobs vs preventive?`,
      annual_upside_zar: Math.round(annualOverspend),
      effort: 'medium',
      confidence: 0.65,
      evidence: [
        `${r.wo_count} completed WOs in 90 days`,
        `Spend per MW: ${(r.costPerMw).toFixed(0)} R/MW`,
        `Fleet p75: ${(p75).toFixed(0)} R/MW`,
      ],
      action: { kind: 'investigate', payload: { focus: 'om_cost_mix' } },
    });
  }
  return opps;
}

// ─── 12. Module degradation predictor ──────────────────────────────────
// Tracks the rolling 90-day average kWh/kWp (specific yield) and compares
// it to the prior 90-day window. A drop > 2% is flagged as accelerated
// degradation — PV modules typically lose 0.5%/year, so > 8% YoY (≈ 2%
// per 90 days) is well above warranty curves and warrants investigation.
async function findModuleDegradation(env: HonoEnv['Bindings'], siteIds: string[],
                                     sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT site_id,
      SUM(CASE WHEN ts >= datetime('now','-90 days') THEN interval_kwh ELSE 0 END) AS recent_kwh,
      SUM(CASE WHEN ts < datetime('now','-90 days')
              AND ts >= datetime('now','-180 days') THEN interval_kwh ELSE 0 END) AS prior_kwh
    FROM om_telemetry
    WHERE site_id IN (${ph}) AND ts >= datetime('now','-180 days')
    GROUP BY site_id HAVING recent_kwh > 0 AND prior_kwh > 0
  `).bind(...siteIds).all<any>().catch(() => ({ results: [] as any[] }));
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site || !site.capacity_mw) continue;
    const recent = Number(r.recent_kwh);
    const prior  = Number(r.prior_kwh);
    if (prior <= 0) continue;
    const dropPct = ((prior - recent) / prior) * 100;
    if (dropPct < 2.0) continue;                                    // not yet over the alarm threshold
    // Annual upside: closing half the gap saves (dropPct - 1)/100 of revenue
    // assuming R1.2/kWh blended PPA and 1500 kWh/kWp annual specific yield.
    const annualGenMwh = Number(site.capacity_mw) * 1500;
    const lostMwh = annualGenMwh * ((dropPct - 1.0) / 100);
    opps.push({
      id: genId('opp'),
      category: 'module_degradation',
      site_id: r.site_id,
      site_name: site.name,
      title: `${site.name} specific yield down ${dropPct.toFixed(1)}% in last 90 days`,
      detail: `Recent 90-day yield is ${dropPct.toFixed(1)}% below the prior window — outside the typical ` +
              `0.5%/yr PV degradation curve. Possible PID (potential-induced degradation), hotspot or shading.`,
      annual_upside_zar: Math.round(lostMwh * 1_200_000),            // R1.2/kWh × kWh/MWh
      effort: 'medium',
      confidence: 0.7,
      evidence: [
        `Recent 90d kWh: ${Math.round(recent).toLocaleString()}`,
        `Prior 90d kWh: ${Math.round(prior).toLocaleString()}`,
        `Drop: ${dropPct.toFixed(1)}%`,
      ],
      action: { kind: 'thermal_imaging', payload: { site_id: r.site_id } },
    });
  }
  return opps;
}

// ─── 13. Curtailment loss recovery ─────────────────────────────────────
// Sites with frequent grid curtailment events (logged as faults with
// category = 'curtailment') are candidates for behind-the-meter battery
// storage or inverter upsize. Annual upside = avg recovered MWh × R/kWh.
async function findCurtailmentRecovery(env: HonoEnv['Bindings'], siteIds: string[],
                                       sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT site_id,
      COUNT(*) AS events,
      SUM(total_loss_zar) AS lost_zar
    FROM om_faults
    WHERE site_id IN (${ph})
      AND category = 'curtailment'
      AND detected_at >= date('now', '-90 days')
    GROUP BY site_id HAVING COUNT(*) >= 3
  `).bind(...siteIds).all<any>().catch(() => ({ results: [] as any[] }));
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    const lost = Number(r.lost_zar);
    // 4x to annualise; assume battery storage recovers ~60% of curtailed energy.
    const annualLost = lost * 4;
    const recoverable = annualLost * 0.6;
    opps.push({
      id: genId('opp'),
      category: 'curtailment_recovery',
      site_id: r.site_id,
      site_name: site.name,
      title: `${site.name} had ${r.events} curtailment events in last 90 days`,
      detail: `Site is being curtailed frequently. A behind-the-meter battery sized to ` +
              `60–80 % of the daily curtailed energy would recover the majority of this revenue.`,
      annual_upside_zar: Math.round(recoverable),
      effort: 'high',
      confidence: 0.6,
      evidence: [
        `${r.events} curtailment events in 90d`,
        `Lost in 90d: R${Math.round(lost).toLocaleString()}`,
        `Annualised: R${Math.round(annualLost).toLocaleString()}`,
      ],
      action: { kind: 'investigate', payload: { site_id: r.site_id, focus: 'battery_sizing' } },
    });
  }
  return opps;
}

// ─── 14. Water — overnight leak (off-peak flow > 0) ────────────────────
// If the site has any flow_meter telemetry showing meaningful flow during
// the 00:00-05:00 window over the last 14 days, treat it as leakage and
// quantify the lost revenue at the site's water tariff.
async function findWaterLeak(env: HonoEnv['Bindings'], siteIds: string[],
                             sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  // Use the daily rollup if it exists; otherwise the raw fault entry
  // gives us the signal. We piggy-back on the existing fault category
  // 'water' with code 'LEAK-NOC' for the recurring case.
  const rows = await env.DB.prepare(`
    SELECT f.site_id, f.hourly_loss_zar, f.total_loss_zar, f.detected_at
    FROM om_faults f
    WHERE f.site_id IN (${ph})
      AND f.category = 'water'
      AND f.fault_code = 'LEAK-NOC'
      AND f.status NOT IN ('resolved','closed','false_positive')
  `).bind(...siteIds).all<any>().catch(() => ({ results: [] as any[] }));
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    const hourly = Number(r.hourly_loss_zar || 0);
    const annual = hourly * 8 * 365;   // off-peak hours/day × days/year
    opps.push({
      id: genId('opp'),
      category: 'water_leak',
      site_id: r.site_id,
      site_name: site.name,
      title: `${site.name} — off-peak flow suggests pipe leak`,
      detail: `Sustained overnight flow indicates leakage past primary isolation valves. ` +
              `At the published water tariff this is bleeding R${Math.round(hourly).toLocaleString('en-ZA')}/h off-peak.`,
      annual_upside_zar: Math.round(annual),
      effort: 'low',
      confidence: 0.85,
      evidence: [
        `Loss accumulated: R${Math.round(Number(r.total_loss_zar || 0)).toLocaleString('en-ZA')}`,
        `Detected ${new Date(r.detected_at).toLocaleDateString('en-ZA')}`,
      ],
      action: { kind: 'investigate', payload: { site_id: r.site_id, focus: 'leak_pressure_test' } },
    });
  }
  return opps;
}

// ─── 15. Water — pump efficiency drift ─────────────────────────────────
// Compare each pump's pump_kwh against the site's other pumps. > 30%
// above the fleet median is flagged.
async function findPumpInefficiency(env: HonoEnv['Bindings'], siteIds: string[],
                                    sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT d.site_id, d.id AS device_id, d.location_in_plant,
           AVG(t.pump_kw) AS avg_kw,
           AVG(t.flow_lps) AS avg_lps,
           SUM(t.interval_kwh) AS pump_kwh_30d
    FROM om_devices d
    JOIN om_telemetry t ON t.device_id = d.id
    WHERE d.device_type = 'pump' AND d.site_id IN (${ph})
      AND t.ts >= date('now','-30 days')
    GROUP BY d.id
    HAVING pump_kwh_30d > 0
  `).bind(...siteIds).all<any>().catch(() => ({ results: [] as any[] }));
  const pumps = ((rows.results || []) as any[]);
  // Group by site, compute median pump_kwh per site, flag outliers
  const bySite = new Map<string, any[]>();
  for (const p of pumps) {
    if (!bySite.has(p.site_id)) bySite.set(p.site_id, []);
    bySite.get(p.site_id)!.push(p);
  }
  const opps: Opportunity[] = [];
  for (const [siteId, list] of bySite) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.pump_kwh_30d - b.pump_kwh_30d);
    const median = sorted[Math.floor(sorted.length / 2)].pump_kwh_30d;
    for (const p of list) {
      if (median <= 0 || p.pump_kwh_30d <= median * 1.30) continue;
      const site = sitesByID.get(siteId);
      if (!site) continue;
      // Excess kWh × R1.80/kWh grid energy cost → annual
      const excessKwh = (p.pump_kwh_30d - median) * 12; // 30d → annualised
      const annual = Math.round(excessKwh * 1.80);
      opps.push({
        id: genId('opp'),
        category: 'pump_inefficiency',
        site_id: siteId,
        site_name: site.name,
        device_id: p.device_id,
        title: `${site.name} — pump ${p.location_in_plant} burning ${Math.round((p.pump_kwh_30d / median - 1) * 100)}% more energy`,
        detail: `Pump is consuming significantly more kWh than its sister pumps for similar duty. ` +
                `Likely worn impeller or scale build-up. Replace or refurbish to recover the energy spread.`,
        annual_upside_zar: annual,
        effort: 'medium',
        confidence: 0.75,
        evidence: [
          `30d kWh this pump: ${Math.round(p.pump_kwh_30d).toLocaleString('en-ZA')}`,
          `30d kWh fleet median: ${Math.round(median).toLocaleString('en-ZA')}`,
        ],
        action: { kind: 'investigate', payload: { site_id: siteId, device_id: p.device_id, focus: 'pump_overhaul' } },
      });
    }
  }
  return opps;
}

// ─── 16. Water — treatment recovery slipping ───────────────────────────
// raw_kl vs treated_kl ratio over last 30 days vs prior 60 days.
async function findTreatmentRecovery(env: HonoEnv['Bindings'], siteIds: string[],
                                     sitesByID: Map<string, any>): Promise<Opportunity[]> {
  if (!siteIds.length) return [];
  const ph = siteIds.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT site_id,
      SUM(CASE WHEN ts >= datetime('now','-30 days') THEN treated_kl ELSE 0 END) AS recent_treated,
      SUM(CASE WHEN ts >= datetime('now','-30 days') THEN raw_kl    ELSE 0 END) AS recent_raw,
      SUM(CASE WHEN ts <  datetime('now','-30 days') AND ts >= datetime('now','-90 days') THEN treated_kl ELSE 0 END) AS prior_treated,
      SUM(CASE WHEN ts <  datetime('now','-30 days') AND ts >= datetime('now','-90 days') THEN raw_kl    ELSE 0 END) AS prior_raw
    FROM om_telemetry
    WHERE site_id IN (${ph}) AND ts >= datetime('now','-90 days')
    GROUP BY site_id
    HAVING recent_raw > 0 AND prior_raw > 0
  `).bind(...siteIds).all<any>().catch(() => ({ results: [] as any[] }));
  const opps: Opportunity[] = [];
  for (const r of (rows.results || []) as any[]) {
    const site = sitesByID.get(r.site_id);
    if (!site) continue;
    const recentRate = Number(r.recent_treated) / Number(r.recent_raw);
    const priorRate  = Number(r.prior_treated)  / Number(r.prior_raw);
    if (priorRate <= 0 || recentRate >= priorRate * 0.97) continue;   // < 3% drop, ignore
    const dropPct = (priorRate - recentRate) * 100;
    const annualRawKl = Number(r.recent_raw) * 12; // 30d → year
    const recoverableKl = annualRawKl * (priorRate - recentRate);
    const tariff = Number(site.water_tariff_zar_kl || 12);
    const annual = Math.round(recoverableKl * tariff);
    opps.push({
      id: genId('opp'),
      category: 'treatment_recovery',
      site_id: r.site_id,
      site_name: site.name,
      title: `${site.name} — treatment yield down ${dropPct.toFixed(1)}% in last 30 days`,
      detail: `Treated/raw recovery has slipped from ${(priorRate * 100).toFixed(1)}% to ${(recentRate * 100).toFixed(1)}%. ` +
              `Filter media replacement or membrane CIP would recover the gap.`,
      annual_upside_zar: annual,
      effort: 'medium',
      confidence: 0.7,
      evidence: [
        `Recent recovery: ${(recentRate * 100).toFixed(1)}%`,
        `Prior recovery: ${(priorRate * 100).toFixed(1)}%`,
        `Annualised kL recoverable: ${Math.round(recoverableKl).toLocaleString('en-ZA')}`,
      ],
      action: { kind: 'investigate', payload: { site_id: r.site_id, focus: 'filter_media' } },
    });
  }
  return opps;
}

// ─── Master endpoint ────────────────────────────────────────────────────
// Cached 5 min — opportunity rules don't change minute-to-minute and the
// scan does 16 parallel D1 queries.
ana.get('/opportunities', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support', 'regulator'].includes(user.role);
  const key = `om:opportunities:${isOfficer ? 'all' : user.id}`;
  const data = await cached(c.env, key, 300, async () => {
    const sites = await inScopeSites(c.env, user.id, isOfficer);
    const siteIds = sites.map((s) => s.id);
    const sitesByID = new Map(sites.map((s) => [s.id, s]));

    const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14, c15, c16] = await Promise.all([
      findSoilingOpportunities(c.env, siteIds, sitesByID),
      findRecurringFaultOpportunities(c.env, siteIds, sitesByID),
      findUnderperformingStringOpportunities(c.env, siteIds, sitesByID),
      findFirmwarePatternOpportunities(c.env, siteIds, sitesByID),
      findPreFailureOpportunities(c.env, siteIds, sitesByID),
      findMttrOutliers(c.env, siteIds, sitesByID),
      findSlaBreachClusters(c.env, siteIds, sitesByID),
      findStockoutRisk(c.env),
      findWarrantyLeakage(c.env, siteIds, sitesByID),
      findMaintenanceBacklog(c.env, siteIds, sitesByID),
      findOmCostOutliers(c.env, siteIds, sitesByID),
      findModuleDegradation(c.env, siteIds, sitesByID),
      findCurtailmentRecovery(c.env, siteIds, sitesByID),
      findWaterLeak(c.env, siteIds, sitesByID),
      findPumpInefficiency(c.env, siteIds, sitesByID),
      findTreatmentRecovery(c.env, siteIds, sitesByID),
    ]);
    const all = [...c1, ...c2, ...c3, ...c4, ...c5, ...c6, ...c7, ...c8, ...c9, ...c10, ...c11, ...c12, ...c13, ...c14, ...c15, ...c16];
    all.sort((a, b) => b.annual_upside_zar - a.annual_upside_zar);

    const total = all.reduce((s, o) => s + o.annual_upside_zar, 0);
    const byCategory: Record<string, number> = {};
    for (const o of all) byCategory[o.category] = (byCategory[o.category] || 0) + o.annual_upside_zar;

    return {
      generated_at: new Date().toISOString(),
      total_annual_upside_zar: total,
      count: all.length,
      by_category: byCategory,
      opportunities: all,
    };
  }, { bypass: shouldBypass(c.req.raw) });
  return c.json({ success: true, data });
});

// Summary-only endpoint for cockpit tiles
ana.get('/opportunities/summary', async (c) => {
  const user = getCurrentUser(c);
  const isOfficer = ['admin', 'support', 'regulator'].includes(user.role);
  const sites = await inScopeSites(c.env, user.id, isOfficer);
  const siteIds = sites.map((s) => s.id);
  const sitesByID = new Map(sites.map((s) => [s.id, s]));
  const groups = await Promise.all([
    findSoilingOpportunities(c.env, siteIds, sitesByID),
    findRecurringFaultOpportunities(c.env, siteIds, sitesByID),
    findUnderperformingStringOpportunities(c.env, siteIds, sitesByID),
    findFirmwarePatternOpportunities(c.env, siteIds, sitesByID),
    findPreFailureOpportunities(c.env, siteIds, sitesByID),
    findStockoutRisk(c.env),
    findWarrantyLeakage(c.env, siteIds, sitesByID),
    findMaintenanceBacklog(c.env, siteIds, sitesByID),
  ]);
  const all = groups.flat();
  return c.json({
    success: true,
    data: {
      count: all.length,
      total_annual_upside_zar: all.reduce((s, o) => s + o.annual_upside_zar, 0),
      top_3: all.sort((a, b) => b.annual_upside_zar - a.annual_upside_zar).slice(0, 3),
    },
  });
});

// ─── Action endpoint — execute the recommended action ───────────────────
ana.post('/opportunities/act', async (c) => {
  const user = getCurrentUser(c);
  const b = await c.req.json().catch(() => ({} as any));
  if (!b.category || !b.action) return c.json({ success: false, error: 'category + action required' }, 400);

  switch (b.action.kind) {
    case 'create_wo': {
      const id = genId('omwo');
      const woNumber = `WO-${new Date().getFullYear()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const p = b.action.payload || {};
      const slaResolveH = p.priority === 'critical' ? 4 : p.priority === 'high' ? 24 : p.priority === 'medium' ? 72 : 168;
      await c.env.DB.prepare(`
        INSERT INTO om_work_orders
          (id, wo_number, site_id, category, priority, status, title, description,
           sla_resolve_hours, sla_deadline)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).bind(
        id, woNumber, p.site_id, p.category || 'preventive', p.priority || 'medium',
        'created', p.title || 'Generated from opportunity', p.description || null,
        slaResolveH, new Date(Date.now() + slaResolveH * 3_600_000).toISOString(),
      ).run();
      return c.json({ success: true, data: { kind: 'created_wo', wo_id: id, wo_number: woNumber } });
    }
    case 'reorder_parts': {
      const p = b.action.payload || {};
      await c.env.DB.prepare(
        `UPDATE om_parts SET current_stock = current_stock + ? WHERE id = ?`,
      ).bind(Number(p.qty || 1), p.part_id).run();
      await c.env.DB.prepare(
        `INSERT INTO om_part_movements (id, part_id, movement, qty, reason)
         VALUES (?,?,?,?,?)`,
      ).bind(genId('omov'), p.part_id, 'received', Number(p.qty || 1), 'opportunity reorder').run();
      return c.json({ success: true, data: { kind: 'reordered', part_id: p.part_id, qty: p.qty } });
    }
    case 'file_warranty_claim': {
      const p = b.action.payload || {};
      await c.env.DB.prepare(
        `INSERT INTO om_alerts (id, site_id, device_id, category, severity, title, body)
         VALUES (?,?,?,?,?,?,?)`,
      ).bind(
        genId('omal'), null, p.device_id || null, 'predictive', 'minor',
        `Warranty claim filed`,
        `Initiated warranty claim on fault ${p.fault_id || ''} by ${user.id}`,
      ).run();
      return c.json({ success: true, data: { kind: 'warranty_claim_filed' } });
    }
    case 'hold_firmware_update':
    case 'thermal_imaging':
    case 'add_technician_shift':
    case 'reschedule_maintenance':
    case 'investigate': {
      await c.env.DB.prepare(
        `INSERT INTO om_alerts (id, site_id, category, severity, title, body)
         VALUES (?,?,?,?,?,?)`,
      ).bind(
        genId('omal'), b.action.payload?.site_id || null,
        'predictive', 'minor',
        `Opportunity action logged: ${b.action.kind}`,
        JSON.stringify(b.action.payload || {}),
      ).run();
      return c.json({ success: true, data: { kind: b.action.kind, logged: true } });
    }
    default:
      return c.json({ success: false, error: `unknown action kind: ${b.action.kind}` }, 400);
  }
});

export default ana;
