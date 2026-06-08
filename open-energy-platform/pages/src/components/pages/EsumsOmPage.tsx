// ════════════════════════════════════════════════════════════════════════
// EsumsOmPage — /esums role workbench.
//
// Bundles the cockpit + CRUD list tabs for the Asset Intelligence module.
// Built on SuitePage so it inherits the platform's tab chrome + AI brief
// panel.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';
import { EsumsOmCockpit } from '../widgets/EsumsOmCockpit';
import { EsumsOmOpportunities } from '../widgets/EsumsOmOpportunities';
import { PredictiveAssetHealthChainTab } from '../esums/PredictiveAssetHealthChainTab';
import { CommissioningTab } from '../esums/CommissioningTab';
import { SmartMeterChainTab } from '../esums/SmartMeterChainTab';
import { WarrantyClaimChainTab } from '../esums/WarrantyClaimChainTab';
import { VendorEscalationChainTab } from '../esums/VendorEscalationChainTab';
import { WoChainTab } from '../esums/WoChainTab';
import { PrChainTab } from '../esums/PrChainTab';
import { AvailabilityGuaranteeChainTab } from '../esums/AvailabilityGuaranteeChainTab';
import { PmComplianceChainTab } from '../esums/PmComplianceChainTab';
import { PermitToWorkChainTab } from '../esums/PermitToWorkChainTab';
import { GenerationRevenueAssuranceChainTab } from '../esums/GenerationRevenueAssuranceChainTab';
import { BessSohChainTab } from '../esums/BessSohChainTab';
import { SoilingAuditChainTab } from '../esums/SoilingAuditChainTab';
import { EsgDisclosureChainTab } from '../carbon/EsgDisclosureChainTab';
import { HseIncidentChainTab } from '../hse/HseIncidentChainTab';
import { CyberIncidentChainTab } from '../cyber/CyberIncidentChainTab';
import { DataSourcesTab } from '../esums/DataSourcesTab';
import { StationParticipantLinkTab } from '../esums/StationParticipantLinkTab';
import { InverterIntegrationsTab } from '../esums/InverterIntegrationsTab';
import { ProtectionRelayTestTab } from '../esums/ProtectionRelayTestTab';

