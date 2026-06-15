// pages/src/meridian/surfaces.tsx — the Meridian surface registry.
//
// Registry maps `${role}:${tabKey}` → a standalone Meridian surface body. Both the
// keys and the components are STATIC LITERALS authored here — there is no request
// input, no dynamic key construction, no runtime component resolution. MeridianSurfacePage
// looks up exactly one literal key (`${user.role}:${params.key}`) and renders the registered
// component (or an "unavailable" frame). This file is the single allow-list of surfaces.
//
// Phase E retires the `*WorkstationPage.tsx` husks: chain tabs already moved to
// /ledger/:chainKey; the remaining NON-chain tabs (master-data CRUD, settings, analytics/
// reports/ML panels, connectors) become standalone /surface/:key routes reachable via Atlas.
// Rather than hand-write ~98 routes, ONE parametric route (/surface/:key) renders whatever
// this registry resolves for the signed-in role. Later batches register components + delete
// the corresponding workstation tabs.
//
// role = the auth role value as returned by useAuth().user.role and matched by
// getRoleConfig() in roleData.ts — i.e. the JWT-suffixed long forms
// ('admin','trader','lender','offtaker','regulator','support','grid_operator',
// 'ipp_developer','carbon_fund','esums_owner','esco','epc_contractor'). To expose one
// surface under multiple role spellings, add multiple registry keys → same component.
import React from 'react';

// Standalone surface bodies receive only the signed-in role. Adapters below translate
// `role` into whatever props the underlying tab component actually needs.
export type SurfaceComponent = React.ComponentType<{ role: string }>;

// ── Adapters ───────────────────────────────────────────────────────────────
// The connector + ML tab components were authored as workstation tab bodies that take
// `{ regulatorView?: boolean }`, not `{ role }`. We can't hand them a `role` prop directly
// (their Props type has no `role`), so each is wrapped in a one-line adapter that derives
// `regulatorView` from the role (regulator → external read-only view) and otherwise renders
// the tab unchanged. These are React.lazy so each surface only pays for its chunk on first open.
//
// Why adapters at all: SurfaceComponent requires a `{ role: string }` prop the tab components
// don't declare; the adapter bridges the prop shapes and keeps the registry value type clean.
const lazyConnectorOrMl = (
  loader: () => Promise<{ default: React.ComponentType<{ regulatorView?: boolean }> }>,
): React.LazyExoticComponent<SurfaceComponent> =>
  React.lazy(async () => {
    const Tab = (await loader()).default;
    const Adapter: SurfaceComponent = ({ role }) => <Tab regulatorView={role === 'regulator'} />;
    return { default: Adapter };
  });

// Connector trio + transport pair + ML trio — verified self-contained tab bodies with a
// default export and only optional props.
const StrateSwiftConnector = lazyConnectorOrMl(() => import('../components/strateSwiftConnector/StrateSwiftConnectorTab'));
const SapOracleErpConnector = lazyConnectorOrMl(() => import('../components/sapOracleErpConnector/SapOracleErpConnectorTab'));
const GovernmentFilingConnector = lazyConnectorOrMl(() => import('../components/governmentFilingConnector/GovernmentFilingConnectorTab'));
const MqttOpcuaConnector = lazyConnectorOrMl(() => import('../components/mqttOpcuaConnector/MqttOpcuaConnectorTab'));
const ScadaConnector = lazyConnectorOrMl(() => import('../components/scadaConnector/ScadaConnectorTab'));
const AnomalyDetectionMl = lazyConnectorOrMl(() => import('../components/anomalyDetectionMl/AnomalyDetectionMlTab'));
const RulPredictionMl = lazyConnectorOrMl(() => import('../components/rulPredictionMl/RulPredictionMlTab'));
const FaultFingerprintMl = lazyConnectorOrMl(() => import('../components/faultFingerprintMl/FaultFingerprintMlTab'));

// ── ESCO surfaces (E2.8a — first end-to-end workstation migration) ───────────
// SitesPortfolioSurface is a self-contained `{ role }` body — lazy directly.
const EscoSitesPortfolio = React.lazy(() => import('./surfaces/esco/SitesPortfolioSurface'));

// AuditPanel is the shared L5 audit/export/recon primitive; it takes `{ prefix, reconHint }`,
// not `{ role }`. Wrap it in a lazy adapter that supplies the esco endpoint prefix + recon
// column hint (carried verbatim from the retired EscoWorkstationPage `audit` tab).
const EscoAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel prefix="/esums" reconHint="event_id, entity_type, actor_id, timestamp" />
  );
  return { default: Adapter };
});

