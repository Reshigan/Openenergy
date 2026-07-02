// pages/src/meridian/surfaces/lender/PortfolioSurface.tsx
//
// Meridian surface — "Loan portfolio" (lender role). Capital-structure view of the book:
// DSRA / reserve accounts (GET /api/lender/reserves) and project cash-flow waterfalls
// (GET /api/lender/waterfalls), toggled by a sub-view switch. Distinct from `lender:lender_risk`
// (covenant / dunning management) and `lender:concentrations` (exposure limits). Bucket B read
// surface. Registered as `lender:portfolio` in surfaces.tsx, reached from Atlas (⌘K) via the
// roleData feature key `portfolio`.
import React, { useState } from 'react';
import { AutoTable } from './_AutoTable';

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
        ? <AutoTable endpoint="/lender/reserves" empty="No reserve accounts." prefer={['project_name', 'reserve_type', 'required_amount_zar_m', 'funded_amount_zar_m', 'status']} />
        : <AutoTable endpoint="/lender/waterfalls" empty="No waterfalls configured." prefer={['project_name', 'period', 'tier', 'allocation_zar_m', 'balance_zar_m', 'status']} />}
    </div>
  );
}
