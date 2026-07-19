// pages/src/meridian/HorizonKpis.tsx — role headline KPI band atop Horizon.
// Each tile is the most important live number for the role and deep-links to the
// surface/ledger that holds the detail (the "redirect to the model" the brief asks
// for). Data is the existing role-aware /cockpit/stats (no new backend). The band
// is a pure enhancement: any fetch failure or missing role spec renders nothing,
// so Horizon never depends on it.
import React from 'react';
import { Link } from 'react-router-dom';
import { fetchRoleStats, fmtZar, type RoleStats } from '../shared/lib';

// `warn`/`crit` are thresholds that tint a tile amber/red. `lowBad` flips the
// comparison (tint when the value drops BELOW the threshold — e.g. delivered %,
// availability). `unit` drives formatting: zar money, tco2e tonnage, else count.
interface KpiTile {
  stat: string; label: string; to: string;
  unit?: 'zar' | 'tco2e';
  warn?: number; crit?: number; lowBad?: boolean;
}

// Per-role tiles. `stat` resolves from role_national first, then the top-level
// stats block (where the one-shot follow-ups like projects_count/open_orders/
// pending_kyc live). `to` points at a registered /surface or a chain /ledger.
const KPI_SPECS: Record<string, KpiTile[]> = {
  trader: [
    { stat: 'positions', label: 'Open positions', to: '/surface/trader:positions' },
    { stat: 'net_exposure_mwh', label: 'Net exposure MWh', to: '/surface/trader:positions' },
    { stat: 'unrealised_pnl_zar', label: 'Unrealised P&L', to: '/surface/trader:positions', unit: 'zar' },
    { stat: 'open_orders', label: 'Open orders', to: '/surface/trader:orders' },
    { stat: 'open_margin_calls', label: 'Margin calls', to: '/surface/trader:margin', warn: 1, crit: 3 },
    { stat: 'margin_shortfall_zar', label: 'Margin shortfall', to: '/surface/trader:margin', unit: 'zar', warn: 1 },
  ],
  lender: [
    { stat: 'active_covenants', label: 'Active covenants', to: '/surface/lender:covenant_reports' },
    { stat: 'covenant_breaches_30d', label: 'Breaches (30d)', to: '/ledger/covenant_certificate', warn: 1, crit: 3 },
    { stat: 'covenant_warns_30d', label: 'Warnings (30d)', to: '/ledger/covenant_certificate' },
    { stat: 'ie_certs_pending_review', label: 'IE certs to review', to: '/surface/lender:ie_certifications' },
    { stat: 'waivers_pending', label: 'Waivers pending', to: '/surface/lender:covenant_reports', warn: 1 },
  ],
  ipp_developer: [
    { stat: 'projects_count', label: 'Projects', to: '/surface/ipp_developer:projects' },
    { stat: 'generation_mwh', label: 'Generation MWh', to: '/surface/ipp_developer:plant_revenue' },
    { stat: 'settlement_paid_zar', label: 'Settled revenue', to: '/surface/ipp_developer:plant_revenue', unit: 'zar' },
    { stat: 'settlement_outstanding_zar', label: 'Outstanding', to: '/surface/ipp_developer:plant_revenue', unit: 'zar' },
    { stat: 'sites_settling', label: 'Sites settling', to: '/surface/ipp_developer:plant_revenue' },
    { stat: 'active_epc', label: 'Active EPC', to: '/surface/ipp_developer:milestones' },
    { stat: 'pending_epc_variations', label: 'EPC variations', to: '/surface/ipp_developer:milestones' },
    { stat: 'insurance_expiring_90d', label: 'Insurance expiring', to: '/surface/ipp_developer:insurance', warn: 1 },
    { stat: 'community_follow_ups_14d', label: 'Community follow-ups', to: '/surface/ipp_developer:community' },
  ],
  offtaker: [
    { stat: 'ppa_annual_zar', label: 'Annual PPA value', to: '/surface/offtaker:ppa_portfolio', unit: 'zar' },
    // delivered_pct (run-rate vs expected-to-date) is dropped from the band: with
    // partial telemetry coverage (not every site reports every elapsed day) a low %
    // reads as under-delivery when it's a coverage artifact (Goldrush showed 27% off
    // a ramp window). delivered_mwh is the honest headline — real metered energy from
    // om_telemetry, and its drill-through (/surface/offtaker:metering) reads the SAME
    // source. ponytail: re-introduce a % tile only once backend gates it on a full
    // billing month per site.
    { stat: 'delivered_mwh', label: 'Delivered MWh', to: '/surface/offtaker:metering' },
    { stat: 'carbon_tco2e', label: 'Carbon offset', to: '/surface/offtaker:reports', unit: 'tco2e' },
    { stat: 'ppa_contracted_mwh_yr', label: 'Contracted MWh/yr', to: '/surface/offtaker:ppa_portfolio' },
  ],
  carbon_fund: [
    { stat: 'credits_active', label: 'Active credits', to: '/surface/carbon_fund:vintages', unit: 'tco2e' },
    { stat: 'vintages', label: 'Vintages', to: '/surface/carbon_fund:vintages' },
    { stat: 'mrv_pending', label: 'MRV pending', to: '/surface/carbon_fund:mrv', warn: 1 },
    { stat: 'verified_90d', label: 'Verified (90d)', to: '/surface/carbon_fund:mrv' },
    { stat: 'tax_claims_submitted', label: 'Tax claims', to: '/surface/carbon_fund:certificates' },
  ],
  regulator: [
    { stat: 'active_licences', label: 'Active licences', to: '/surface/regulator:licences' },
    { stat: 'licences_expiring', label: 'Expiring (90d)', to: '/surface/regulator:licences', warn: 1 },
    { stat: 'pending_tariff', label: 'Tariff submissions', to: '/surface/regulator:notices' },
    { stat: 'open_cases', label: 'Enforcement cases', to: '/surface/regulator:enforcement', warn: 1 },
    { stat: 'open_alerts', label: 'Surveillance alerts', to: '/surface/regulator:surveillance' },
    { stat: 'critical_alerts', label: 'Critical alerts', to: '/surface/regulator:surveillance', warn: 1, crit: 1 },
  ],
  esco: [
    { stat: 'predictive_savings_zar', label: 'Predictive savings', to: '/surface/esco:predictions', unit: 'zar' },
    { stat: 'open_faults', label: 'Open faults', to: '/surface/esco:faults', warn: 1 },
    { stat: 'critical_faults', label: 'Critical faults', to: '/surface/esco:faults', warn: 1, crit: 1 },
    { stat: 'nearest_rul_days', label: 'Nearest RUL (days)', to: '/surface/esco:predictions', lowBad: true, warn: 30, crit: 7 },
    { stat: 'pm_open', label: 'PM open', to: '/ledger/pm_compliance' },
    { stat: 'pr_cases_open', label: 'PR cases', to: '/ledger/pr_chain', warn: 1 },
    { stat: 'availability_open', label: 'Availability cases', to: '/ledger/availability_guarantee' },
    { stat: 'permits_active', label: 'Active permits', to: '/ledger/permit_to_work' },
  ],
  support: [
    { stat: 'open_tickets', label: 'Open tickets', to: '/surface/support:tickets' },
    { stat: 'critical_tickets', label: 'Critical tickets', to: '/surface/support:tickets', warn: 1, crit: 1 },
    { stat: 'open_escalations', label: 'Open escalations', to: '/surface/support:escalations', warn: 1 },
    { stat: 'open_problems', label: 'Open problems', to: '/ledger/problem_record' },
    { stat: 'changes_in_flight', label: 'Changes in flight', to: '/ledger/change_request' },
    { stat: 'vital_parts_open', label: 'Vital parts at risk', to: '/ledger/spare_parts_provisioning', warn: 1, crit: 1 },
  ],
  grid_operator: [
    { stat: 'schedules_today', label: 'Schedules today', to: '/surface/grid_operator:scada' },
    { stat: 'instructions_pending_ack', label: 'Instructions to ack', to: '/surface/grid_operator:scada', warn: 1 },
    { stat: 'non_compliant', label: 'Non-compliant', to: '/surface/grid_operator:scada', warn: 1, crit: 5 },
    { stat: 'in_flight_connections', label: 'Connections in flight', to: '/surface/grid_operator:scada' },
    { stat: 'active_curtailments', label: 'Active curtailments', to: '/surface/grid_operator:curtailment', warn: 1 },
    { stat: 'active_outages', label: 'Active outages', to: '/surface/grid_operator:outage', warn: 1 },
    { stat: 'open_tenders', label: 'Ancillary tenders', to: '/surface/grid_operator:ancillary' },
  ],
  admin: [
    { stat: 'active_tenants', label: 'Active tenants', to: '/surface/admin:users' },
    { stat: 'provisioning_pending', label: 'Provisioning pending', to: '/surface/admin:users', warn: 1 },
    { stat: 'active_subscriptions', label: 'Subscriptions', to: '/surface/admin:subscription_billing' },
    { stat: 'outstanding_platform_invoices', label: 'Outstanding invoices', to: '/surface/admin:billing', warn: 1 },
    { stat: 'outstanding_platform_zar', label: 'Outstanding', to: '/surface/admin:billing', unit: 'zar' },
    { stat: 'pending_kyc', label: 'KYC pending', to: '/surface/admin:users', warn: 1 },
    { stat: 'failed_settlement_runs_7d', label: 'Failed settlements (7d)', to: '/surface/admin:settlement_audit', warn: 1, crit: 1 },
  ],
};