// ── EPC surfaces (E2.8b — EpcWorkstationPage migration) ──────────────────────
// Two non-chain inline CRUD/listing tabs (RFIs, Technical queries) had no MERIDIAN_CHAINS
// descriptor, so they're extracted to self-contained `{ role }` bodies (Bucket B) rather
// than retired to /ledger. The remaining EPC tabs (submittals, change-orders, ncrs,
// method-statements, site-diary) DO have chain descriptors and are reached via /ledger/:chainKey.
const EpcRfis = React.lazy(() => import('./surfaces/epc/RfisSurface'));
const EpcTechnicalQueries = React.lazy(() => import('./surfaces/epc/TechnicalQueriesSurface'));

// Audit tab carried verbatim from the EpcWorkstationPage `audit` tab (prefix /ipp, same recon hint).
const EpcAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel prefix="/ipp" reconHint="event_id, entity_type, actor_id, timestamp" />
  );
  return { default: Adapter };
});

// ── Carbon surfaces (E2.8c — CarbonWorkstationPage migration) ────────────────
// All 14 chain tabs (article6, mrv_chain, retirement, issuance, ccp, credit_rating, esg,
// scope3, carbon_tax_returns, carbon_budget, vcm, certificate_bundle, registry_transfers,
// methodology_amendments) have MERIDIAN_CHAINS descriptors → retired to /ledger/:chainKey.
// The four remaining non-chain inline tabs are extracted to self-contained `{ role }` bodies
// (Bucket B/D): vintages, mrv (the non-chain MRV-submissions CRUD), certificates, reports.
const CarbonVintages = React.lazy(() => import('./surfaces/carbon/VintagesSurface'));
const CarbonMrv = React.lazy(() => import('./surfaces/carbon/MrvSurface'));
const CarbonCertificates = React.lazy(() => import('./surfaces/carbon/CertificatesSurface'));
const CarbonReports = React.lazy(() => import('./surfaces/carbon/ReportsSurface'));

// Audit tab carried verbatim from the CarbonWorkstationPage `audit` tab
// (prefix /carbon-registry, recon hint + carbon registry recon sources).
const CarbonAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel
      prefix="/carbon-registry"
      reconHint="serial_id,retirement_ref,quantity_tco2e,retired_at"
      reconSourceOptions={['verra', 'gold_standard', 'cdm', 'sa_redd']}
    />
  );
  return { default: Adapter };
});

// ── Regulator surfaces (E2.8d — RegulatorWorkstationPage migration) ──────────
// Chain tabs with MERIDIAN_CHAINS descriptors → retired to /ledger/:chainKey:
//   enforcement_action, enforcement_action_s35, esg_disclosure, public_consultation,
//   market_conduct_exam, regulator_export_pack (W119), control_environment_audit (W121).
// The remaining tabs are extracted/registered here:
//   - surveillance, licences, enforcement — inline CRUD/event-log bodies (Bucket B) → new files.
//   - reports — ReportPanel surface (Bucket D) → new file.
//   - inbox, notices — already-standalone named-export tab components → adapter-wrapped.
//   - icfr_attestations — ReconciliationAttestationTab (W120) has NO chain descriptor, so it is
//     EXTRACTED as Bucket E (regulatorView read-only) rather than retired.
//   - government_filing — shared connector (NOT a chain), already exposed as
//     `regulator:government-filing` via GovernmentFilingConnector above.
const RegulatorSurveillance = React.lazy(() => import('./surfaces/regulator/SurveillanceSurface'));
const RegulatorLicences = React.lazy(() => import('./surfaces/regulator/LicencesSurface'));
const RegulatorEnforcement = React.lazy(() => import('./surfaces/regulator/EnforcementSurface'));
const RegulatorReports = React.lazy(() => import('./surfaces/regulator/ReportsSurface'));

// InboxTab + NoticesTab are self-contained no-prop named exports; wrap each in a lazy adapter
// that ignores `role` and renders the tab unchanged.
const RegulatorInbox: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { InboxTab } = await import('../components/regulator/InboxTab');
  const Adapter: SurfaceComponent = () => <InboxTab />;
  return { default: Adapter };
});
const RegulatorNotices: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { NoticesTab } = await import('../components/regulator/NoticesTab');
  const Adapter: SurfaceComponent = () => <NoticesTab />;
  return { default: Adapter };
});

// W120 ReconciliationAttestationTab has no MERIDIAN_CHAINS descriptor → Bucket E. The regulator
// sees the read-only incoming view (regulatorView). Named export taking `{ regulatorView? }`.
const RegulatorIcfrAttestations: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { ReconciliationAttestationTab } = await import('../components/reconciliation/ReconciliationAttestationTab');
  const Adapter: SurfaceComponent = ({ role }) => <ReconciliationAttestationTab regulatorView={role === 'regulator'} />;
  return { default: Adapter };
});

