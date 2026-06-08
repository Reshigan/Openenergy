// ════════════════════════════════════════════════════════════════════════
// LenderAuditPage — L5 audit + IFRS9 export + disbursement-recon surface
// for lenders. Renders the shared AuditPanel against /funder/audit/*.
// Lender suite uses a SuitePage tab API rather than WorkstationShell, so
// this is a dedicated route at /lender-suite/audit rather than a tab.
// ════════════════════════════════════════════════════════════════════════

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { AuditPanel } from '../launch/AuditPanel';

export function LenderAuditPage() {
  const navigate = useNavigate();
  const [bump, setBump] = React.useState(0);
  return (
    <div className="p-6 lg:p-10 space-y-4 min-h-screen" style={{ background: 'var(--oe-surface)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[#6b7685] bg-white border border-[#dde4ec] rounded-full px-3 py-1">
            Lender · Audit & compliance
          </div>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight" style={{ color: 'var(--oe-on-surface)' }}>Audit & compliance</h1>
          <p className="text-[13px] text-[#3d4756]">Tamper-evident covenant + disbursement chain · IFRS9 ECL register · bank disbursement reconciliation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => navigate('/lender-suite')} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <ArrowLeft size={12} /> Lender workbench
          </button>
          <button type="button" onClick={() => setBump((n) => n + 1)} className="h-9 px-3 rounded-md border border-[#dde4ec] bg-white text-[#3d4756] text-[12px] font-semibold inline-flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>
      <div key={bump}>
        <AuditPanel
          prefix="/funder"
          reconHint="disbursement_id,value_date,amount_zar,facility_id"
          reconSourceOptions={['bank', 'absa', 'standard_bank', 'fnb', 'nedbank']}
        />
      </div>
    </div>
  );
}
