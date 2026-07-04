# DEMO FABRICATION MANIFEST (LIVE cec-energy-db)

Every fabricated demo row is tagged with id prefix `ddfab_`. Nothing else was mutated except:
- GoNXT project consolidation 10→1 (`proj_1af4c79d...` kept as "Goldrush C&I Solar Portfolio"; 9 deleted; om_sites + covenants + ie_certifications + rec_certificates repointed). This is a real-data correction, NOT fabrication — do not delete the kept project on teardown.

## Anchor totals (real, p_live_gonxt)
- 1 project: Goldrush C&I Solar Portfolio (proj_1af4c79d01936a70f65712f39fd65ab8), 0.96 MW, 10 om_sites
- Settlement: 22 invoice lines, 60.2 MWh, R90,317 billed, R38,920 paid
- Participants: p_live_gonxt(ipp_developer) p_live_goldrush(offtaker) p_live_envera(carbon_fund) p_live_growvest(lender) p_live_admin(admin)

## TEARDOWN
Run `DELETE FROM <table> WHERE id LIKE 'ddfab_%';` for each table below.
(FK order: delete child tables before parents.)

## Tables touched (appended by seeders) — TEARDOWN list
Per-role detail in `dd-build/manifest-*.md`. Delete child→parent. Every row matches `id LIKE 'ddfab_%'`.

### Lender (Growvest p_live_growvest)
- lender_credit_risk, oe_loan_defaults, oe_covenant_certificates, oe_drawdown_chain, ie_certifications, covenant_waivers, covenant_tests, covenants, loan_facilities

### Carbon (Envera p_live_envera fund / Goldrush p_live_goldrush holder)
- carbon_vintage_workflow, carbon_tax_offset_retirements, carbon_tax_offset_claims, credit_serials, carbon_retirements, carbon_holdings, credit_vintages, mrv_verifications, mrv_submissions, carbon_projects, carbon_fund_pipeline, carbon_fund_capital_calls, carbon_fund_lps, carbon_fund_nav_history, carbon_fund_nav

### O&M (sites under p_live_gonxt)
- oe_spare_parts_provisioning, oe_pm_compliance, oe_availability_guarantees, oe_asset_prognostics, om_work_orders

### Offtaker (Goldrush p_live_goldrush)
- rec_retirements, oe_offtaker_ppa_obligations
  (off_ppa_portfolio / rec_certificates / oe_rec_lifecycle were already populated — NO ddfab_ rows added)

### One-shot teardown
```bash
cd open-energy-platform
for t in lender_credit_risk oe_loan_defaults oe_covenant_certificates oe_drawdown_chain ie_certifications \
  covenant_waivers covenant_tests covenants loan_facilities \
  carbon_vintage_workflow carbon_tax_offset_retirements carbon_tax_offset_claims credit_serials \
  carbon_retirements carbon_holdings credit_vintages mrv_verifications mrv_submissions carbon_projects \
  carbon_fund_pipeline carbon_fund_capital_calls carbon_fund_lps carbon_fund_nav_history carbon_fund_nav \
  oe_spare_parts_provisioning oe_pm_compliance oe_availability_guarantees oe_asset_prognostics om_work_orders \
  rec_retirements oe_offtaker_ppa_obligations; do
  npx wrangler d1 execute cec-energy-db --remote --command "DELETE FROM $t WHERE id LIKE 'ddfab_%';"
done
```
## ALL-SURFACES FILL (2026-06-22) — `dd-build/surfacefill-*.md`

Proactive pass: every reachable Meridian surface for every demo persona probed via D1, empties filled with `ddfab_` rows. Per-role detail (exact tables + counts + routing-gap notes) in `dd-build/surfacefill-<role>.md`. New tables touched on top of the per-role list above:

