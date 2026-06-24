// pages/src/meridian/HorizonKpis.tsx — role headline KPI band atop Horizon.
// Each tile is the most important live number for the role and deep-links to the
// surface/ledger that holds the detail (the "redirect to the model" the brief asks
// for). Data is the existing role-aware /cockpit/stats (no new backend). The band
// is a pure enhancement: any fetch failure or missing role spec renders nothing,
// so Horizon never depends on it.
import React from 'react';
import { Link } from 'react-router-dom';
import { fetchRoleStats, fmtZar, type RoleStats } from './lib';

interface KpiTile { stat: string; label: string; to: string; money?: boolean; alert?: boolean }

// Per-role tiles. `stat` resolves from role_national first, then the top-level
// stats block (where the one-shot follow-ups like projects_count/open_orders/
// pending_kyc live). `to` points at a registered /surface or a chain /ledger —
// both already routed. `alert` only tints when the value is > 0.
const KPI_SPECS: Record<string, KpiTile[]> = {
  trader: [
    { stat: 'positions', label: 'Open positions', to: '/surface/trader:positions' },
    { stat: 'unrealised_pnl_zar', label: 'Unrealised P&L', to: '/surface/trader:positions', money: true },
    { stat: 'open_orders', label: 'Open orders', to: '/surface/trader:orders' },
    { stat: 'open_margin_calls', label: 'Margin calls', to: '/surface/trader:margin', alert: true },
    { stat: 'margin_shortfall_zar', label: 'Margin shortfall', to: '/surface/trader:margin', money: true, alert: true },
  ],
  lender: [
    { stat: 'active_covenants', label: 'Active covenants', to: '/surface/lender:covenant_reports' },
    { stat: 'covenant_breaches_30d', label: 'Breaches (30d)', to: '/ledger/covenant_certificate', alert: true },
    { stat: 'covenant_warns_30d', label: 'Warnings (30d)', to: '/ledger/covenant_certificate' },
    { stat: 'ie_certs_pending_review', label: 'IE certs to review', to: '/surface/lender:ie_certifications' },
    { stat: 'waivers_pending', label: 'Waivers pending', to: '/surface/lender:covenant_reports', alert: true },
  ],
  ipp_developer: [
    { stat: 'projects_count', label: 'Projects', to: '/surface/ipp_developer:projects' },
    { stat: 'active_epc', label: 'Active EPC', to: '/surface/ipp_developer:milestones' },
    { stat: 'pending_epc_variations', label: 'EPC variations', to: '/surface/ipp_developer:milestones' },
    { stat: 'insurance_expiring_90d', label: 'Insurance expiring', to: '/surface/ipp_developer:insurance', alert: true },
    { stat: 'community_follow_ups_14d', label: 'Community follow-ups', to: '/surface/ipp_developer:community' },
  ],
  offtaker: [
    { stat: 'active_recs', label: 'Active RECs', to: '/surface/offtaker:rec_retirement' },
    { stat: 'active_rec_mwh', label: 'REC MWh', to: '/surface/offtaker:rec_retirement' },
    { stat: 'site_groups', label: 'Site groups', to: '/surface/offtaker:sites' },
    { stat: 'delivery_points', label: 'Delivery points', to: '/surface/offtaker:metering' },
    { stat: 'published_scope2', label: 'Scope 2 published', to: '/surface/offtaker:reports' },
  ],
  carbon_fund: [
    { stat: 'credits_active', label: 'Active credits', to: '/surface/carbon_fund:vintages' },
    { stat: 'vintages', label: 'Vintages', to: '/surface/carbon_fund:vintages' },
    { stat: 'mrv_pending', label: 'MRV pending', to: '/surface/carbon_fund:mrv', alert: true },
    { stat: 'verified_90d', label: 'Verified (90d)', to: '/surface/carbon_fund:mrv' },
    { stat: 'tax_claims_submitted', label: 'Tax claims', to: '/surface/carbon_fund:certificates' },
  ],
  regulator: [
    { stat: 'active_licences', label: 'Active licences', to: '/surface/regulator:licences' },
    { stat: 'licences_expiring', label: 'Expiring (90d)', to: '/surface/regulator:licences', alert: true },
    { stat: 'pending_tariff', label: 'Tariff submissions', to: '/surface/regulator:notices' },
    { stat: 'open_cases', label: 'Enforcement cases', to: '/surface/regulator:enforcement', alert: true },
    { stat: 'open_alerts', label: 'Surveillance alerts', to: '/surface/regulator:surveillance' },
    { stat: 'critical_alerts', label: 'Critical alerts', to: '/surface/regulator:surveillance', alert: true },
  ],
  esco: [
    { stat: 'predictive_savings_zar', label: 'Predictive savings', to: '/surface/esco:predictions', money: true },
    { stat: 'open_faults', label: 'Open faults', to: '/surface/esco:faults', alert: true },
    { stat: 'critical_faults', label: 'Critical faults', to: '/surface/esco:faults', alert: true },
    { stat: 'nearest_rul_days', label: 'Nearest RUL (days)', to: '/surface/esco:predictions' },
    { stat: 'availability_open', label: 'Availability cases', to: '/ledger/availability_guarantee' },
    { stat: 'permits_active', label: 'Active permits', to: '/ledger/permit_to_work' },
  ],
  support: [
    { stat: 'open_tickets', label: 'Open tickets', to: '/surface/support:tickets' },
    { stat: 'critical_tickets', label: 'Critical tickets', to: '/surface/support:tickets', alert: true },
    { stat: 'open_escalations', label: 'Open escalations', to: '/surface/support:escalations', alert: true },
    { stat: 'open_problems', label: 'Open problems', to: '/ledger/problem_record' },
    { stat: 'changes_in_flight', label: 'Changes in flight', to: '/ledger/change_request' },
    { stat: 'vital_parts_open', label: 'Vital parts at risk', to: '/ledger/spare_parts_provisioning', alert: true },
  ],
  grid_operator: [
    { stat: 'schedules_today', label: 'Schedules today', to: '/surface/grid_operator:scada' },
    { stat: 'instructions_pending_ack', label: 'Instructions to ack', to: '/surface/grid_operator:scada', alert: true },
    { stat: 'active_curtailments', label: 'Active curtailments', to: '/surface/grid_operator:curtailment', alert: true },
    { stat: 'active_outages', label: 'Active outages', to: '/surface/grid_operator:outage', alert: true },
    { stat: 'open_tenders', label: 'Ancillary tenders', to: '/surface/grid_operator:ancillary' },
  ],
  admin: [
    { stat: 'active_tenants', label: 'Active tenants', to: '/surface/admin:users' },
    { stat: 'provisioning_pending', label: 'Provisioning pending', to: '/surface/admin:users', alert: true },
    { stat: 'active_subscriptions', label: 'Subscriptions', to: '/surface/admin:subscription_billing' },
    { stat: 'outstanding_platform_invoices', label: 'Outstanding invoices', to: '/surface/admin:billing', alert: true },
    { stat: 'outstanding_platform_zar', label: 'Outstanding', to: '/surface/admin:billing', money: true },
    { stat: 'pending_kyc', label: 'KYC pending', to: '/surface/admin:users', alert: true },
    { stat: 'failed_settlement_runs_7d', label: 'Failed settlements (7d)', to: '/surface/admin:settlement_audit', alert: true },
  ],
};

