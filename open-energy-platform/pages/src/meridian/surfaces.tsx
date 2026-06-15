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

// ── Registry ───────────────────────────────────────────────────────────────
export const SURFACE_REGISTRY: Record<
  string,
  React.LazyExoticComponent<SurfaceComponent> | SurfaceComponent
> = {
  // strate-swift → admin,lender,offtaker,trader
  'admin:strate-swift': StrateSwiftConnector,
  'lender:strate-swift': StrateSwiftConnector,
  'offtaker:strate-swift': StrateSwiftConnector,
  'trader:strate-swift': StrateSwiftConnector,
  // sap-oracle-erp → admin,lender,offtaker,trader
  'admin:sap-oracle-erp': SapOracleErpConnector,
  'lender:sap-oracle-erp': SapOracleErpConnector,
  'offtaker:sap-oracle-erp': SapOracleErpConnector,
  'trader:sap-oracle-erp': SapOracleErpConnector,
  // government-filing → admin,lender,offtaker,trader,regulator
  'admin:government-filing': GovernmentFilingConnector,
  'lender:government-filing': GovernmentFilingConnector,
  'offtaker:government-filing': GovernmentFilingConnector,
  'trader:government-filing': GovernmentFilingConnector,
  'regulator:government-filing': GovernmentFilingConnector,
  // regulator roleData feature key is `government_filing` (underscore) — alias to same connector (E2.8d)
  'regulator:government_filing': GovernmentFilingConnector,
  // mqtt-opcua → grid_operator,support,ipp_developer
  'grid_operator:mqtt-opcua': MqttOpcuaConnector,
  'support:mqtt-opcua': MqttOpcuaConnector,
  'ipp_developer:mqtt-opcua': MqttOpcuaConnector,
  // scada → grid_operator,ipp_developer
  'grid_operator:scada': ScadaConnector,
  'ipp_developer:scada': ScadaConnector,
  // anomaly-detection ML → admin,support,ipp_developer
  'admin:anomaly-detection': AnomalyDetectionMl,
  'support:anomaly-detection': AnomalyDetectionMl,
  'ipp_developer:anomaly-detection': AnomalyDetectionMl,
  // rul-prediction ML → admin,support,ipp_developer
  'admin:rul-prediction': RulPredictionMl,
  'support:rul-prediction': RulPredictionMl,
  'ipp_developer:rul-prediction': RulPredictionMl,
  // fault-fingerprint ML → admin,support,ipp_developer
  'admin:fault-fingerprint': FaultFingerprintMl,
  'support:fault-fingerprint': FaultFingerprintMl,
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
};