// Audit tab carried verbatim from the RegulatorWorkstationPage `audit` tab
// (prefix /regulator, licence recon hint + dmre/nersa_internal/eskom recon sources).
const RegulatorAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel
      prefix="/regulator"
      reconHint="licence_number,licensee_name,status,capacity_mw"
      reconSourceOptions={['dmre', 'nersa_internal', 'eskom']}
    />
  );
  return { default: Adapter };
});

// ── Lender surfaces (E2.8e — LenderWorkstationPage migration) ────────────────
// All 10 chain tabs (cp_clearance, dscr_monitoring, slb_kpi_ratchet, construction_cost_report,
// reserve_account, loan_restructure, esap_compliance, facility_amendment, capital_adequacy_report,
// esap_monitoring) have MERIDIAN_CHAINS descriptors → retired to /ledger/:chainKey. The remaining
// non-chain tabs are extracted/registered here:
//   - facilities — inline ListingTable body (Bucket B) → new file.
//   - reports — ReportPanel surface (Bucket D) → new file.
//   - dunning — DunningTab (Wave 6), a self-contained no-prop named export with no chain
//     descriptor (Bucket B) → adapter-wrapped (no new file).
//   - strate-swift / sap-oracle-erp / government-filing — shared connectors, already exposed
//     as `lender:*` via the connector trio above (roleData features added in E2.8e to reach them).
const LenderFacilities = React.lazy(() => import('./surfaces/lender/FacilitiesSurface'));
const LenderReports = React.lazy(() => import('./surfaces/lender/ReportsSurface'));

// DunningTab is a self-contained no-prop named export; wrap in a lazy adapter that ignores
// `role` and renders the tab unchanged.
const LenderDunning: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { DunningTab } = await import('../components/lender/DunningTab');
  const Adapter: SurfaceComponent = () => <DunningTab />;
  return { default: Adapter };
});

// Audit tab carried verbatim from the LenderWorkstationPage `audit` tab
// (prefix /lender, facility-covenant recon hint + sarb/jse_srl/lender_ie recon sources).
const LenderAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel
      prefix="/lender"
      reconHint="facility_id,covenant_test,measured_value,status"
      reconSourceOptions={['sarb', 'jse_srl', 'lender_ie']}
    />
  );
  return { default: Adapter };
});

// ── Admin surfaces (E2.1 — AdminWorkstationPage migration) ───────────────────
// Chain tabs with MERIDIAN_CHAINS descriptors → retired to /ledger/:chainKey:
//   audit_chain_block (W118), regulator_export_pack (W119), control_environment_audit (W121),
//   kyc_verification (W198). These are reached from Atlas via their roleData feature chainKey.
// The remaining non-chain tabs are extracted/registered here:
//   - tenant_events / billing / flags — inline CRUD bodies (Bucket B) → new files.
//   - pii_access — inline read-only listing (Bucket B) → new file (roleData feature added in E2.1).
//   - monitoring (Cascade DLQ) / subscription_billing (W228) — inline operational bodies (Bucket D)
//     → new files (subscription_billing roleData feature added in E2.1).
//   - popia (POPIA data subject requests, W233) — inline operational body (Bucket E) → new file.
//   - reports — ReportPanel surface (Bucket D) → new file (roleData feature added in E2.1).
//   - settlement_audit / platform_audit — two AuditPanel adapters (carried verbatim from the husk).
//   - reconciliation_attestation (W120) — ReconciliationAttestationTab has NO chain descriptor
//     (audit_recon_runs is not in the meridian chain registry), so it is EXTRACTED as Bucket E
//     (admin sees the operator view, regulatorView=false) rather than retired.
//   - settlement_rails / erp_connectors / filing_connectors / anomaly_admin /
//     rul_prediction_admin / fault_fingerprint_admin — shared connectors/ML, registered below via
//     the connector/ML trio adapters under keys matching admin's real roleData feature keys
//     (rul_prediction_admin + fault_fingerprint_admin roleData features added in E2.1).
const AdminTenant = React.lazy(() => import('./surfaces/admin/TenantSurface'));
const AdminBilling = React.lazy(() => import('./surfaces/admin/BillingSurface'));
const AdminFlags = React.lazy(() => import('./surfaces/admin/FlagsSurface'));
const AdminPiiAccess = React.lazy(() => import('./surfaces/admin/PiiAccessSurface'));
const AdminCascadeDlq = React.lazy(() => import('./surfaces/admin/CascadeDlqSurface'));
const AdminSubscriptionBilling = React.lazy(() => import('./surfaces/admin/SubscriptionBillingSurface'));
const AdminDataSubjectRequest = React.lazy(() => import('./surfaces/admin/DataSubjectRequestSurface'));
const AdminReports = React.lazy(() => import('./surfaces/admin/ReportsSurface'));

