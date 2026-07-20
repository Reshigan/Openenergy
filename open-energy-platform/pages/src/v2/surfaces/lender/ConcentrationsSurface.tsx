// pages/src/meridian/surfaces/lender/ConcentrationsSurface.tsx
//
// Meridian surface — "Concentration limits" (lender role). Single-name / portfolio exposure
// view. There is no dedicated concentration-compute endpoint, so rather than fabricate
// Herfindahl / top-N math on an unknown schema (which would print wrong numbers), this surface
// presents the two real deep-book reads — expected credit loss (GET /api/lender-deep/ecl) and
// the watchlist (GET /api/lender-deep/watchlist) — under a SARB single-name limit reference
// banner so the analyst reads exposure against the regulated ceilings directly. Bucket B read
// surface. Registered as `lender:concentrations`, reached via the roleData feature key
// `concentrations`.
//
// Journey-shaped: each view leads with a KPI header derived client-side from the fetched rows
// (total exposure, coverage, largest single name, stage-2/3 or high-severity count) and the
// table is sorted worst-first — biggest single-name exposure / highest severity first — which is
// exactly the concentration lens the SARB limits below are read against. All columns preserved.
import React, { useState } from 'react';
import { AutoTable, KpiCard } from './_AutoTable';

const n = (v: any) => (Number(v) || 0);
const zarM = (v: number) => `R${v.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}m`;

// Stage 2/3 (or non-performing) is the credit-attention flag on the ECL book.
const eclAtRisk = (r: any) => {
  const st = String(r.stage ?? '');
  return /2|3|under|non|impair|loss|watch/i.test(st) && !/^1$|stage.?1|perform/i.test(st);
};

function EclHeader(rows: any[]) {
  const exposure = rows.reduce((s, r) => s + n(r.exposure_zar_m), 0);
  const ecl = rows.reduce((s, r) => s + n(r.ecl_zar_m), 0);
  const largest = rows.reduce((m, r) => Math.max(m, n(r.exposure_zar_m)), 0);
  const attention = rows.filter(eclAtRisk).length;
  const cov = exposure > 0 ? (ecl / exposure) * 100 : 0;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <KpiCard label="Total exposure" value={zarM(exposure)} sub={`${rows.length} name${rows.length === 1 ? '' : 's'}`} />
      <KpiCard label="Largest single name" value={zarM(largest)}
        sub={exposure > 0 ? `${((largest / exposure) * 100).toFixed(1)}% of book` : undefined} />
      <KpiCard label="Expected credit loss" value={zarM(ecl)} sub={`${cov.toFixed(1)}% coverage`} />
      <KpiCard label="Need attention" value={String(attention)} sub="stage 2 / 3" accent={attention > 0} />
    </div>
  );
}

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const sevRank = (r: any) => SEV_RANK[String(r.severity ?? '').toLowerCase()] ?? 0;
const wlOpen = (r: any) => !/resolved|closed|cured|cleared/i.test(String(r.status ?? ''));

function WatchlistHeader(rows: any[]) {
  const open = rows.filter(wlOpen).length;
  const severe = rows.filter((r) => sevRank(r) >= 3).length;
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <KpiCard label="On watchlist" value={String(rows.length)} />
      <KpiCard label="Open" value={String(open)} sub="unresolved" accent={open > 0} />
      <KpiCard label="High / critical" value={String(severe)} accent={severe > 0} />
    </div>
  );
}

export default function ConcentrationsSurface(_props: { role: string }) {
  const [view, setView] = useState<'ecl' | 'watchlist'>('ecl');
  return (
    <div>
      <div className="rounded-lg border border-[var(--amber)] bg-[var(--amber-tint)] px-4 py-3 mb-3 text-[12px] text-[var(--amber-deep)]">
        <span className="font-semibold">SARB single-name concentration limits</span> — exposure to a single
        counterparty is capped at <span className="font-semibold">10%</span> of qualifying capital (large-exposure
        reporting at <span className="font-semibold">10%</span>, hard limit <span className="font-semibold">25%</span>;
        connected-party group <span className="font-semibold">15%</span>). Read the books below against these ceilings.
      </div>

      <div className="flex gap-1 mb-3">
        {(['ecl', 'watchlist'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={view === v ? 'btn pri' : 'btn ghost'}>
            {v === 'ecl' ? 'Expected credit loss' : 'Watchlist'}
          </button>
        ))}
      </div>

      {view === 'ecl'
        ? <AutoTable endpoint="/lender-deep/ecl"
            empty="No ECL exposures. Per-name expected-credit-loss staging appears here once the deep-book ECL engine has run against your funded exposures."
            prefer={['project_name', 'borrower_name', 'stage', 'exposure_zar_m', 'ecl_zar_m', 'pd_pct', 'lgd_pct']}
            header={EclHeader}
            sortBy={(a, b) => n(b.exposure_zar_m) - n(a.exposure_zar_m)} />
        : <AutoTable endpoint="/lender-deep/watchlist"
            empty="Watchlist clear — no names are currently flagged. Borrowers breaching early-warning triggers appear here, highest severity first."
            prefer={['project_name', 'borrower_name', 'reason', 'severity', 'status']}
            header={WatchlistHeader}
            sortBy={(a, b) => sevRank(b) - sevRank(a)} />}
    </div>
  );
}