function resolve(stats: RoleStats, key: string): number | undefined {
  const nat = stats.role_national;
  if (nat && typeof nat[key] === 'number') return nat[key];
  const top = stats[key];
  return typeof top === 'number' ? top : undefined;
}

// Per-role memory of whether this role's band has ever carried a non-zero value.
// Drives whether we render a loading skeleton: only show the skeleton (which
// reserves space) when we expect data, so an empty account never flashes a
// skeleton that then collapses to nothing. Worst case is one first-ever pop-in.
function bandFlagKey(role: string): string { return `mer.kpi.has.${role}`; }
function expectsBandData(role: string): boolean {
  try { return localStorage.getItem(bandFlagKey(role)) === '1'; } catch { return false; }
}

export function HorizonKpis({ role }: { role: string }) {
  const spec = KPI_SPECS[role];
  const [stats, setStats] = React.useState<RoleStats | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!spec) return undefined;
    let live = true;
    setStats(null); setFailed(false);
    fetchRoleStats().then(s => {
      if (!live) return;
      setStats(s);
      // Record whether the band will carry signal, so the next mount knows
      // whether to reserve skeleton space.
      const any = spec.some(t => { const v = resolve(s, t.stat); return typeof v === 'number' && v !== 0; });
      try { localStorage.setItem(bandFlagKey(role), any ? '1' : '0'); } catch { /* non-fatal */ }
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [role, spec]);

  if (!spec || failed) return null;
  // Loading: render a skeleton band the same height/width as the real one so the
  // board never jumps down when stats arrive (the band is a fixed-height strip).
  // Only when we expect data — an empty account renders nothing and never flashes.
  if (!stats) {
    if (!expectsBandData(role)) return null;
    return (
      <div className="kpi-band" aria-busy="true" role="status" aria-label="Loading role metrics">
        {spec.map(t => (
          <div key={t.stat} className="kpi-tile kpi-skel" aria-hidden="true">
            <span className="skel skel-line lg" style={{ width: '60%', margin: 0 }} />
            <span className="skel skel-line sm" style={{ width: '85%', margin: '6px 0 0' }} />
          </div>
        ))}
      </div>
    );
  }
  // Drop tiles whose backing stat is absent (older deploy / not this role).
  const tiles = spec
    .map(t => ({ t, v: resolve(stats, t.stat) }))
    .filter((x): x is { t: KpiTile; v: number } => x.v !== undefined);
  if (!tiles.length) return null;
  // Day-one suppression: an all-zeros band is nav-to-empty — no signal, and it
  // competes with the GettingStarted activation card for "what do I do next".
  // A truly empty account's nav IS the checklist. The moment any record lands a
  // count goes non-zero and the band reappears on its own (progressive disclosure).
  if (tiles.every(({ v }) => v === 0)) return null;

  return (
    <div className="kpi-band" role="navigation" aria-label="Role headline metrics">
      {tiles.map(({ t, v }) => (
        <Link key={t.stat} to={t.to} className={t.alert && v > 0 ? 'kpi-tile alert' : 'kpi-tile'}
              title={`Open ${t.label}`}>
          <span className="kpi-v">{t.money ? fmtZar(v) : v.toLocaleString('en-ZA')}</span>
          <span className="kpi-l">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}
