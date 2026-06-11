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

const BG     = 'oklch(0.96 0.003 250)';
const BG1    = 'oklch(0.99 0.002 80)';
const BORDER = 'oklch(0.87 0.006 250)';
const TX1    = 'oklch(0.17 0.010 250)';
const TX2    = 'oklch(0.40 0.009 250)';
const TX3    = 'oklch(0.60 0.007 250)';
const ACC    = 'oklch(0.46 0.16 55)';

export function LenderAuditPage() {
  const navigate = useNavigate();
  const [bump, setBump] = React.useState(0);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      height: 'calc(100vh - 50px)',
      background: BG,
      overflow: 'hidden',
    }}>
      {/* LEFT COLUMN — main content */}
      <div style={{ overflowY: 'auto', padding: '24px 28px' }}>
        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: TX3,
            background: BG1,
            border: `1px solid ${BORDER}`,
            borderRadius: 999,
            padding: '3px 10px',
            marginBottom: 8,
          }}>
            Lender · Audit &amp; Compliance
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX1, margin: 0 }}>
            Audit &amp; Compliance
          </h1>
          <p style={{ fontSize: 13, color: TX2, margin: '4px 0 0' }}>
            Tamper-evident covenant + disbursement chain · IFRS9 ECL register · bank disbursement reconciliation.
          </p>
        </div>

        {/* Main content — AuditPanel */}
        <div key={bump}>
          <AuditPanel
            prefix="/funder"
            reconHint="disbursement_id,value_date,amount_zar,facility_id"
            reconSourceOptions={['bank', 'absa', 'standard_bank', 'fnb', 'nedbank']}
          />
        </div>
      </div>

      {/* RIGHT COLUMN — action panel */}
      <div style={{
        borderLeft: `1px solid ${BORDER}`,
        background: BG1,
        overflowY: 'auto',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Navigation */}
        <div style={{
          background: BG1,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Navigation
          </div>
          <button
            type="button"
            onClick={() => navigate('/lender-suite')}
            style={{
              width: '100%',
              background: 'transparent',
              color: ACC,
              border: `1px solid ${ACC}`,
              padding: '8px 16px',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <ArrowLeft size={13} /> Lender Workbench
          </button>
        </div>

        {/* Actions */}
        <div style={{
          background: BG1,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Actions
          </div>
          <button
            type="button"
            onClick={() => setBump((n) => n + 1)}
            style={{
              width: '100%',
              background: ACC,
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={13} /> Refresh Audit Data
          </button>
        </div>

        {/* Recon sources */}
        <div style={{
          background: BG1,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Recon Sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['bank', 'absa', 'standard_bank', 'fnb', 'nedbank'].map((src) => (
              <div key={src} style={{
                fontSize: 12,
                color: TX2,
                padding: '6px 10px',
                background: BG,
                borderRadius: 6,
                border: `1px solid ${BORDER}`,
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}>
                {src.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </div>
            ))}
          </div>
        </div>

        {/* Recon fields hint */}
        <div style={{
          background: BG1,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TX2, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Recon Fields
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['disbursement_id', 'value_date', 'amount_zar', 'facility_id'].map((field) => (
              <div key={field} style={{
                fontSize: 11,
                color: TX3,
                fontFamily: '"IBM Plex Mono","Fira Code",monospace',
                padding: '4px 8px',
                background: BG,
                borderRadius: 4,
                border: `1px solid ${BORDER}`,
              }}>
                {field}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LenderAuditPage;