// W120 ReconciliationAttestationTab has no MERIDIAN_CHAINS descriptor → Bucket E. Admin sees the
// operator (non-regulator) view. Named export taking `{ regulatorView? }`.
const AdminReconciliationAttestation: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { ReconciliationAttestationTab } = await import('../components/reconciliation/ReconciliationAttestationTab');
  const Adapter: SurfaceComponent = ({ role }) => <ReconciliationAttestationTab regulatorView={role === 'regulator'} />;
  return { default: Adapter };
});

// Two AuditPanel adapters carried verbatim from the AdminWorkstationPage `settlement_audit` and
// `platform_audit` tabs (distinct prefixes + recon hints + recon source options).
const AdminSettlementAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel
      prefix="/settlement"
      reconHint="bank_ref,value_date,amount_zar,narrative"
      reconSourceOptions={['bank', 'absa', 'standard_bank', 'fnb', 'nedbank']}
    />
  );
  return { default: Adapter };
});
const AdminPlatformAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel
      prefix="/admin-platform"
      reconHint="billing_run_id,tenant_id,amount_zar,period_end"
      reconSourceOptions={['billing_processor', 'stripe', 'paystack', 'manual']}
    />
  );
  return { default: Adapter };
});

// ── Esums O&M surfaces (E2.2 — EsumsOmPage migration) ────────────────────────
// EsumsOmPage (route /esums) is the O&M suite served to the `esco` role (the esums_owner /
// esco roleData config, esumsDomains). Unlike the WorkstationShell husks, it was a SuitePage
// with `const tabs: TabSpec[]`; TabSpec has no chainKey field, so each chain widget was
// confirmed against MERIDIAN_CHAINS by inspection before deletion.
// Chain widgets WITH a descriptor → retired to /ledger/:chainKey (deleted from the page):
//   SmartMeterChainTab (smart_meter_asset W199), GenerationRevenueAssuranceChainTab
//   (generation_revenue_assurance), BessSohChainTab (bess_soh), SoilingAuditChainTab
//   (soiling_audit), EsgDisclosureChainTab (esg_disclosure), CyberIncidentChainTab
//   (cyber_incident).
// ProtectionRelayTestTab (/api/protection-relay-chain) has NO MERIDIAN_CHAINS descriptor →
//   Bucket B, EXTRACTED here (registered directly as an adapter — already a self-contained
//   no-prop widget).
// The inline SuiteTable tabs (accruals, settlement_invoices, carbon_credits, sites, devices,
//   faults, workorders, technicians, parts, maintenance, predictions, ingestion, projects,
//   alerts) were extracted to self-contained single-tab SuitePage bodies (identical behaviour).
// The remaining tabs (cockpit, opportunities, integrations, data_sources, participant_links)
//   are already-imported no-prop widgets → registered directly via adapters (no new file).
const EsumsAccruals = React.lazy(() => import('./surfaces/esumsom/AccrualsSurface'));
const EsumsSettlementInvoices = React.lazy(() => import('./surfaces/esumsom/SettlementInvoicesSurface'));
const EsumsCarbonCredits = React.lazy(() => import('./surfaces/esumsom/CarbonCreditsSurface'));
const EsumsSites = React.lazy(() => import('./surfaces/esumsom/SitesSurface'));
const EsumsDevices = React.lazy(() => import('./surfaces/esumsom/DevicesSurface'));
const EsumsFaults = React.lazy(() => import('./surfaces/esumsom/FaultsSurface'));
const EsumsWorkOrders = React.lazy(() => import('./surfaces/esumsom/WorkOrdersSurface'));
const EsumsTechnicians = React.lazy(() => import('./surfaces/esumsom/TechniciansSurface'));
const EsumsParts = React.lazy(() => import('./surfaces/esumsom/PartsSurface'));
const EsumsMaintenance = React.lazy(() => import('./surfaces/esumsom/MaintenanceSurface'));
const EsumsPredictions = React.lazy(() => import('./surfaces/esumsom/PredictionsSurface'));
const EsumsIngestion = React.lazy(() => import('./surfaces/esumsom/IngestionSurface'));
const EsumsProjects = React.lazy(() => import('./surfaces/esumsom/ProjectsSurface'));
const EsumsAlerts = React.lazy(() => import('./surfaces/esumsom/AlertsSurface'));

