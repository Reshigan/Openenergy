// pages/src/meridian/surfaces/lender/BenchmarkSurface.tsx
//
// Meridian surface — "Benchmark transition" (lender role). JIBAR→ZARONION reference-rate
// transition register read from the chain (GET /api/benchmark-transition/chain). Lenders track
// fallback-language adoption and repapering progress across the loan book here. Read-only — the
// transition chain is driven by its own Ledger/Thread; this is the lender's portfolio-wide view.
// Bucket B read surface. Registered as `lender:benchmark_lender`, reached via the roleData
// feature key `benchmark_lender`.
import React from 'react';
import { AutoTable } from './_AutoTable';

export default function BenchmarkSurface(_props: { role: string }) {
  return (
    <div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-3 text-[12px] text-slate-600">
        Reference-rate transition (JIBAR → ZARONIA). Tracks fallback-language adoption and
        facility repapering across the book.
      </div>
      <AutoTable
        endpoint="/benchmark-transition/chain"
        empty="No transition cases."
        prefer={['facility_ref', 'borrower_name', 'old_benchmark', 'new_benchmark', 'chain_status', 'sla_deadline', 'sla_breached']}
      />
    </div>
  );
}
