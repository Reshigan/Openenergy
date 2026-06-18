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
import React, { useState } from 'react';
import { AutoTable } from './_AutoTable';

export default function ConcentrationsSurface(_props: { role: string }) {
  const [view, setView] = useState<'ecl' | 'watchlist'>('ecl');
  return (
    <div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-3 text-[12px] text-amber-900">
        <span className="font-semibold">SARB single-name concentration limits</span> — exposure to a single
        counterparty is capped at <span className="font-semibold">10%</span> of qualifying capital (large-exposure
        reporting at <span className="font-semibold">10%</span>, hard limit <span className="font-semibold">25%</span>;
        connected-party group <span className="font-semibold">15%</span>). Read the books below against these ceilings.
      </div>

      <div className="flex gap-1 mb-3">
        {(['ecl', 'watchlist'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`h-8 px-3 rounded-md text-[12px] font-semibold ${view === v ? 'bg-[oklch(0.46_0.16_55)] text-white' : 'bg-slate-100 text-slate-600'}`}>
            {v === 'ecl' ? 'Expected credit loss' : 'Watchlist'}
          </button>
        ))}
      </div>

      {view === 'ecl'
        ? <AutoTable endpoint="/lender-deep/ecl" empty="No ECL exposures." prefer={['project_name', 'borrower_name', 'stage', 'exposure_zar_m', 'ecl_zar_m', 'pd_pct', 'lgd_pct']} />
        : <AutoTable endpoint="/lender-deep/watchlist" empty="Watchlist clear." prefer={['project_name', 'borrower_name', 'reason', 'severity', 'status']} />}
    </div>
  );
}