// Already-imported no-prop widgets → lazy adapters that ignore `role` and render unchanged.
const EsumsCockpit: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { EsumsOmCockpit } = await import('../components/widgets/EsumsOmCockpit');
  const Adapter: SurfaceComponent = () => <EsumsOmCockpit />;
  return { default: Adapter };
});
const EsumsOpportunities: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { EsumsOmOpportunities } = await import('../components/widgets/EsumsOmOpportunities');
  const Adapter: SurfaceComponent = () => <EsumsOmOpportunities />;
  return { default: Adapter };
});
const EsumsIntegrations: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { InverterIntegrationsTab } = await import('../components/esums/InverterIntegrationsTab');
  const Adapter: SurfaceComponent = () => <InverterIntegrationsTab />;
  return { default: Adapter };
});
const EsumsDataSources: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { DataSourcesTab } = await import('../components/esums/DataSourcesTab');
  const Adapter: SurfaceComponent = () => <DataSourcesTab />;
  return { default: Adapter };
});
const EsumsParticipantLinks: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { StationParticipantLinkTab } = await import('../components/esums/StationParticipantLinkTab');
  const Adapter: SurfaceComponent = () => <StationParticipantLinkTab />;
  return { default: Adapter };
});
// Bucket B — ProtectionRelayTestTab has no chain descriptor; register directly.
const EsumsProtectionRelayTests: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { ProtectionRelayTestTab } = await import('../components/esums/ProtectionRelayTestTab');
  const Adapter: SurfaceComponent = () => <ProtectionRelayTestTab />;
  return { default: Adapter };
});

// ── Trader surfaces (E2.3 — TraderWorkstationPage migration) ─────────────────
// Chain tabs WITH MERIDIAN_CHAINS descriptors → retired to /ledger/:chainKey (deleted from the
// husk): pretrade_credit_check, pnl_attribution, settlement_fail, benchmark_transition,
// fsca_compliance_report, fsca_conduct_report, cross_border_trade, isda_agreement.
// Plan-mandated EXCEPTION — trader ORDER surfaces are NOT chains: `orders` (/trading/orders),
// `exceptions` (/trading/exceptions) are EXTRACTED as Bucket B self-contained bodies, never
// retired as chains. `rejections` + `margin` are likewise non-chain listing bodies (Bucket B).
// `reports` is a ReportPanel surface (Bucket D). All four extracted to new files below.
// MmComplianceTab (W9) is a chain widget but `oe_mm_obligations` is deliberately EXCLUDED from
// MERIDIAN_CHAINS ("not a case-list model") → Bucket B, EXTRACTED here as an adapter (no new
// file); the roleData feature's chainKey was dropped in E2.3 so Atlas routes to /surface, not
// /ledger. RiskTab is a self-contained no-prop named export → adapter (no new file).
// strate-swift / sap-oracle-erp / government-filing — shared connectors, already exposed as
// `trader:*` via the connector trio above (roleData features added in E2.3 to reach them).
const TraderOrders = React.lazy(() => import('./surfaces/trader/OrdersSurface'));
const TraderRejections = React.lazy(() => import('./surfaces/trader/RejectionsSurface'));
const TraderMargin = React.lazy(() => import('./surfaces/trader/MarginSurface'));
const TraderExceptions = React.lazy(() => import('./surfaces/trader/ExceptionsSurface'));
const TraderReports = React.lazy(() => import('./surfaces/trader/ReportsSurface'));

// ── Support / OEM surfaces (E2.4 — SupportWorkstationPage migration) ─────────
// Chain tabs WITH MERIDIAN_CHAINS descriptors → retired to /ledger/:chainKey (deleted from the
// husk): ticket_chain (support_tickets W14), service_contracts (service_contract),
// service-request (service_request W104 — NOTE: support roleData has no feature with this
// chainKey, so the chain is unreachable from Atlas; reported), oem_fco (oem_fco), csat
// (csat_record W208 — the inline CsatLifecycleTab helper retired with it), sla_performance_reports
// (sla_performance_report W217 — the inline SlaPerformanceReportTab helper retired with it).
// Non-chain inline tabs EXTRACTED to self-contained `{ role }` bodies:
//   - tickets — inline CRUD listing (Bucket B), carries the FileTicketModal moved out of the husk.
//   - escalations — inline read-only listing (Bucket B).
//   - cross_tenant — inline POPIA CRUD listing (Bucket B).
//   - reports — ReportPanel surface (Bucket D); roleData `reports` feature added in E2.4.
// ML + connector tabs registered via the shared connector/ML trio adapters under keys matching
// support's real roleData feature keys (mqtt_opcua / anomaly_ml / rul_ml / fault_ml). The earlier
// placeholder slugs (support:mqtt-opcua / anomaly-detection / rul-prediction / fault-fingerprint)
// did NOT match any roleData feature key and were therefore UNREACHABLE — rekeyed in E2.4.
// The shared connector/ML component files are untouched (other roles register their own keys).
// audit → AuditPanel adapter (prefix /support, recon hint carried verbatim); roleData `audit`
// feature added in E2.4.
const SupportTickets = React.lazy(() => import('./surfaces/support/TicketsSurface'));
const SupportEscalations = React.lazy(() => import('./surfaces/support/EscalationsSurface'));
const SupportCrossTenant = React.lazy(() => import('./surfaces/support/CrossTenantSurface'));
const SupportReports = React.lazy(() => import('./surfaces/support/ReportsSurface'));