- **admin** (p_live_admin): admin_billing_runs, admin_tenant_lifecycle_events, admin_feature_flag_overrides, popia_pii_access_log, oe_data_subject_requests, oe_subscription_invoices, cascade_dlq, oe_strate_swift_connector, oe_sap_oracle_erp_connector, oe_government_filing_connector, oe_anomaly_detection_ml, oe_rul_prediction_ml, oe_fault_fingerprint_ml, oe_reconciliation_attestation, audit_exports, audit_recon_runs
- **carbon** (p_live_envera): carbon_mrv_workflow, carbon_retirement_certificates, audit_events, oe_feature_entitlements, oe_doc_jobs
- **ipp** (p_live_gonxt): ipp milestones/activities/issues/risks/stakeholders/lessons/insurance/community_stakeholders/ed_sed_spend/gtia/annual_reports/reipppp + oe_scada_connector (exact names in fragment)
- **lender** (p_live_growvest): oe_lender_watchlist, covenant_action, dunning, reserve_accounts, waterfall_structure, benchmark transition, carbon_holdings, carbon_retirements, oe_feature_entitlements, oe_doc_jobs
- **offtaker** (p_live_goldrush): invoices, offtaker_budgets, tariff_products, oe_wheeling_agreements, oe_grid_wheeling_charges, loi_drafts, audit_events
- **grid** (demo_grid_001): grid_curtailment_events, grid_ancillary_award_events, grid_outage_responses, oe_wheeling_agreements, oe_grid_wheeling_charges, oe_grid_wheeling_disputes, oe_dispatch_nominations, oe_grid_code_compliance, oe_public_consultations, audit_events
- **regulator** (demo_regulator_001): regulator_licences, regulator_licence_action_workflow, regulator_enforcement_case_events, regulator_surveillance_triage(+alerts), oe_regulator_inbox, oe_compliance_notices, oe_regulator_levies, oe_disposition_cases, oe_reconciliation_attestation, oe_government_filing_connector, audit_events
- **trader** (demo_trader_001): trader_positions, fills, matches, orders, rejections, trade_exceptions, margin_calls, mm_obligations(+performance), var/scenario tables, audit_exports, audit_recon_runs
- **esco/support/epc**: UNREACHABLE (no participant row exists for those roles → no demo login can render them; nothing seeded).

### CAVEAT — non-ddfab head rows
A few `audit_chain_state` head rows (PK = `entity_type`, so cannot carry a `ddfab_` id) were written/updated for entity_type in {carbon, offtaker, regulator, grid, trader} so the AuditPanel "Verify chain" passes. These are NOT removed by the ddfab_ sweep. On teardown, manually reset them if they were created by this pass (check `seq`/recency vs. the linked audit_events). Most agents deliberately skipped writing the head row for exactly this reason — only offtaker + regulator wrote one.

## TEARDOWN — self-discovering sweep (preferred)
Don't hand-maintain the table list; sweep every table for `ddfab_` ids:
```bash
cd open-energy-platform
# 1. list every table that has an `id` column
npx wrangler d1 execute cec-energy-db --remote --json --command \
  "SELECT m.name FROM sqlite_master m WHERE m.type='table' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) p WHERE p.name='id')" \
  | python3 -c "import json,sys; print('\n'.join(r['name'] for r in json.load(sys.stdin)[0]['results']))" > /tmp/ddfab_tables.txt
# 2. delete ddfab_ rows from each (FK errors → run twice; child tables clear on 2nd pass)
while read t; do
  npx wrangler d1 execute cec-energy-db --remote --command "DELETE FROM $t WHERE id LIKE 'ddfab_%';" 2>/dev/null
done < /tmp/ddfab_tables.txt
while read t; do
  npx wrangler d1 execute cec-energy-db --remote --command "DELETE FROM $t WHERE id LIKE 'ddfab_%';" 2>/dev/null
done < /tmp/ddfab_tables.txt
```
The explicit per-role list above remains valid as a cross-check; the sweep is authoritative.

## ADDENDUM 2026-06-24 — protocec Concierge prototype login
- `participants` id `ddfab_offtaker_demo` — email `demo@goldrush.co.za`, password `Demo@2024!`, role offtaker, tenant_id `t_goldrush`, status active / kyc approved. Reason: live `p_live_goldrush` has a real pbkdf2 hash (unknown, non-ddfab, cannot reset) and `demo_offtaker_001` has an invalid 17-char hash; neither can log in. This ddfab_ row gives the protocec prototype a working Goldrush-tenant offtaker login. Caught by the self-discovering sweep.
