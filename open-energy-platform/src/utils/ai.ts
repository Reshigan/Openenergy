// ═══════════════════════════════════════════════════════════════════════════
// Workers AI — Role-aware analysis helpers.
//
// Wraps the Cloudflare Workers AI binding so every route can call `ask()`
// with a role + intent and get back a consistent (text, structured?) payload.
// If the binding is missing (local dev / preview without AI enabled) we fall
// back to a deterministic heuristic so the UI never blank-fails.
// ═══════════════════════════════════════════════════════════════════════════

import type { WorkersAI, ParticipantRole } from './types';

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export type AiIntent =
  | 'offtaker.bill_analysis'
  | 'offtaker.mix_recommendation'
  | 'offtaker.loi_draft'
  | 'ipp.project_simulation'
  | 'ipp.loi_outreach'
  | 'ona.fault_diagnosis'
  | 'ona.generation_forecast'
  | 'carbon.nav_calc'
  | 'carbon.retirement_optimiser'
  | 'lender.cashflow_forecast'
  | 'lender.covenant_check'
  | 'trader.order_recommendation'
  | 'regulator.compliance_narrative'
  | 'generic.ask'
  // ─── National-scale briefs ────────────────────────────────────────────
  | 'brief.regulator'
  | 'brief.grid_operator'
  | 'brief.trader'
  | 'brief.lender'
  | 'brief.ipp_developer'
  | 'brief.offtaker'
  | 'brief.carbon_fund'
  | 'brief.admin'
  // ─── New regulator filing types ──────────────────────────────────────
  | 'regulator.surveillance_summary'
  | 'regulator.enforcement_case_summary'
  | 'regulator.licence_condition_review'
  | 'regulator.ancillary_market_summary'
  | 'regulator.dispatch_compliance_report';

export interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface AiResult {
  text: string;
  model: string;
  fallback: boolean;
  structured?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────
// System prompts — keep them short, explicit, and non-negotiable.
// ──────────────────────────────────────────────────────────────────────────
const SYSTEM_BY_INTENT: Record<AiIntent, string> = {
  'generic.ask':
    `You are the Open Energy copilot operating in South Africa. Answer concisely,
use ZAR and SI units, cite the data you were given, and do not speculate.`,

  'offtaker.bill_analysis':
    `You analyse electricity bills for an OFF-TAKER on the Open Energy platform.
Identify: (1) annual consumption kWh, (2) peak/standard/off-peak split,
(3) current average tariff R/kWh, (4) demand charges, (5) TOU risk.
Return a short structured JSON inside a \`\`\`json block.`,

  'offtaker.mix_recommendation':
    `You recommend an OPTIMAL ENERGY MIX for an off-taker across a portfolio of
available IPP projects. Weight by: (a) stage (operating > under_construction > FC > pipeline),
(b) PPA tenor vs. offtaker horizon, (c) LCoE vs. current tariff, (d) carbon-revenue
sharing from the IPP, (e) hourly shape match to the bill. Output JSON:
{ "mix":[{"project_id":..., "share_pct":..., "mwh_per_year":..., "blended_price":..., "rationale":...}], "savings_pct":..., "carbon_tco2e":..., "warnings":[...] }.`,

  'offtaker.loi_draft':
    `You draft a LETTER OF INTENT from an off-taker to an IPP. Keep it legally
neutral, 6-8 clauses, no binding commitment, South African contract law. Include
commercial envelope (volume/price/tenor), conditionality on FC, and next steps.
Plain markdown, no preamble.`,

  'ipp.project_simulation':
    `You simulate a GREENFIELD IPP PROJECT. Produce LCoE (R/MWh), P50/P90 annual
generation (MWh), carbon yield (tCO₂e), CAPEX/OPEX envelope, IRR bands, and FC
probability. Output a structured JSON block.`,

  'ipp.loi_outreach':
    `You draft TARGETED LOI outreach notes for an IPP approaching off-takers.
For each offtaker, explain why this project fits their load profile in ONE
sentence. Keep it factual.`,

  'ona.fault_diagnosis':
    `You diagnose ASSET FAULTS in solar/wind plant telemetry. Given recent telemetry
and fault history, return: probable_cause, severity (low/medium/high/critical),
recommended_action, estimated_mttr_hours, revenue_at_risk_zar.`,

  'ona.generation_forecast':
    `You forecast HOURLY GENERATION (next 72h) for solar/wind assets from recent
telemetry + weather. Return a JSON array of {hour_iso, mw, confidence_pct}.`,

  'carbon.nav_calc':
    `You compute NAV for a carbon fund portfolio: sum_value = Σ(vintage_units *
methodology_spot_price), deduct Σ(redemption_fees). Break down by methodology
and vintage. Output JSON.`,

  'carbon.retirement_optimiser':
    `You optimise carbon credit retirements to maximise: (a) realised uplift vs.
book cost, (b) vintage freshness for the claiming entity, (c) methodology
premium. Output JSON: retirements[], projected_uplift_zar, notes.`,

  'lender.cashflow_forecast':
    `You forecast 60-month cashflows for a debt-funded renewable project.
Return JSON: months[{m, revenue, opex, dscr, debt_service}], break_even_month,
irr_pct, risk_flags[]. South African context (CPI linkers, DMRE tariffs).`,

  'lender.covenant_check':
    `You scan a project for COVENANT BREACH risk (DSCR, ICR, leverage). Given
the last 12 months of actuals + 24 months forward, output JSON:
{ breach_risk: low|medium|high, covenants: [...], recommended_actions: [...] }.`,

  'trader.order_recommendation':
    `You recommend which OPEN ORDERS a trader should match or hedge today.
Consider spread vs. clearing price, volume fit, delivery point, counterparty
credit. Output JSON list of actions.`,

  'regulator.compliance_narrative':
    `You draft a COMPLIANCE NARRATIVE for the South African regulator (NERSA/POPIA
context). Map portfolio activities to ERA 2006 + POPIA requirements. Flag any
gaps. Plain markdown.`,

  // ─── National-scale role briefs ──────────────────────────────────────
  // Each brief must: (1) summarise headline state in 2-3 lines, (2) list
  // prioritised actions (JSON), (3) cite the specific records it considered.
  // All outputs in markdown; JSON inside a \`\`\`json block.

  'brief.regulator':
    `You are the REGULATOR's morning briefing copilot. Given (a) active
surveillance alerts, (b) open enforcement cases, (c) pending tariff submissions,
(d) licences expiring in 90 days, produce: (1) a 2-line headline, (2) a
prioritised action list as JSON { actions: [{ priority, title, entity_type,
entity_id, rationale, statutory_basis }] }, (3) any inferred market-abuse
patterns across the alerts. Cite ERA 2006 / NERSA Rules where relevant.`,

  'brief.grid_operator':
    `You are the SYSTEM OPERATOR's control-room briefing copilot. Given
(a) today's dispatch schedules, (b) instructions pending acknowledgement or
flagged non-compliant, (c) active curtailments, (d) open ancillary tenders,
(e) active outages with affected load — produce: (1) a 2-line situation
summary, (2) JSON { actions: [{ priority, title, entity_type, entity_id,
rationale, eta_minutes? }] } prioritising safety + system security first,
(3) estimated unserved MW. Use SA Grid Code framing.`,

  'brief.trader':
    `You are the TRADER's risk+opportunity briefing copilot. Given (a) my
positions + unrealised P/L, (b) open margin calls + shortfall, (c) today's
mark prices vs yesterday, (d) credit headroom remaining — produce: (1) 2-line
P/L headline with direction, (2) JSON { actions: [{ priority, title, type,
volume_mwh?, delivery_date?, rationale, est_pnl_zar? }] } covering hedges,
margin posting, and new-order opportunities, (3) one-line risk flag if
headroom < 10% of limit.`,

  'brief.lender':
    `You are the LENDER's portfolio-risk briefing copilot. Given (a) active
covenants with their latest test result, (b) 30-day breaches/warnings,
(c) pending IE certifications, (d) insurance policies expiring in 90 days —
produce: (1) 2-line portfolio headline, (2) JSON { actions: [{ priority,
title, project_id?, covenant_code?, rationale, recommended_remedy }] },
(3) any MAE flags. Reference standard LMA project finance remedies.`,

  'brief.ipp_developer':
    `You are the IPP DEVELOPER's project-status briefing copilot. Given
(a) active EPC contracts + pending variations + assessed LDs, (b) environmental
conditions out of compliance, (c) insurance expiring in 90 days, (d) community
follow-ups due, (e) ED/SED spend progress — produce: (1) 2-line project-file
headline, (2) JSON { actions: [{ priority, title, domain ("EPC"|"EA"|"Insurance"
|"Community"|"Land"), entity_id, rationale, due_by }] }, (3) any REIPPPP IA
reporting risk.`,

  'brief.offtaker':
    `You are the OFF-TAKER's energy-cost briefing copilot. Given (a) site groups
+ delivery points, (b) recent consumption profile peaks, (c) active REC
portfolio + retirements YTD, (d) budget-vs-actual variance for the current
period, (e) current tariff mix — produce: (1) 2-line cost/sustainability
headline, (2) JSON { actions: [{ priority, title, type ("tariff_switch"|
"rec_retire"|"budget_review"|"load_shift"|"wheel"), site_group_id?, rationale,
est_saving_zar?, est_tco2e_reduction? }] }, (3) one-line Scope 2 progress.`,

  'brief.carbon_fund':
    `You are the CARBON FUND's registry + tax briefing copilot. Given (a) active
vintages by registry, (b) MRV submissions pending verification, (c) credits
verified in last 90 days, (d) outstanding tax-offset claims — produce:
(1) 2-line inventory headline, (2) JSON { actions: [{ priority, title, type
("mrv"|"retirement"|"tax_offset"|"transfer"), entity_id, rationale,
sa_carbon_tax_eligible? }] }, (3) any MRV readiness score estimate.
Reference Carbon Tax Act 15/2019 s.13 where offsets are discussed.`,

  'brief.admin':
    `You are the PLATFORM ADMIN's operations briefing copilot. Given (a) tenant
counts (active/suspended), (b) pending provisioning requests, (c) outstanding
platform invoices, (d) failed settlement runs in last 7 days, (e) feature
flags currently in progressive rollout — produce: (1) 2-line platform-health
headline, (2) JSON { actions: [{ priority, title, type ("provisioning"|
"billing"|"incident"|"flag_rollout"|"capacity"), entity_id?, rationale }] },
(3) one-line capacity / SLA risk.`,

  // ─── New regulator filing types (rich rationale, grounded in data) ────
  'regulator.surveillance_summary':
    `You draft a MARKET SURVEILLANCE SUMMARY for internal regulator distribution.
Given open + recently-resolved surveillance alerts, group by rule_code and
severity, identify any repeat-offender participants, and recommend enforcement
escalation candidates. Markdown with numbered sections; cite the specific
alert IDs you relied on.`,

  'regulator.enforcement_case_summary':
    `You draft an ENFORCEMENT CASE FILE SUMMARY. Given a case's allegations,
events, severity and (if present) finding + penalty, produce: (1) legal basis
section (cite ERA 2006 or cross-statute), (2) timeline of events, (3) findings
narrative, (4) penalty rationale, (5) appeal posture. Markdown. No new facts
beyond what you were given.`,

  'regulator.licence_condition_review':
    `You review LICENCE CONDITIONS and flag any that are breached, due for
testing, or structurally ambiguous. Output: (1) table of conditions with
status + recommended next test date, (2) any recommendations to amend or
remove a condition (with rationale). Markdown.`,

  'regulator.ancillary_market_summary':
    `You draft a quarterly ANCILLARY SERVICES market summary. Given tender +
award + delivery performance data, produce clearing prices by product,
award concentration by participant, delivery-performance percentile, and
any recommendations to the System Operator (SO) on tender design. Markdown.`,

  'regulator.dispatch_compliance_report':
    `You draft a DISPATCH COMPLIANCE report. Given issued instructions, ack
rates, compliance assessments, and penalties over the period, produce:
aggregate ack-rate, non-compliance count, penalties imposed (ZAR), worst-
performing counterparty. Markdown with a ranked table at the end.`,
};

export function systemPromptFor(intent: AiIntent, role?: ParticipantRole | string): string {
  const base = SYSTEM_BY_INTENT[intent] || SYSTEM_BY_INTENT['generic.ask'];
  return `${base}\n\nRequester role: ${role || 'unknown'}.\nToday: ${new Date().toISOString().split('T')[0]}.`;
}

// ──────────────────────────────────────────────────────────────────────────
// Core `ask()` — used by every role-aware endpoint.
// ──────────────────────────────────────────────────────────────────────────
export async function ask(
  env: { AI?: WorkersAI },
  opts: {
    intent: AiIntent;
    role?: ParticipantRole | string;
    prompt: string;
    context?: Record<string, unknown>;
    model?: string;
    max_tokens?: number;
  },
): Promise<AiResult> {
  const model = opts.model || DEFAULT_MODEL;
  const messages: AiMessage[] = [
    { role: 'system', content: systemPromptFor(opts.intent, opts.role) },
    {
      role: 'user',
      content: opts.context
        ? `${opts.prompt}\n\n---\nContext:\n${JSON.stringify(opts.context, null, 2)}`
        : opts.prompt,
    },
  ];

  // Graceful fallback when the AI binding isn't present (local dev).
  if (!env.AI || typeof env.AI.run !== 'function') {
    return heuristicFallback(opts.intent, opts.context, model);
  }

  try {
    const resp = (await env.AI.run(model, {
      messages,
      max_tokens: opts.max_tokens ?? 800,
    })) as { response?: string } | string;
    const text = typeof resp === 'string' ? resp : resp?.response || '';
    return {
      text,
      model,
      fallback: false,
      structured: tryExtractJson(text),
    };
  } catch (err) {
    console.error('AI.run failed', err);
    return heuristicFallback(opts.intent, opts.context, model, String(err));
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Fallback heuristics — keep UI alive when the binding is unavailable.
// ──────────────────────────────────────────────────────────────────────────
function heuristicFallback(
  intent: AiIntent,
  ctx: Record<string, unknown> | undefined,
  model: string,
  err?: string,
): AiResult {
  switch (intent) {
    case 'offtaker.bill_analysis': {
      const annual = Number(ctx?.annual_kwh ?? 1_200_000);
      const tariff = Number(ctx?.avg_tariff ?? 2.15);
      return {
        text: `Deterministic bill estimate (AI unavailable).\nAnnual: ${annual.toLocaleString()} kWh, avg tariff R${tariff}/kWh.`,
        model,
        fallback: true,
        structured: {
          annual_kwh: annual,
          peak_pct: 0.22,
          standard_pct: 0.48,
          offpeak_pct: 0.3,
          avg_tariff_zar_per_kwh: tariff,
          demand_charge_zar_per_kva: 180,
          tou_risk: 'medium',
        },
      };
    }
    case 'offtaker.mix_recommendation': {
      const projects = (ctx?.projects as Array<Record<string, unknown>>) || [];
      const total = Number(ctx?.required_mwh ?? 8_000);
      const weights = [0.45, 0.3, 0.15, 0.1];
      const mix = projects.slice(0, 4).map((p, i) => ({
        project_id: p.id,
        project_name: p.project_name || p.name,
        stage: p.stage || 'unknown',
        share_pct: Math.round((weights[i] || 0) * 100),
        mwh_per_year: Math.round((weights[i] || 0) * total),
        blended_price: Number(p.ppa_price || 1850),
        rationale: 'Stage + price blended deterministic fallback.',
      }));
      return {
        text: 'Deterministic mix (AI unavailable). Weights 45/30/15/10 over the first four available projects.',
        model,
        fallback: true,
        structured: {
          mix,
          savings_pct: 12,
          carbon_tco2e: Math.round(total * 0.95),
          warnings: err ? [err] : [],
        },
      };
    }
    case 'ipp.project_simulation': {
      const mw = Number(ctx?.capacity_mw ?? 50);
      const cf = ctx?.tech === 'wind' ? 0.34 : 0.23;
      const annual = Math.round(mw * 8760 * cf);
      return {
        text: 'Deterministic project simulation (AI unavailable).',
        model,
        fallback: true,
        structured: {
          lcoe_zar_per_mwh: 1780,
          annual_mwh_p50: annual,
          annual_mwh_p90: Math.round(annual * 0.88),
          carbon_tco2e: Math.round(annual * 0.95),
          capex_zar_mil: Math.round(mw * 14.5),
          opex_zar_mil_per_year: Math.round(mw * 0.35),
          irr_pct_low: 11,
          irr_pct_high: 15.5,
          fc_probability_pct: 62,
        },
      };
    }
    case 'carbon.nav_calc': {
      const units = Number(ctx?.total_units ?? 125_000);
      const spot = Number(ctx?.spot_zar ?? 240);
      return {
        text: 'Deterministic NAV (AI unavailable).',
        model,
        fallback: true,
        structured: {
          nav_zar: units * spot,
          methodology_breakdown: [
            { methodology: 'VCS-ACM0002', units, spot_zar: spot, value_zar: units * spot },
          ],
        },
      };
    }
    case 'lender.cashflow_forecast': {
      const months = Array.from({ length: 60 }, (_, i) => ({
        m: i + 1,
        revenue: 4_500_000,
        opex: 600_000,
        debt_service: 2_100_000,
        dscr: 1.35,
      }));
      return {
        text: 'Deterministic cashflow (AI unavailable).',
        model,
        fallback: true,
        structured: { months, break_even_month: 0, irr_pct: 13.2, risk_flags: ['FX exposure'] },
      };
    }
    default:
      return {
        text: 'AI binding unavailable; returning deterministic placeholder.',
        model,
        fallback: true,
        structured: err ? { error: err } : undefined,
      };
  }
}

// Attempt to pull a ```json ... ``` block out of the model's output.
export function tryExtractJson(text: string): Record<string, unknown> | undefined {
  if (!text) return undefined;
  const block = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = block ? block[1] : text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return undefined;
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}