// Audit tab carried verbatim from the SupportWorkstationPage `audit` tab
// (prefix /support, cross-tenant recon hint + ticketing recon sources).
const SupportAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel
      prefix="/support"
      reconHint="external_ref,agent_email,tenant_accessed,accessed_at"
      reconSourceOptions={['zendesk', 'jira', 'freshdesk', 'manual']}
    />
  );
  return { default: Adapter };
});

// RiskTab + MmComplianceTab are self-contained no-prop named exports → lazy adapters that
// ignore `role` and render the tab unchanged.
const TraderRisk: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { RiskTab } = await import('../components/risk/RiskTab');
  const Adapter: SurfaceComponent = () => <RiskTab />;
  return { default: Adapter };
});
const TraderMmCompliance: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { MmComplianceTab } = await import('../components/trader/MmComplianceTab');
  const Adapter: SurfaceComponent = () => <MmComplianceTab />;
  return { default: Adapter };
});

// Audit tab carried verbatim from the TraderWorkstationPage `audit` tab
// (prefix /trading, trade-recon hint + counterparty/broker/jse recon sources).
const TraderAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel
      prefix="/trading"
      reconHint="external_ref,matched_at,energy_type,volume_mwh,price_zar_mwh"
      reconSourceOptions={['counterparty', 'broker', 'jse']}
    />
  );
  return { default: Adapter };
});

// ── Grid Operator surfaces (E2.5 — GridOpsWorkstationPage migration) ─────────
// Chain tabs WITH MERIDIAN_CHAINS descriptors → retired to /ledger/:chainKey (deleted from the
// husk): imbalance-settlement (imbalance_settlement), transmission-outage (transmission_outage),
// black_start (black_start), demand_response (demand_response_event W205), interconnector_schedules
// (interconnector_schedule W234), smart-meter-assets (smart_meter_asset W199), substation-assets
// (substation_asset W211), eop_activations (eop_activation W215). The first three already had a
// grid roleData feature with that chainKey; the latter five had NO roleData feature, so roleData
// features carrying those chainKeys were ADDED in E2.5 (service_request precedent) to keep the
// chains Atlas-reachable.
// Non-chain inline tabs EXTRACTED to self-contained `{ role }` bodies:
//   - curtailment — inline CRUD/event-log listing (Bucket B) → new file (roleData feature exists).
//   - ancillary — inline ancillary-event listing (Bucket B) → new file (distinct from the
//     reserve_activation W50 chain); roleData `ancillary` feature added in E2.5.
//   - outage — inline outage-response listing (Bucket B) → new file; roleData `outage` feature
//     added in E2.5.
//   - reports — ReportPanel surface (Bucket D) → new file; roleData `reports` feature added in E2.5.
// wheeling_charges — WheelingChargesTab is an already-imported standalone named export with only
//   optional props → registered directly via an adapter (no new file); roleData `wheeling_charges`
//   feature exists.
// scada / mqtt-opcua — shared connectors (NOT chains), already exposed as `grid_operator:scada`
//   and `grid_operator:mqtt-opcua` via the connector trio above; the earlier placeholder slugs did
//   NOT match any roleData feature key (UNREACHABLE) so grid roleData `scada` + `mqtt-opcua`
//   features were ADDED in E2.5 to reach them.
// audit → AuditPanel adapter (prefix /grid-operator, recon hint + recon sources carried verbatim);
//   roleData `audit` feature added in E2.5.
const GridCurtailment = React.lazy(() => import('./surfaces/grid/CurtailmentSurface'));
const GridAncillary = React.lazy(() => import('./surfaces/grid/AncillarySurface'));
const GridOutage = React.lazy(() => import('./surfaces/grid/OutageSurface'));
const GridReports = React.lazy(() => import('./surfaces/grid/ReportsSurface'));

