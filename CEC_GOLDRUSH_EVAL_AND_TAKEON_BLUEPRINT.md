CEC / Open Energy Platform — Goldrush Live Evaluation + Unified Take-On Blueprint

All live figures below were re-verified directly against cec-energy-db (read-only) at evaluation time, not taken on trust from the source evals.

---

PART A — GOLDRUSH LIVE EVALUATION

Goldrush (p_live_goldrush, role=offtaker, kyc_status=approved, onboarding_completed=1) is a real C&I buyer with 10 GoNXT private-wire PPAs and a genuine Solax actuals pipeline. The pipeline itself is the strongest part of the demo — but three downstream surfaces fabricate delivery against it, and the one number a money-led buyer reads first (delivered %) is both wrong and lands on a blank page.

What is genuinely real (verified)

- Solax actuals are populated and authentic: 2,425 om_telemetry rows, MIN(ts)=2026-06-10, MAX(ts)=2026-06-23T05:00Z, SUM(interval_kwh)/1000 = **17.15 MWh** all-time across all 10 sites. Bell-curve shape, zero overnight, ragged per-site counts — not synthetic.
- The portfolio→generation hex seam resolves on live data: ppa_goldrush_<hex12> ↔ site_<hex12>, so the cockpit delivered-MWh join (cockpit.ts:484-491) returns the correct 17.15 MWh.
- Support tables are wired (no empty-lane gaps): off_ppa_portfolio=10, offtaker_delivery_points=10, oe_offtaker_ppa_obligations=10, scope2_disclosures=2.
- cockpit.ts offtakerStats delivered_mwh and carbon_tco2e (delivered×0.94) are correctly derived from the real telemetry.

Findings, ranked by severity (merged + deduped across both evals)

| # | Severity | Finding | Evidence (verified live) | File:line |
|---|---|---|---|---|
| 1 | **Critical** | Obligation chain delivered_mwh is fabricated at exactly 0.95×contracted, contradicting real telemetry by ~7.8× | oe_offtaker_ppa_obligations: 10 rows, status=pending, SUM(delivered_mwh)=**133.14** vs SUM(contracted_mwh)=140.16 (ratio 0.9499). Real fleet all-time = **17.15 MWh**. The "delivered" field is a placeholder, not the inverter sum. | recompute via cockpit.ts:484-491 seam |
| 2 | **Critical** | Annual recon signed_off on synthetic metered_mwh for a year (2025/26) with zero real delivery | oe_ppa_annual_recon: 10 rows, metered_mwh ≈ 0.98×contracted, variance_pct=-2, chain_status=signed_off, year_had_delivery=0. No telemetry exists before 2026-06-10, so 2025/26 metered_mwh is invented. | void or recompute to 0 |
| 3 | High | "Delivered vs contracted %" headline reads **27%** — looks like catastrophic under-delivery but is a 14-day-vs-annual / partial-fleet artifact | offtakerStats: delivered=17.15, delivered_days=14, contracted_yr=1681.8; expectedToDate=1681.8×14/365=64.5; 17.15/64.5=27%. Only 5 of 10 sites have data since 06-10 (rest since 06-16), so 14/365 over-states elapsed coverage. Directly contradicts the obligation chain's "95%". | cockpit.ts:480-504; HorizonKpis.tsx:41 |
| 4 | High | The 27% / Delivered-MWh tiles drill into a metering surface that shows Goldrush **nothing** | KPI points to /surface/offtaker:metering (HorizonKpis.tsx:41-42) → /metering/summary scopes by `AND ip.developer_id = ?` (metering.ts:132-146); an offtaker is never a developer_id → connections:[]. The scary number and its detail page do not share a data path. | metering.ts:132-146; MeteringSurface.tsx:37,95 |
| 5 | High | RECs are modeled annual yields, not derived from actuals; 2024+2025 vintages cover periods with no telemetry | rec_certificates owner=p_live_goldrush: 20 rows, mwh_represented = capacity_mw×1752 / ×2102 (round modeled figures). Feeds cockpit active_recs=20. No generation behind these RECs ever existed. | quarantine vintages; surface active_recs=0 |
| 6 | Medium | No provisioning manifest → Horizon shows no "what next" headline or profile recap | oe_onboarding_provisioning_log WHERE participant_id='p_live_goldrush' = **0 rows** (verified), yet onboarding_completed=1. GET /api/onboarding/state returns manifest:null; checklist.complete=true (10 portfolio rows pass both probes) so GettingStarted hides entirely. Returning Goldrush lands on Horizon with zero scaffolding. | onboarding.ts:88-126; GettingStarted.tsx:120 |
| 7 | Medium | expected_p50_gwh_yr drives every money/volume KPI off a modeled — not contracted — number | off_ppa_portfolio: expected_p50_gwh_yr = capacity_mw×1752h; ppa_annual_zar=R2,068,614, contracted_mwh_yr=1682 both derived from it; price_zar_per_mwh=1230 flat across all 10. No contracted column distinct from the p50 model. | cockpit.ts:480 |
| 8 | Medium | Offtaker checklist completes at "you have a PPA" — deepest L4 chains never surfaced as next-step | offtaker CHECKLIST has only 2 items (start_procurement, sign_ppa); both pass. Live: oe_ppa_payment_securities=1 (only 1 of 10 PPAs has credit support), curtailment_claims=0, ppa_terminations=0. No nudge toward payment-security coverage or REC retirement. | onboarding-checklist.ts:131-149 |
| 9 | Low | All 10 PPA contract-chain cases sit in_force with null SLA deadline → Horizon "contracts" lane is an inert wall | oe_ppa_contract_chain: all 10 'in_force'; sla_deadline_at null → bucket 'later', floor-ranked attentionScore → nothing in DUTY STREAM despite R2.07M/yr live. Board reads "nothing demands action". | horizon.ts:58; registry lines 2532-2534 |
| 10 | Low | Telemetry freshness/coverage not surfaced — half-onboarded fleet + 19h-stale feed silently depress delivered_pct | MAX(ts)=2026-06-23T05:00Z (19h stale at eval); 5 sites from 06-10, 5 from 06-16; per-site rows ragged 157-318. No "metered through <ts>" stamp or per-site coverage indicator. | — |
| 11 | Low | Annual PPA value (R2.07M) has no per-site delivered-vs-contracted drill-through | ppa_annual_zar is a single rolled SUM over 10 rows; portfolio surface never joins om_telemetry. Money-led framing wants R2.07M decomposed to 10 sites each tied to live delivered. | HorizonKpis.tsx:40,44 |