// Oversight roles read zero as an affirmative "all clear" — a regulator's empty
// enforcement queue is good news worth showing, not noise to hide. Everyone else
// gets zero-count tiles suppressed (progressive disclosure).
const OVERSIGHT = new Set(['regulator', 'admin']);

function resolve(stats: RoleStats, key: string): number | undefined {
  const nat = stats.role_national;
  if (nat && typeof nat[key] === 'number') return nat[key];
  const top = stats[key];
  return typeof top === 'number' ? top : undefined;
}

// null | 'warn' (amber) | 'crit' (red). lowBad flips the comparison so a falling
// metric (delivered %, RUL days) trips on the way DOWN.
function severity(v: number, t: KpiTile): 'crit' | 'warn' | null {
  if (t.lowBad) {
    if (t.crit != null && v <= t.crit) return 'crit';
    if (t.warn != null && v <= t.warn) return 'warn';
    return null;
  }
  if (t.crit != null && v >= t.crit) return 'crit';
  if (t.warn != null && v >= t.warn) return 'warn';
  return null;
}

function fmtVal(v: number, unit?: KpiTile['unit']): string {
  if (unit === 'zar') return fmtZar(v);
  if (unit === 'tco2e') return `${v.toLocaleString('en-ZA')} tCO₂e`;
  return v.toLocaleString('en-ZA');
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
  // Per-tile zero-suppression: a zero count is nav-to-empty noise for working
  // roles, so hide it — but keep zero for oversight roles (zero = all-clear) and
  // for lowBad tiles (0% delivered is the worst case, not "no data").
  const shown = OVERSIGHT.has(role)
    ? tiles
    : tiles.filter(({ t, v }) => v !== 0 || t.lowBad);
  if (!shown.length) return null;

  return (
    <div className="kpi-band" role="navigation" aria-label="Role headline metrics">
      {shown.map(({ t, v }) => {
        const sev = severity(v, t);
        const cls = sev === 'crit' ? 'kpi-tile alert crit' : sev === 'warn' ? 'kpi-tile alert' : 'kpi-tile';
        return (
          <Link key={t.stat} to={t.to} className={cls} title={`Open ${t.label}`}>
            <span className="kpi-v">{fmtVal(v, t.unit)}</span>
            <span className="kpi-l">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
