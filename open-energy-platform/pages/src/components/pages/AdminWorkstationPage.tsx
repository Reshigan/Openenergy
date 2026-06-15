import React from 'react';
import { WorkstationShell } from '../launch/WorkstationShell';
import type { TourDef } from '../launch/ProductTour';

// E2.1 — AdminWorkstationPage husk. Every tab has migrated to the Meridian model:
//   • Chain tabs (audit_chain_block W118, regulator_export_pack W119, control_environment_audit
//     W121, kyc_verification W198) → /ledger/:chainKey via their roleData feature chainKey.
//   • Non-chain tabs (tenant_events, billing, flags, pii_access, monitoring/Cascade-DLQ,
//     subscription_billing W228, popia/DSR W233, reports, reconciliation_attestation W120,
//     settlement_audit, platform_audit) → standalone /surface/:key surfaces registered in
//     pages/src/meridian/surfaces.tsx and reached from Atlas (⌘K).
//   • Shared connectors/ML (settlement_rails, erp_connectors, filing_connectors, anomaly_admin,
//     rul_prediction_admin, fault_fingerprint_admin) → /surface/:key via the connector/ML adapters.
// The page is retained as an empty shell (tabs={[]}) so existing routes still resolve.

const ADMIN_TOUR: TourDef = {
  id: 'admin-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Platform admin workstation', body: 'Full platform administration — tenant onboarding, KYC, feature flags, billing, user management, system health, and audit exports.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Platform KPIs', body: 'Active tenants, pending KYC reviews, system health, and invoice collection rates. Platform health is your responsibility.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Admin tabs', body: 'Tenants, KYC, users, billing, features, connectors, and platform audit — each backed by live workflows with full audit trail.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Onboard a new tenant, complete a KYC review, or configure a feature flag with guided step-by-step workflows.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all admin actions including settlement configuration, rate-limit management, and regulatory export pack generation.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'KYC escalations, billing disputes, and system alerts from all roles surface here for your action.', placement: 'left' },
  ],
};

export function AdminWorkstationPage() {
  return (
    <WorkstationShell
      role="admin"
      tour={ADMIN_TOUR}
      eyebrow="Admin · Workstation"
      title="Platform admin workstation"
      subtitle="Tenant onboarding → Platform config → Revenue & billing → Audit & compliance → System health"
      backHref="/admin-platform"
      backLabel="Admin platform"
      tabs={[]}
    />
  );
}