// WheelingChargesTab is an already-imported standalone named export (optional `scope` prop,
// defaults to 'grid'); wrap in a lazy adapter that ignores `role` and renders the grid view.
const GridWheelingCharges: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { WheelingChargesTab } = await import('../components/grid/WheelingChargesTab');
  const Adapter: SurfaceComponent = () => <WheelingChargesTab scope="grid" />;
  return { default: Adapter };
});

// Audit tab carried verbatim from the GridOpsWorkstationPage `audit` tab
// (prefix /grid-operator, curtailment recon hint + eskom/nersa/so_internal recon sources).
const GridAuditPanel: React.LazyExoticComponent<SurfaceComponent> = React.lazy(async () => {
  const { AuditPanel } = await import('../components/launch/AuditPanel');
  const Adapter: SurfaceComponent = () => (
    <AuditPanel
      prefix="/grid-operator"
      reconHint="instruction_number,effective_from,target_mw,participant_id"
      reconSourceOptions={['eskom', 'nersa', 'so_internal']}
    />
  );
  return { default: Adapter };
});

// ── Registry ───────────────────────────────────────────────────────────────
export const SURFACE_REGISTRY: Record<
  string,
  React.LazyExoticComponent<SurfaceComponent> | SurfaceComponent
> = {
  // strate-swift → admin (roleData feature key `settlement_rails`),lender,offtaker,trader
  'admin:settlement_rails': StrateSwiftConnector,
  'lender:strate-swift': StrateSwiftConnector,
  'offtaker:strate-swift': StrateSwiftConnector,
  'trader:strate-swift': StrateSwiftConnector,
  // sap-oracle-erp → admin (roleData feature key `erp_connectors`),lender,offtaker,trader
  'admin:erp_connectors': SapOracleErpConnector,
  'lender:sap-oracle-erp': SapOracleErpConnector,
  'offtaker:sap-oracle-erp': SapOracleErpConnector,
  'trader:sap-oracle-erp': SapOracleErpConnector,
  // government-filing → admin (roleData feature key `filing_connectors`),lender,offtaker,trader,regulator
  'admin:filing_connectors': GovernmentFilingConnector,
  'lender:government-filing': GovernmentFilingConnector,
  'offtaker:government-filing': GovernmentFilingConnector,
  'trader:government-filing': GovernmentFilingConnector,
  'regulator:government-filing': GovernmentFilingConnector,
  // regulator roleData feature key is `government_filing` (underscore) — alias to same connector (E2.8d)
  'regulator:government_filing': GovernmentFilingConnector,
  // mqtt-opcua → grid_operator,support (roleData feature key `mqtt_opcua`),ipp_developer
  'grid_operator:mqtt-opcua': MqttOpcuaConnector,
  'support:mqtt_opcua': MqttOpcuaConnector,
  'ipp_developer:mqtt-opcua': MqttOpcuaConnector,
  // scada → grid_operator,ipp_developer
  'grid_operator:scada': ScadaConnector,
  'ipp_developer:scada': ScadaConnector,
  // anomaly-detection ML → admin (roleData feature key `anomaly_admin`),support (`anomaly_ml`),ipp_developer
  'admin:anomaly_admin': AnomalyDetectionMl,
  'support:anomaly_ml': AnomalyDetectionMl,
  'ipp_developer:anomaly-detection': AnomalyDetectionMl,
  // rul-prediction ML → admin (roleData feature key `rul_prediction_admin`),support (`rul_ml`),ipp_developer
  'admin:rul_prediction_admin': RulPredictionMl,
  'support:rul_ml': RulPredictionMl,
  'ipp_developer:rul-prediction': RulPredictionMl,
  // fault-fingerprint ML → admin (roleData feature key `fault_fingerprint_admin`),support (`fault_ml`),ipp_developer
  'admin:fault_fingerprint_admin': FaultFingerprintMl,
  'support:fault_ml': FaultFingerprintMl,
  'ipp_developer:fault-fingerprint': FaultFingerprintMl,
  // esco workstation migration (E2.8a) — keys match roleData feature keys emitted by Atlas
  'esco:sites-portfolio': EscoSitesPortfolio,
  'esco:audit': EscoAuditPanel,
  // epc_contractor workstation migration (E2.8b) — keys match roleData feature keys emitted by Atlas
  'epc_contractor:rfis': EpcRfis,
  'epc_contractor:technical-queries': EpcTechnicalQueries,
  'epc_contractor:audit': EpcAuditPanel,
  // carbon_fund workstation migration (E2.8c) — keys match roleData feature keys emitted by Atlas
  'carbon_fund:vintages': CarbonVintages,
  'carbon_fund:mrv': CarbonMrv,
  'carbon_fund:certificates': CarbonCertificates,
  'carbon_fund:reports': CarbonReports,
  'carbon_fund:audit': CarbonAuditPanel,
  // regulator workstation migration (E2.8d) — keys match roleData feature keys emitted by Atlas
  'regulator:inbox': RegulatorInbox,
  'regulator:notices': RegulatorNotices,
  'regulator:surveillance': RegulatorSurveillance,
  'regulator:licences': RegulatorLicences,
  'regulator:enforcement': RegulatorEnforcement,
  'regulator:icfr_attestations': RegulatorIcfrAttestations,
  'regulator:reports': RegulatorReports,
  'regulator:audit': RegulatorAuditPanel,
  // lender workstation migration (E2.8e) — keys match roleData feature keys emitted by Atlas.
  // strate-swift / sap-oracle-erp / government-filing already registered in the connector trio above.
  'lender:facilities': LenderFacilities,
  'lender:dunning': LenderDunning,
  'lender:reports': LenderReports,
  'lender:audit': LenderAuditPanel,
  // admin workstation migration (E2.1) — keys match roleData feature keys emitted by Atlas.
  // settlement_rails / erp_connectors / filing_connectors / anomaly_admin / rul_prediction_admin /
  // fault_fingerprint_admin are registered in the connector/ML trio above.
  'admin:tenant_events': AdminTenant,
  'admin:billing': AdminBilling,
  'admin:flags': AdminFlags,
  'admin:pii_access': AdminPiiAccess,
  'admin:monitoring': AdminCascadeDlq,
  'admin:subscription_billing': AdminSubscriptionBilling,
  'admin:popia': AdminDataSubjectRequest,
  'admin:reports': AdminReports,
  'admin:reconciliation_attestation': AdminReconciliationAttestation,
  'admin:settlement_audit': AdminSettlementAuditPanel,
  'admin:platform_audit': AdminPlatformAuditPanel,
  // esums O&M workstation migration (E2.2) — EsumsOmPage served to the `esco` role.
  // Keys match the esumsDomains feature keys emitted by Atlas (underscore tab keys → hyphen
  // feature slugs). `esco:sites-portfolio` + `esco:audit` were already registered in E2.8a.
  'esco:cockpit': EsumsCockpit,
  'esco:opportunities': EsumsOpportunities,
  'esco:accruals': EsumsAccruals,
  'esco:settlement-invoices': EsumsSettlementInvoices,
  'esco:carbon-credits': EsumsCarbonCredits,
  'esco:sites': EsumsSites,
  'esco:devices': EsumsDevices,
  'esco:faults': EsumsFaults,
  'esco:workorders': EsumsWorkOrders,
  'esco:technicians': EsumsTechnicians,
  'esco:parts': EsumsParts,
  'esco:maintenance': EsumsMaintenance,
  'esco:predictions': EsumsPredictions,
  'esco:ingestion': EsumsIngestion,
  'esco:integrations': EsumsIntegrations,
  'esco:data-sources': EsumsDataSources,
  'esco:participant-links': EsumsParticipantLinks,
  'esco:protection-relay-tests': EsumsProtectionRelayTests,
  'esco:projects': EsumsProjects,
  'esco:alerts': EsumsAlerts,
  // trader workstation migration (E2.3) — keys match roleData feature keys emitted by Atlas.
  // strate-swift / sap-oracle-erp / government-filing already registered in the connector trio
  // above (trader roleData features added in E2.3).
  'trader:orders': TraderOrders,
  'trader:rejections': TraderRejections,
  'trader:risk': TraderRisk,
  'trader:margin': TraderMargin,
  'trader:exceptions': TraderExceptions,
  'trader:oe_mm_obligations': TraderMmCompliance,
  'trader:reports': TraderReports,
  'trader:audit': TraderAuditPanel,
  // support / OEM workstation migration (E2.4) — keys match roleData feature keys emitted by Atlas.
  // mqtt_opcua / anomaly_ml / rul_ml / fault_ml are registered in the connector/ML trio above.
  'support:tickets': SupportTickets,
  'support:escalations': SupportEscalations,
  'support:cross_tenant': SupportCrossTenant,
  'support:reports': SupportReports,
  'support:audit': SupportAuditPanel,
  // grid_operator workstation migration (E2.5) — keys match roleData feature keys emitted by Atlas.
  // scada / mqtt-opcua are registered in the connector trio above.
  'grid_operator:curtailment': GridCurtailment,
  'grid_operator:ancillary': GridAncillary,
  'grid_operator:outage': GridOutage,
  'grid_operator:wheeling_charges': GridWheelingCharges,
  'grid_operator:reports': GridReports,
  'grid_operator:audit': GridAuditPanel,
};