export function EsumsOmPage() {
  const tabs: TabSpec[] = [
    {
      key: 'cockpit',
      label: 'Cockpit',
      endpoint: '',
      description: 'Live fleet revenue ticker, fault register with revenue impact, fleet health grid, AI briefing, work order kanban.',
      columns: [],
      customContent: <EsumsOmCockpit />,
    },
    {
      key: 'opportunities',
      label: 'Opportunities',
      endpoint: '',
      description: 'Deterministic rule-based scan of the fleet for monetisable performance improvements. Every card cites its evidence and quantifies annual R upside.',
      columns: [],
      customContent: <EsumsOmOpportunities />,
    },
    {
      key: 'prognostics',
      label: 'Predictive health',
      endpoint: '',
      description: '12-state P6 Predictive Asset Health & Prognostics chain — the NTT-beating predictive O&M brain. Six-method anomaly ensemble (EWMA SPC control chart, z-score, Tukey IQR, rate-of-change, persistence, fleet percentile), OLS degradation trend with R², remaining-useful-life projection and explainable physics-based fault fingerprinting (12 fault modes; safety modes auto-flagged). predicted → triaged → diagnosed → action planned → WO raised → monitoring → resolved (with auto-suppress, dismiss, escalate, record-failure, expire and recurrence branches). URGENT revenue/safety-tier SLAs (higher revenue-at-risk or safety-implicated = tighter window). Every prediction quantifies revenue-at-risk in ZAR and an O&M savings ledger benchmarked to beat NTT Data by 30%. Single-party write (asset team). Confirmed safety/high-tier failures, safety+high escalations and major/critical SLA breaches cross into the regulator inbox.',
      columns: [],
      customContent: <PredictiveAssetHealthChainTab />,
    },
    {
      key: 'commissioning',
      label: 'Commissioning chain',
      endpoint: '',
      description: 'Site onboarding workflow — planned → registered → devices → ingestion → first telemetry → energised → in O&M. P6-grade audit chain with SLA gates per stage.',
      columns: [],
      customContent: <CommissioningTab />,
    },
    {
      key: 'smart_meter',
      label: 'Smart-meter chain',
      endpoint: '',
      description: 'NRS 047 smart meter lifecycle from purchase order through FAT, delivery, installation, commissioning, comms test and data-quality validation to operational service.',
      columns: [],
      customContent: <SmartMeterChainTab />,
    },
    {
      key: 'warranty_claims',
      label: 'Warranty claims',
      endpoint: '',
      description: 'OEM warranty / RMA claim chain — open → triage → submit → ack → review → approve|deny|dispute → fulfill → close. Severity-tiered SLAs (safety 4h / performance 24h / cosmetic 72h). Safety-tier denials and SLA breaches escalate into the regulator inbox.',
      columns: [],
      customContent: <WarrantyClaimChainTab />,
    },
    {
      key: 'vendor_escalation',
      label: 'Vendor escalation',
      endpoint: '',
      description: 'Supplier-defect escalation chain (CPA §56/§61 + NRCS) — filed → vendor triage → vendor decision → escalated to OEM → OEM field investigation → OEM decision → remediation → closed (with recall, arbitration and withdrawal branches). URGENT defect-class SLAs (safety recall 4h triage; single unit 7d). Each event is tagged with the contractual party (operator/vendor/OEM). Safety-recall and fleet-systemic OEM decisions, recalls, arbitrations and SLA breaches cross into the regulator inbox.',
      columns: [],
      customContent: <VendorEscalationChainTab />,
    },
    {
      key: 'wo_chain',
      label: 'WO dispatch chain',
      endpoint: '',
      description: '12-state P6 work order dispatch chain — created → assigned → acknowledged → en route → on site → diagnosing → repairing → testing → completed → verified → closed. Priority-tiered SLAs (critical 15m / 1h per stage). Critical-priority cancels and SLA breaches escalate into the regulator inbox.',
      columns: [],
      customContent: <WoChainTab />,
    },
    {
      key: 'pr_chain',
      label: 'PR chain',
      endpoint: '',
      description: '9-state P6 Performance-Ratio sustained-underperformance chain — monitoring → warning → investigating → RCA → intervention planned → executing → verified → closed (with escalation + false-alarm branches). Tier SLAs (utility 24h warning, 30d intervention). Utility-tier escalations and SLA breaches cross into the regulator inbox.',
      columns: [],
      customContent: <PrChainTab />,
    },
    {
      key: 'availability_guarantee',
      label: 'Availability guarantee',
      endpoint: '',
      description: '12-state P6 O&M Availability Guarantee & Liquidated Damages chain (IEC 61724/62446 + REIPPPP O&M service agreement) — period open → measurement submitted → adjustment review → reconciled → meets guarantee → settled (happy path), with a shortfall branch (shortfall flagged → LD assessed → settled), an optional cure period, and a dispute branch. The availability counterpart to the PR chain — availability is time-based uptime, PR is energy-based yield. URGENT shortfall-tier SLAs (larger shortfall = tighter window). Single-party write: each event is tagged with the contractual party (asset owner / O&M contractor). Critical-tier (severe/critical) shortfalls, dispute resolutions and SLA breaches cross into the regulator inbox as a security-of-supply concern.',
      columns: [],
      customContent: <AvailabilityGuaranteeChainTab />,
    },
    {
      key: 'pm_compliance',
      label: 'PM compliance',
      endpoint: '',
      description: '12-state P6 Preventive-Maintenance Schedule Compliance & Deferral chain (IEC 62446/61724 + REIPPPP O&M service-agreement PM-program discipline) — pm scheduled → work assigned → in progress → completed → verification pending → closed (happy path), with a rework loop (require rework → in progress), an on-hold loop (parts/access pending), a deferral branch (request deferral → deferred on approval, or back to work assigned on rejection), a skip terminal (the window lapsed unexecuted — a compliance failure), and a cancel terminal. The PROACTIVE maintenance-program counterpart UPSTREAM of the availability guarantee and PR chains — keeping PMs on schedule is what keeps availability and PR within guarantee. URGENT criticality-tier SLAs (more critical PM = tighter response window). Single-party write: each event is tagged with the contractual party (asset owner / O&M contractor). Skipping a critical / safety-critical PM, deferring a safety-critical PM, and critical-tier SLA breaches cross into the regulator inbox as a maintenance-compliance failure.',
      columns: [],
      customContent: <PmComplianceChainTab />,
    },
    {
      key: 'permit_to_work',
      label: 'Permit to work',
      endpoint: '',
      description: '12-state P6 Permit-to-Work / Lock-Out-Tag-Out chain (OHSA + SANS 10142 + REIPPPP O&M safe-work-permit discipline) — permit requested → hazard assessment → isolation pending → isolation confirmed → permit issued → work in progress → work complete → permit closed (happy path), with a suspend/resume loop, a reject terminal (permit refused at assessment), a revoke terminal (permit cancelled mid-work — always reportable), and a withdraw terminal. The CONTROL-OF-WORK gate that authorises every hazardous O&M intervention before a technician touches an isolated or energised asset — upstream of the WO dispatch and PM compliance chains. URGENT hazard-tier SLAs (more hazardous work = tighter window). Single-party write: each event is tagged with the contractual party (issuing authority / permit holder). Issuing a permit for live-electrical or confined-space work (or any critical/catastrophic hazard tier), every permit revocation, and critical-tier SLA breaches cross into the regulator inbox as a control-of-work safety concern.',
      columns: [],
      customContent: <PermitToWorkChainTab />,
    },
    {
      key: 'revenue_assurance',
      label: 'Revenue assurance',
      endpoint: '',
      description: '12-state P6 Generation Revenue Assurance & Meter Reconciliation chain (NERSA metering code + REIPPPP PPA settlement discipline) — period open → data ingested → reconciled → variance flagged → investigating → classified → recovery pending → recovered (recovery path), with a within-tolerance close-clean terminal, a settlement-dispute branch (recovery pending → in dispute → recovered | written off), a write-off terminal (unrecoverable), and a cancel terminal. Reconciles the FOUR numbers that should agree but rarely do — EXPECTED generation (W71 prognostics / W24 PR baseline), the REVENUE METER reading, the SETTLEMENT statement and the PPA INVOICE — and where they diverge, classifies the leakage signature (meter drift / comms gap / settlement error / curtailment shortfall / clipping loss / meter tampering), then closes the loop to an SLA-driven recovery with a quantified recovered-ZAR ledger. Beats reactive meter-vs-settlement tools by using the expected-generation model as the recon baseline. URGENT variance-tier SLAs (larger revenue variance chased harder). Single-party write: each event is tagged with the contractual party (analyst / counterparty / reviewer). Every settlement dispute (all tiers), any meter-tampering finding (all tiers), material+ write-offs and major/critical SLA breaches cross into the regulator inbox as a metering-code matter.',
      columns: [],
      customContent: <GenerationRevenueAssuranceChainTab />,
    },
    {
      key: 'bess_soh',
      label: 'BESS SOH',
      endpoint: '',
      description: '12-state P6 BESS State-of-Health Monitoring & Capacity-Augmentation Programme chain (NERSA Grid Code + REIPPPP BESS PPA capacity-floor warranty) — baseline set → monitoring active → drift detected → assessment pending → augmentation required → augmentation planned → augmentation in progress → augmentation complete → recommissioned (happy path), with a dispute branch (drift detected / assessment pending / augmentation required → disputed → resolved), a decommission terminal (asset retired before recovery), and a cancel terminal. The BESS counterpart to W24 PR (PV PR) and W51 availability (uptime) — measures CAPACITY FADE against the contractual SOH floor and triggers warranty-backed augmentation programmes before security-of-supply is compromised. Beats Powin Stack OS / Tesla Megapack OS / Fluence BMS / AES Advancion / Wärtsilä GEMS / Honeywell Experion BESS by re-deriving fade trajectory, RUL and augmentation NPV on every transition with a live battery (annualised fade rate, equivalent full cycles, cycle attribution %, capacity shortfall MWh, augmentation CapEx, capacity payment at risk, augmentation NPV, warranty recovery eligibility, predicted decommission years). URGENT SOH-tier SLAs RE-DERIVED on every transition (lower SOH vs contractual floor = tighter window; critical < floor / material 0–5pp above / watch 5–10pp / nominal ≥10pp). Single-party write (asset / O&M support team). SECURITY-OF-SUPPLY SIGNATURE — require_augmentation crosses the regulator EVERY tier when installed capacity ≥ 50 MW (NERSA Grid Code grid-significant threshold) or material/critical tier otherwise; decommission ALWAYS crosses (asset retirement is reportable); raise_dispute and SLA breaches cross on material/critical.',
      columns: [],
      customContent: <BessSohChainTab />,
    },
    {
      key: 'soiling_audit',
      label: 'Soiling audit',
      endpoint: '',
      description: '12-state P6 Plant Soiling, Cleaning Authorisation & Recovery-Gain Audit chain (IEC 61724-1 + NERSA REIPPPP production reporting + DFFE water-use licence). PV soiling is one of the single biggest controllable production losses on a SA solar plant. Periodic soiling-ratio measurement (reference-cell + dirty/clean pair) → inspection record (visual + IR + drone) → economic assessment (lost MWh tariff vs cleaning ZAR + water m³) → cleaning authorisation gate (water-restrictions + neighbour notices + DFFE conditions) → field cleaning execution → post-clean PR-delta validation → settled audit ledger that feeds W79 generation revenue assurance, plus a counterparty dispute branch. Beats NTT Data Soiling Maps + Power Factors Drive Soiling + AlsoEnergy Soiling Loss Index + 3E SynaptiQ Soiling + Above Surveying drone IR + Heliolytics aerial PV + Atonometrics RSE-1 + DEWA-RTC + DroneDeploy by re-deriving tier (minor < 2% / standard 2–4% / material 4–8% / severe ≥ 8%) on EVERY transition with FLOOR-AT-MATERIAL on rainy-season-strict / post-dust-storm-event / neighbour-complaint / water-restriction-active, and a 4-step authority ladder (site supervisor → plant manager → asset director → CFO). URGENT SLA polarity — higher soiling band = TIGHTER windows. PRODUCTION-LOSS SIGNATURE — raise_dispute crosses regulator EVERY tier (production-loss disputes always reportable), authorize_cleaning crosses when water ≥ 100 m³ OR plant ≥ 50 MW (DFFE WUL + NERSA grid-significant threshold), cancel_audit crosses on material + severe, sla_breached crosses on material + severe.',
      columns: [],
      customContent: <SoilingAuditChainTab />,
    },
    {
      key: 'esg_disclosure',
      label: 'ESG disclosure',
      endpoint: '',
      description: '12-state P6 ESG Disclosure Lifecycle & Assurance Chain (ISSB IFRS S1+S2 / TCFD 4 pillars / GRI Universal + sector / CDP Climate-Water-Forests / JSE SRL 2024 / King IV Principles 1-3 + 15-17 / SBTi alignment / Carbon Tax Act §6 / SAICA Code 8). Full JSE-listed entity annual ESG cycle: period_open → collect_data → verify_boundary → compute_metrics → compile_draft → submit_for_review → engage_assurance → start_assurance → complete_assurance → publish_disclosure → file_regulator → archive_year + disputed branch (from draft/internal-review/assured → resolve back to internal-review) + restate_disclosure from filed (UNIVERSAL hard line — sister of W42 reversal — always crosses regulator) + cancel_year (universal when year_had_listed_disclosure). Beats Workiva ESG / Sphera SpheraCloud / SAP Sustainability Control Tower / Microsoft Sustainability Manager / IBM Envizi / Salesforce Net Zero Cloud / Greenstone / EcoVadis / Persefoni / Watershed / Diligent ESG / Bloomberg ESG / Refinitiv Lipper ESG via a LIVE 4-framework completeness battery (TCFD / GRI / CDP / JSE-SRL / King-IV / ISSB-S1S2 + SBTi alignment + ESG Disclosure Index + assurance-confidence ladder + regulator-filing countdown) composed every fetch from raw inputs. Tier RE-DERIVED on every transition from scope × climate-exposure × assurance: minor entity_only+low+none / standard entity+subs OR medium OR limited / material group OR high OR limited / strategic group AND (high OR reasonable). FLOOR-AT-MATERIAL when JSE listed OR Scope 3 15-cat OR scenario-required OR 8+ material topics OR SBTi committed. INVERTED SLA polarity (strategic = 270d annual cycle; minor publish = 7d). 4-step authority ladder (analyst → director → audit chair → board). SIGNATURE — restate_disclosure crosses regulator EVERY tier (UNIVERSAL hard line), qualified/adverse/disclaimer opinion crosses on material+strategic, cancel-of-listed-year crosses universally, sla_breach strategic only (filing-deadline miss).',
      columns: [],
      customContent: <EsgDisclosureChainTab />,
    },
    {
      key: 'hse_chain',
      label: 'HSE incidents',
      endpoint: '',
      description: 'OHSA Section 24 + NEMA Section 30 workplace-safety + environmental incident lifecycle — reported → triaged → authority notified → investigating → CAPA planned/executing → verified → closed (with escalation + false-alarm branches). Tier SLAs (fatal 1h triage; major 4h; environmental 4h). Reportable-tier (fatal/major/environmental) authority notifications, escalations and SLA breaches cross into the regulator inbox.',
      columns: [],
      customContent: <HseIncidentChainTab />,
    },
    {
      key: 'cyber_chain',
      label: 'Cyber incidents',
      endpoint: '',
      description: 'POPIA Section 22 + Cybercrimes Act Section 54 digital-incident lifecycle — detected → triaged → contained → IR notified → subjects notified → investigating → remediation planned/executing → verified → closed (with escalation + false-alarm branches). Tier SLAs (catastrophic 30m triage; major/personal-data 72h IR notification). Reportable-tier (catastrophic/major/personal-data) regulator notifications, escalations and SLA breaches cross into the regulator inbox.',
      columns: [],
      customContent: <CyberIncidentChainTab />,
    },
    {
      key: 'accruals',
      label: 'Accruals',
      endpoint: '/esums/accruals/rows',
      description: 'Real-time generation accrual ledger from Solax inverter data. Every row is a metered kWh-period with the corresponding revenue, carbon offset and savings value. This is the source-of-truth for settlement invoices and carbon credit minting — no synthetic or estimated data.',
      columns: [
        { key: 'station_name', label: 'Station' },
        { key: 'period_hour',  label: 'Period',  date: true },
        { key: 'kwh_delta',    label: 'kWh',     align: 'right', number: true },
        { key: 'revenue_zar',  label: 'Revenue', align: 'right', currency: true },
        { key: 'savings_zar',  label: 'Savings', align: 'right', currency: true },
        { key: 'carbon_tco2e', label: 'tCO₂e',  align: 'right', number: true },
        { key: 'tariff_rate_used', label: 'Grid tariff', align: 'right', number: true },
        { key: 'is_backfill',  label: 'Backfill', render: (r) => <StatusPill status={r.is_backfill ? 'yes' : 'live'} /> },
      ],
    },
    {
      key: 'settlement_invoices',
      label: 'Invoices',
      endpoint: '/esums/settlement-invoices',
      description: 'Monthly settlement invoices derived from the accruals ledger. Each invoice covers one station for one calendar month. Actions: issue → acknowledge → pay / dispute / void.',
      columns: [
        { key: 'invoice_number', label: 'Invoice #' },
        { key: 'station_name',   label: 'Station' },
        { key: 'period_start',   label: 'Period',    date: true },
        { key: 'kwh_generated',  label: 'kWh',       align: 'right', number: true },
        { key: 'total_zar',      label: 'Total (R)',  align: 'right', currency: true },
        { key: 'savings_zar',    label: 'Savings (R)',align: 'right', currency: true },
        { key: 'status',         label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'issued_at',      label: 'Issued',    date: true },
        { key: 'paid_at',        label: 'Paid',      date: true },
      ],
      rowActions: [
        { label: 'Issue', tone: 'primary', endpoint: '/esums/settlement-invoices/{id}', method: 'PATCH',
          form: { title: 'Issue invoice', endpoint: '', extraBody: { action: 'issue' }, fields: [
            { name: 'notes', type: 'textarea', label: 'Notes', required: false },
          ] as any}},
        { label: 'Acknowledge', tone: 'default', endpoint: '/esums/settlement-invoices/{id}', method: 'PATCH',
          form: { title: 'Acknowledge invoice', endpoint: '', extraBody: { action: 'acknowledge' }, fields: [] as any }},
        { label: 'Mark paid', tone: 'primary', endpoint: '/esums/settlement-invoices/{id}', method: 'PATCH',
          form: { title: 'Mark invoice paid', endpoint: '', extraBody: { action: 'pay' }, fields: [
            { name: 'payment_ref', type: 'text', label: 'Payment reference', required: true },
          ] as any}},
        { label: 'Dispute', tone: 'danger', endpoint: '/esums/settlement-invoices/{id}', method: 'PATCH',
          form: { title: 'Dispute invoice', endpoint: '', extraBody: { action: 'dispute' }, fields: [
            { name: 'notes', type: 'textarea', label: 'Dispute reason', required: true },
          ] as any}},
      ],
    },
    {
      key: 'carbon_credits',
      label: 'Carbon credits',
      endpoint: '/esums/carbon-credits',
      description: 'Monthly carbon credit records auto-minted from the accruals ledger. Each record represents one tCO₂e-equivalent offset generated by a station in a calendar month. Actions: verify (provisional → verified) then retire (verified → retired) to permanently retire against a carbon-tax liability or Scope-2 claim.',
      columns: [
        { key: 'station_name',   label: 'Station' },
        { key: 'period_start',   label: 'Period',    date: true },
        { key: 'kwh_generated',  label: 'kWh',       align: 'right', number: true },
        { key: 'carbon_tco2e',   label: 'tCO₂e',     align: 'right', number: true },
        { key: 'carbon_value_zar', label: 'Value (R)',align: 'right', currency: true },
        { key: 'status',         label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'registry_ref',   label: 'Registry ref' },
        { key: 'retired_at',     label: 'Retired',   date: true },
      ],
      rowActions: [
        { label: 'Verify', tone: 'primary', endpoint: '/esums/carbon-credits/{id}', method: 'PATCH',
          form: { title: 'Verify carbon credit', endpoint: '', extraBody: { action: 'verify' }, fields: [] as any }},
        { label: 'Retire', tone: 'danger', endpoint: '/esums/carbon-credits/{id}', method: 'PATCH',
          form: { title: 'Retire carbon credit', endpoint: '', extraBody: { action: 'retire' }, fields: [
            { name: 'notes', type: 'textarea', label: 'Retirement purpose / beneficiary', required: true },
          ] as any}},
      ],
    },
    {
      key: 'sites',
      label: 'Sites',
      endpoint: '/esums/sites',
      description: 'Generation sites with live KPIs. Click into a site for the asset-level dashboard.',
      columns: [
        { key: 'name', label: 'Site' },
        { key: 'technology', label: 'Tech' },
        { key: 'capacity_mw', label: 'MW',  align: 'right', number: true },
        { key: 'province', label: 'Province' },
        { key: 'device_count', label: 'Devices', align: 'right', number: true },
        { key: 'open_faults', label: 'Open faults', align: 'right', number: true },
        { key: 'revenue_lost_mtd_zar', label: 'Lost MTD', align: 'right', currency: true },
        { key: 'open_wos', label: 'Open WOs', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
    {
      key: 'devices',
      label: 'Devices',
      endpoint: '/esums/devices',
      description: 'Inverters, meters, batteries and sensors across all sites. Filter by site_id.',
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'device_type', label: 'Type' },
        { key: 'manufacturer', label: 'OEM' },
        { key: 'model', label: 'Model' },
        { key: 'rated_kw', label: 'Rated kW', align: 'right', number: true },
        { key: 'firmware_version', label: 'FW' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'last_seen_at', label: 'Last seen', date: true },
      ],
    },
    {
      key: 'faults',
      label: 'Faults',
      endpoint: '/esums/faults',
      description: 'Live fault register with Revenue Impact Engine. Hourly bleed + total loss accumulate in real time.',
      columns: [
        { key: 'site_id',     label: 'Site' },
        { key: 'category',    label: 'Category' },
        { key: 'severity',    label: 'Severity', render: (r) => <StatusPill status={String(r.severity)} /> },
        { key: 'description', label: 'Description' },
        { key: 'detected_at', label: 'Detected', date: true },
        { key: 'hourly_loss_zar', label: 'R/h',  align: 'right', currency: true },
        { key: 'total_loss_zar',  label: 'Lost', align: 'right', currency: true },
        { key: 'status',      label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      rowActions: [
        { label: 'Acknowledge', tone: 'primary', endpoint: '/esums/faults/{id}/acknowledge', confirm: 'Acknowledge this fault?' },
        { label: 'Resolve',     tone: 'default', endpoint: '/esums/faults/{id}/resolve',
          form: { title: 'Resolve fault', endpoint: '', fields: [
            { name: 'root_cause', label: 'Root cause', type: 'textarea', required: true },
          ]}},
      ],
    },
    {
      key: 'workorders',
      label: 'Work orders',
      endpoint: '/esums/work-orders',
      description: '12-state WO lifecycle. Tap a row to drill into the timeline, parts, photos and SLA tracking.',
      columns: [
        { key: 'wo_number',     label: 'WO #' },
        { key: 'site_id',       label: 'Site' },
        { key: 'title',         label: 'Title' },
        { key: 'category',      label: 'Type' },
        { key: 'priority',      label: 'Priority', render: (r) => <StatusPill status={String(r.priority)} /> },
        { key: 'status',        label: 'Status',   render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'technician_name', label: 'Tech' },
        { key: 'sla_deadline',  label: 'SLA', date: true },
      ],
      rowActions: [
        { label: 'Acknowledge', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Acknowledge WO', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true,
              options: [{ value: 'acknowledged', label: 'Acknowledged' }, { value: 'cancelled', label: 'Cancelled' }]},
          ]}},
        { label: 'En route', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Mark en route', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'en_route', label: 'En route' }]},
          ]}},
        { label: 'On site', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Arrived on site', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'on_site', label: 'On site' }]},
          ]}},
        { label: 'Complete', tone: 'primary', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Complete WO', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'completed', label: 'Completed' }]},
            { name: 'resolution_notes', label: 'Resolution notes', type: 'textarea', required: true },
          ]}},
      ],
    },
    {
      key: 'technicians',
      label: 'Team',
      endpoint: '/esums/technicians',
      description: 'Field technicians: skills, certifications, current location, availability.',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'skills', label: 'Skills' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
    {
      key: 'parts',
      label: 'Parts',
      endpoint: '/esums/parts',
      description: 'Parts catalogue and stock. Low-stock items highlighted for reorder.',
      columns: [
        { key: 'part_number', label: 'Part #' },
        { key: 'name', label: 'Name' },
        { key: 'manufacturer', label: 'OEM' },
        { key: 'unit_cost_zar', label: 'Unit cost', align: 'right', currency: true },
        { key: 'current_stock', label: 'Stock', align: 'right', number: true },
        { key: 'min_stock_qty', label: 'Min', align: 'right', number: true },
        { key: 'lead_time_days', label: 'Lead (d)', align: 'right', number: true },
      ],
    },
    {
      key: 'maintenance',
      label: 'Maintenance',
      endpoint: '/esums/maintenance',
      description: 'Scheduled preventive maintenance. Auto-creates work orders 7 days before due date.',
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'task_type', label: 'Task' },
        { key: 'next_due_at', label: 'Next due', date: true },
        { key: 'frequency_days', label: 'Cycle (d)', align: 'right', number: true },
        { key: 'estimated_duration_minutes', label: 'Est. min', align: 'right', number: true },
        { key: 'required_skill', label: 'Skill' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
    {
      key: 'predictions',
      label: 'Predictive',
      endpoint: '/esums/predictions',
      description: 'AI-derived predictive maintenance signals — surfaces likely failures weeks before they happen.',
      params: { status: 'open' },
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'prediction_type', label: 'Prediction' },
        { key: 'confidence', label: 'Confidence', align: 'right', number: true },
        { key: 'estimated_failure_at', label: 'Likely by', date: true },
        { key: 'estimated_loss_zar', label: 'If ignored', align: 'right', currency: true },
        { key: 'recommended_action', label: 'Recommendation' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
    {
      key: 'ingestion',
      label: 'Ingestion',
      endpoint: '/esums/ingestion',
      description: 'OEM connections (Huawei FusionSolar, SolarEdge, SMA, Sungrow, Modbus TCP, Eskom AMR, ...) with last-poll status.',
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'adapter', label: 'Adapter' },
        { key: 'endpoint_url', label: 'Endpoint' },
        { key: 'polling_minutes', label: 'Poll (min)', align: 'right', number: true },
        { key: 'last_poll_at', label: 'Last poll', date: true },
        { key: 'last_status', label: 'Status', render: (r) => <StatusPill status={String(r.last_status)} /> },
      ],
    },
    {
      key: 'integrations',
      label: 'Integrations',
      endpoint: '',
      description: 'Connect inverters and generation assets from solar, wind, hydro and waste-to-energy manufacturers. Manages credentials, live telemetry snapshots and custom adapter stubs for new OEMs.',
      columns: [],
      customContent: <InverterIntegrationsTab />,
    },
    {
      key: 'data_sources',
      label: 'Data sources',
      endpoint: '',
      description: 'Sensor connections and data-ingest APIs — Modbus TCP, SunSpec, MQTT, REST API, OPC-UA and push-ingest endpoints. Click the interval to edit it inline. Hit Live on any row to open a short-window live graph that auto-refreshes on the source\'s polling cycle.',
      columns: [],
      customContent: <DataSourcesTab />,
    },
    {
      key: 'participant_links',
      label: 'Participant links',
      endpoint: '',
      description: 'Two-party onboarding handshake linking this station to downstream participant modules (lender, carbon fund, offtaker, grid operator). Activating a link enables all downstream automated flows — covenant monitoring, carbon credit minting, PPA settlement invoicing, and dispatch event routing — without requiring manual configuration per module.',
      columns: [],
      customContent: <StationParticipantLinkTab />,
    },
    {
      key: 'protection_relay_tests',
      label: 'Protection Tests',
      endpoint: '',
      description: 'NRS 097-2-3 + NERSA Grid Code Chapter 3 protection relay and anti-islanding compliance test lifecycle. 12-state P6 chain: test_scheduled → pre_test_inspection → site_ready → test_executing → preliminary_results → certified_pass (terminal +) or minor_deficiency → rectification → retest loop, or test_failed → rectification_required → rectification_complete → retest_scheduled. URGENT SLA polarity (safety_critical 3d / transmission 7d / distribution 14d / embedded 21d / routine 30d). failed_final (mandatory safety disconnect) crosses regulator for ALL protection classes; test_failed and SLA breach cross for safety_critical + transmission.',
      columns: [],
      customContent: <ProtectionRelayTestTab />,
    },
    {
      key: 'projects',
      label: 'Projects',
      endpoint: '/esums/projects',
      description: 'Portfolio-level project grouping. A project is either linked to an existing IPP project (operational O&M layer on top of a tracked development) or standalone (asset-owner / behind-the-meter / community solar with no IPP lifecycle). If you have no projects yet, a standalone default is created automatically on first open.',
      columns: [
        { key: 'name',             label: 'Project' },
        { key: 'project_type',     label: 'Type', render: (r) => (
            <StatusPill status={r.project_type === 'ipp' ? 'ipp' : 'standalone'} />
          )},
        { key: 'ipp_project_name', label: 'IPP link' },
        { key: 'site_count',       label: 'Sites',    align: 'right', number: true },
        { key: 'total_capacity_kw', label: 'kW',      align: 'right', number: true },
        { key: 'shard_key',        label: 'DB shard' },
        { key: 'status',           label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'created_at',       label: 'Created', date: true },
      ],
      rowActions: [
        {
          label: 'Link IPP project',
          tone: 'primary' as const,
          method: 'PUT' as const,
          endpoint: '/esums/projects/{id}',
          form: {
            title: 'Link to IPP project',
            endpoint: '',
            fields: [
              { name: 'project_type', label: 'Type', type: 'select', required: true,
                options: [
                  { value: 'ipp',        label: 'IPP project (link to tracked development)' },
                  { value: 'standalone', label: 'Standalone (no IPP link)' },
                ]},
              { name: 'ipp_project_id', label: 'IPP project ID', type: 'text' },
            ],
          },
        },
        {
          label: 'Archive',
          tone: 'default' as const,
          method: 'PUT' as const,
          endpoint: '/esums/projects/{id}',
          form: {
            title: 'Archive project',
            endpoint: '',
            fields: [
              { name: 'status', label: 'Status', type: 'select', required: true,
                options: [{ value: 'archived', label: 'Archive' }, { value: 'active', label: 'Restore' }]},
            ],
          },
        },
      ],
    },
    {
      key: 'alerts',
      label: 'Alerts',
      endpoint: '/esums/alerts',
      description: 'All alerts fired across the fleet in the last 7 days.',
      columns: [
        { key: 'severity', label: 'Severity', render: (r) => <StatusPill status={String(r.severity)} /> },
        { key: 'category', label: 'Category' },
        { key: 'title', label: 'Title' },
        { key: 'site_id', label: 'Site' },
        { key: 'created_at', label: 'When', date: true },
        { key: 'acknowledged_at', label: 'Ack', date: true },
      ],
    },
  ];

  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Esums"
      subtitle="Asset Intelligence & Operations — the operational brain that connects physical assets to commercial outcomes."
      tabs={tabs}
      initialTab="cockpit"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}

export default EsumsOmPage;
