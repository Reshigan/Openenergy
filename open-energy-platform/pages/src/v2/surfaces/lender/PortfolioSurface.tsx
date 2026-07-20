// pages/src/meridian/surfaces/lender/PortfolioSurface.tsx
//
// Meridian surface — "Loan portfolio" (lender role). Capital-structure view of the book:
// DSRA / reserve accounts (GET /api/lender/reserves) and project cash-flow waterfalls
// (GET /api/lender/waterfalls), toggled by a sub-view switch. Distinct from `lender:lender_risk`
// (covenant / dunning management) and `lender:concentrations` (exposure limits). Bucket B read
// surface. Registered as `lender:portfolio` in surfaces.tsx, reached from Atlas (⌘K) via the
// roleData feature key `portfolio`.
//
// Journey-shaped: each view leads with a KPI header (totals + a "N underfunded/at-risk need
// attention" flag) derived client-side from the rows already fetched, and the table is sorted
// worst-first (biggest funding shortfall / largest allocation). All columns preserved.
import React, { useState } from 'react';
import { AutoTable, KpiCard } from './_AutoTable';

const n = (v: any) => (Number(v) || 0);
const zarM = (v: number) => `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}m`;

// A reserve is "attention" if funded below required, or its status reads unfunded/breach.
const reserveShortfall = (r: any) => n(r.required_amount_zar_m) - n(r.funded_amount_zar_m);
const reserveAtRisk = (r: any) =>
  reserveShortfall(r) > 0 || /unfunded|breach|short|deficit/i.test(String(r.status ?? ''));

function ReservesHeader(rows: any[]) {
  const required = rows.reduce((s, r) => s + n(r.required_amount_zar_m), 0);
  const funded = rows.reduce((s, r) => s + n(r.funded_amount_zar_m), 0);
  const attention = rows.filter(reserveAtRisk).length;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <KpiCard label="Reserve accounts" value={String(rows.length)} />
      <KpiCard label="Required" value={zarM(required)} />
      <KpiCard label="Funded" value={zarM(funded)} sub={`shortfall ${zarM(Math.max(0, required - funded))}`} />
      <KpiCard label="Need attention" value={String(attention)} sub="underfunded / breach" accent={attention > 0} />
    </div>
  );
}

function WaterfallsHeader(rows: any[]) {
  const allocation = rows.reduce((s, r) => s + n(r.allocation_zar_m), 0);
  const balance = rows.reduce((s, r) => s + n(r.balance_zar_m), 0);
  const attention = rows.filter((r) => /breach|default|short|fail|miss/i.test(String(r.status ?? ''))).length;
  const projects = new Set(rows.map((r) => r.project_name ?? r.id)).size;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <KpiCard label="Waterfall tiers" value={String(rows.length)} sub={`${projects} project${projects === 1 ? '' : 's'}`} />
      <KpiCard label="Allocated" value={zarM(allocation)} />
      <KpiCard label="Balance" value={zarM(balance)} />
      <KpiCard label="Need attention" value={String(attention)} sub="tiers in breach" accent={attention > 0} />
    </div>
  );
}

export default function PortfolioSurface(_props: { role: string }) {
  const [view, setView] = useState<'reserves' | 'waterfalls'>('reserves');
  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(['reserves', 'waterfalls'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={view === v ? 'btn pri' : 'btn ghost'}>
            {v === 'reserves' ? 'Reserve accounts' : 'Cash-flow waterfalls'}
          </button>
        ))}
      </div>
      {view === 'reserves'
        ? <AutoTable endpoint="/lender/reserves"
            empty="No reserve accounts yet. DSRA and other reserve accounts appear here once your projects are funded and reserve schedules are loaded."
            prefer={['project_name', 'reserve_type', 'required_amount_zar_m', 'funded_amount_zar_m', 'status']}
            header={ReservesHeader}
            sortBy={(a, b) => reserveShortfall(b) - reserveShortfall(a)} />
        : <AutoTable endpoint="/lender/waterfalls"
            empty="No waterfalls configured. Project cash-flow waterfalls appear here once distribution tiers are defined for your funded projects."
            prefer={['project_name', 'period', 'tier', 'allocation_zar_m', 'balance_zar_m', 'status']}
            header={WaterfallsHeader}
            sortBy={(a, b) => n(b.allocation_zar_m) - n(a.allocation_zar_m)} />}
    </div>
  );
}
