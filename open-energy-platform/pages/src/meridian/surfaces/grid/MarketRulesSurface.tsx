// pages/src/meridian/surfaces/grid/MarketRulesSurface.tsx
//
// Meridian surface — "Market rules & consultations" (grid_operator role). The grid operator
// can't author public consultations (that is regulator-WRITE only), so this is a read-only
// monitor over GET /api/public-consultations: NERSA rule-making, grid-code amendments and
// licence-condition consultations the SO must track and respond to, with SLA / breach context.
// Bucket B read surface. Registered as `grid_operator:market_rules` in surfaces.tsx, reached
// from Atlas (⌘K) via the roleData feature key `market_rules`.
import React from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';

function statusTone(s: string): 'good' | 'warn' | 'bad' | 'neutral' | 'info' {
  if (s === 'closed' || s === 'finalised' || s === 'finalized') return 'good';
  if (s === 'open' || s === 'comment_period') return 'info';
  if (s === 'under_review') return 'warn';
  return 'neutral';
}

export default function MarketRulesSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/public-consultations"
      rowKey={(r) => r.id}
      empty={{ title: 'No consultations', description: 'NERSA rule-making and grid-code consultations will appear here as they open.' }}
      columns={[
        { key: 'title', label: 'Consultation', render: (r) => (
          <div className="leading-tight">
            <div className="font-medium">{r.title}</div>
            <div className="text-[10px] text-slate-500 font-mono">{r.reference_number || '—'}{r.licence_ref ? ` · ${r.licence_ref}` : ''}</div>
          </div>
        ) },
        { key: 'consultation_type', label: 'Type', render: (r) => <Pill tone="info">{(r.consultation_type || '—').replace(/_/g, ' ')}</Pill> },
        { key: 'consultation_tier', label: 'Tier', render: (r) => <span className="text-[11px] capitalize">{(r.consultation_tier || '—').replace(/_/g, ' ')}</span> },
        { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{(r.chain_status || '—').replace(/_/g, ' ')}</Pill> },
        { key: 'sla_deadline', label: 'SLA deadline', render: (r) => r.sla_deadline ? new Date(r.sla_deadline).toLocaleDateString() : '—' },
        { key: 'sla_breached', label: 'SLA', render: (r) => <Pill tone={r.sla_breached ? 'bad' : 'good'}>{r.sla_breached ? 'breached' : 'on time'}</Pill> },
      ]}
    />
  );
}