The actuals pipeline state (one paragraph)

The ingest leg is real and trustworthy (17.15 MWh, 10 sites, hourly Solax). Everything computed *off* it diverges: the cockpit delivered figure (correct) is contradicted by the obligation chain (133 MWh placeholder), the recon chain (206 MWh synthetic, signed_off), and the REC ledger (20 modeled certs for periods with no generation). So the platform simultaneously tells Goldrush "you got 17 MWh" (KPI), "you got 95%" (obligations), "you got 98%, signed off" (recon), and "27% — you are failing" (headline). For an actuals-only mandate this is the core integrity failure: one real number, three fabrications, and a fourth derived number that is technically real but framed to look catastrophic.

The 3 fixes that most improve the live demo

1. **Unify on one delivered series (closes #1, #2, #5).** Recompute oe_offtaker_ppa_obligations.delivered_mwh, oe_ppa_annual_recon.metered_mwh, and REC mwh_represented from the same om_telemetry seam cockpit already uses. Null/omit pre-2026-06-10 periods rather than inventing them; quarantine the 2024-2025 REC vintages and surface active_recs=0 until a full vintage of actuals exists.
2. **Fix the 27% headline + its drill-through together (closes #3, #4).** Caption the tile with its elapsed window ("27% of 14-day run-rate") or switch to absolute delivered MWh + a variance band gated to ≥1 full billing month; pro-rate per-site against each site's own first-telemetry date. Repoint /surface/offtaker:metering at the om_telemetry/portfolio-hex path so the number and its detail page share one source.
3. **Backfill the provisioning manifest + freshness stamp (closes #6, #10).** Write an idempotent oe_onboarding_provisioning_log row for Goldrush (or synthesize a manifest from off_ppa_portfolio when the log is empty) so a returning real participant gets a headline + next-actions + profile chips, and stamp "metered through <MAX(ts)>" with per-site coverage so the half-onboarded fleet is visible rather than silently authoritative.

---

PART B — UNIFIED PLATFORM TAKE-ON PROCESS

Across all five cluster designs the same diagnosis recurs and is **verified live**: every one of the 14 participants (10 demo + 4 p_live + admin) shows kyc_status='approved' while oe_kyc_verifications=0, oe_kyc_submissions=0, tenant_provisioning_requests=0, and goldrush provisioning_log=0. The take-on funnel has **never run end-to-end in production** — everyone was direct-inserted, and KYC is approved by fiat via the `UPDATE participants SET kyc_status='approved'` at onboarding-provisioning.ts:146 plus a hard skip of the built chains.

The platform already contains an L4/L5 take-on spine that is dormant, not missing: kyc-chain.ts (W198 audited FICA state machine + kycSlaSweep + regulator_inbox crossings), kyc-deep.ts (FICA tiers + PEP/sanctions/AML score), onboarding-kyc.ts (R2 doc upload), admin-platform.ts:111-208 (tenant request→approve→trial sub), subscription-billing-chain.ts (dunning). The unified process below wires these into one enforced gate rather than building parallel infrastructure.

The shared spine (one sentence per stage)
identity → KYC/FICA evidence → screening → adjudication (chain is the only writer of approved) → role-specific provisioning gated on 'verified' → data linkage → activation + first transaction.

Role-specific branches hang off Phase 5-6 only:

- **generation** (ipp_developer, esums_owner, +epc_contractor/esco which are NOT in the signup enum — verified validation.ts:41): grid-connection identity (grid_connection_applications + W28/W58), SCADA/inverter feed (oe_scada_connector W122, reuse EsumsDataSourcesStep), beneficial owners. Live proof: GoNXT has 10 commercial_operations projects but grid_connections=0, oe_scada_connector=0 — backfilled, never onboarded.
- **demand** (offtaker, trader): offtaker → meter_ingest_channels per om_site + Solax backfill (go-live gated on first daily reading) + W54 payment security; trader → W60 algo cert + oe_position_limits, pre-trade-guards gated on verified KYC. (Goldrush: 10 sites but meter_ingest_channels=0 — the same fabrication root as Part A.)
- **capital** (lender, carbon_fund): seed nothing until verified, then lender → W53 credit-facility entry point; carbon_fund → verified registry account before any carbon_projects insert. (Envera has 2 carbon_projects, one with credits_issued=2899, and no registry account.)
- **authority** (regulator, grid_operator): **CRITICAL — grid_operator is publicly self-registerable** (verified validation.ts:41 enum includes it; regulator correctly excluded). Provisioning-only via admin invite + four-eyes counter-approval + officer-delegation evidence (NERSA appointment / NTCSA SO mandate) + NEW oe_authority_scopes table (jurisdiction/control-area is captured at steps.tsx:870-912 but persisted nowhere — participants has no jurisdiction column).
- **operator** (admin, support): /auth/register must stop minting self-declared roleless-tenant accounts; route through tenant_provisioning_requests → admin approve → scoped invite (tenant_id + role pre-bound) → one kyc chain case per participant.

Where current onboarding already covers a phase vs L2/missing

| Phase | Current coverage | Gap |
|---|---|---|
| Identity / wizard | EXISTS — onboarding.ts /step, role step sequences, steps.tsx UI | L2: free-text, no server validation (CIPC YYYY/NNNNNN/NN, NERSA licence), no audit_events |
| KYC evidence upload | EXISTS — onboarding-kyc.ts /evidence + /submit (R2) | Not wired into wizard; KYC_DOC_TYPES missing UBO / officer-delegation / director_id |
| FICA screening + tiers | EXISTS — kyc-deep.ts /screening, /risk-score, /tiers | Only fires on manual admin action; no cascade on kyc.submitted; oe_kyc_screenings=0 live |
| Adjudication chain | EXISTS — kyc-chain.ts (SLA sweep, regulator_inbox) | Never instantiated at take-on; admin.ts:153 writes participants.kyc_status directly, bypassing it |
| Provisioning | EXISTS — onboarding-provisioning.ts (4 roles seed) | Auto-approves KYC by fiat (line 146); lender/carbon/authority seed nothing; no log row for Goldrush |
| Manifest + checklist | EXISTS — onboarding-manifest.ts, onboarding-checklist.ts | L2: checklist completes at "you have a PPA"; complete_profile-only for capital/authority; no SLA/dunning |
| Subscription/billing | EXISTS — admin-platform.ts trial sub, subscription-billing-chain.ts | Sub created only for trial tier; tenant_subscriptions=0 live |
| Tenant binding | EXISTS — tenant_provisioning_requests, admin-platform.ts:111-208 | Bypassed: /auth/register writes role+null tenant; tenant_provisioning_requests=0 live |

Take-on funnel KPI set (cross-role)

- **Activation rate**: % of registered → KYC-verified → first-real-transaction within 14 days (checklist 100%). Today unmeasurable — funnel never ran.
- **Time-to-first-transaction (TTFT)**: registration → first chain case the role owns (offtaker first metering reading / trader first order / lender first facility / carbon first project).
- **Median time-to-verified vs risk-tier SLA**: pending_submission → verified, breach-rate by risk_level (kycSlaSweep + regulator_inbox already wired).
- **Drop-off per phase**: request→approved, invite→first-login, evidence→submitted→verified→first-artifact.
- **Compliance regression alarm**: auto-approve incidents (kyc_status='approved' with 0 evidence rows) — must be 0 after the fiat-flip is removed. **Currently 14.**
- **Branch-specific**: % live generation projects with grid_connections + scada feed (today 0%); % onboarded offtakers with first daily reading; four-eyes compliance rate for authority grants (target 100%); first-invoice-paid rate per tenant.

The single highest-leverage change (consensus across all 5 clusters)

Remove the silent `UPDATE participants SET kyc_status='approved'` (onboarding-provisioning.ts:146) and make a kyc-chain.ts oe_kyc_verifications case the **sole writer** of participants.kyc_status='approved' + market_access. This one change activates three already-built dormant systems (doc upload, FICA tiers/screening, W198 audited chain), gives kycSlaSweep a real case to sweep, closes the FICA/POPIA hole that live data proves wide open (14/14 approved with zero evidence), and removes the competing KYC sources of truth — without any new chain infrastructure. Pair it with removing grid_operator from the public register enum (validation.ts:41), the one outright security hole.

---

## Take-on phases (structured)

- **Phase 1 — Identity & tenant intake (request, not self-mint account)** _(all roles, L4)_
- **Phase 2 — KYC/FICA evidence upload (docs + UBO + officer-delegation for authority)** _(all roles, L4)_
- **Phase 3 — Automated PEP/sanctions/adverse-media screening + AML risk-tier** _(all roles, L4)_
- **Phase 4 — Open audited KYC chain case; adjudicate — verified is sole writer of approved** _(all roles, L5)_
- **Phase 5 — Role-specific provisioning gated on verified (generation grid+scada / demand metering+security / capital facility+registry / authority scope+four-eyes / operator tenant+sub)** _(specific roles, L4)_
- **Phase 6 — Data linkage & actuals go-live (Solax/SCADA feed, first metered reading)** _(specific roles, L4)_
- **Phase 7 — Activation: manifest + live checklist + onboarding.completed cascade + support handoff** _(all roles, L4)_
- **Phase 8 — First transaction + close-out (dunning, SLA sweep to regulator_inbox, activation-metrics rollup)** _(all roles, L5)_

## Goldrush verdict

Goldrush is half-convincing: the Solax actuals pipeline is genuinely real and live (2,425 telemetry rows, 17.15 MWh across 10 sites, verified against cec-energy-db), which is the hard part — but three downstream surfaces fabricate delivery against it. The obligation chain claims 133 MWh (exactly 0.95x contracted, ~7.8x the real fleet total), the annual recon is signed_off on 206 MWh of synthetic metered data for a year with zero telemetry, and 20 RECs cover 2024-2025 periods that never generated, all violating the actuals-only mandate and contradicting the (correct) cockpit number. Worse for a money-led C&I buyer, the headline reads a scary 27% delivered (a 14-day-vs-annual artifact) and drills into an IPP-scoped metering page that shows Goldrush nothing, while no provisioning manifest exists so the workspace offers no next-step scaffolding. Fix the three chains to read the one real om_telemetry seam, unify the 27% headline with its drill-through, and backfill the manifest, and Goldrush becomes a clean reference customer; until then it is a strong pipeline wrapped in numbers that tell four different stories.
