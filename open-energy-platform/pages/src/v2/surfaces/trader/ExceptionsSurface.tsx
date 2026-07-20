// pages/src/meridian/surfaces/trader/ExceptionsSurface.tsx
//
// Meridian surface — "Post-trade exceptions" (trader role). Extracted verbatim from the inline
// `ExceptionsTab` body of the TraderWorkstationPage husk (E2.3). Trader post-trade EXCEPTION
// surfaces are NOT chains (plan-mandated exception) — extracted as a self-contained listing +
// file/transition action surface (Bucket B). Registered as `trader:exceptions` in surfaces.tsx,
// reached from Atlas (⌘K) via the roleData feature key `exceptions` (added in E2.3).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function ExceptionsSurface(_props: { role: string }) {
  const [filing, setFiling] = useState(false);
  const [transitioning, setTransitioning] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button" onClick={() => setFiling(true)} className="btn pri">
          + File exception
        </button>
      </div>
      <ListingTable
        key={refreshKey}
        endpoint="/trading/exceptions"
        rowKey={(r) => r.id}
        empty={{ title: 'No exceptions', description: 'Post-trade mismatches (price, volume, settlement) appear here for triage.' }}
        columns={[
          { key: 'reported_at', label: 'When', render: (r) => new Date(r.reported_at).toLocaleString() },
          { key: 'match_id', label: 'Match', render: (r) => <span className="font-mono text-[11px]">{(r.match_id || '').slice(0, 12)}…</span> },
          { key: 'exception_type', label: 'Type', render: (r) => <Pill tone="info">{(r.exception_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'severity', label: 'Severity', render: (r) => <Pill tone={r.severity === 'critical' ? 'bad' : r.severity === 'high' ? 'warn' : 'neutral'}>{r.severity}</Pill> },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'resolved' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'}>{r.status}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            r.status !== 'resolved' && r.status !== 'rejected' ? (
              <button type="button" onClick={() => setTransitioning(r)} className="btn pri">Transition</button>
            ) : null
          ) },
        ]}
      />
      {filing && (
        <ActionModal
          title="File post-trade exception"
          submitLabel="File"
          fields={[
            { key: 'match_id', label: 'Match ID', required: true, placeholder: 'match_…' },
            { key: 'exception_type', label: 'Type', type: 'select', required: true, options: [
              { value: 'price_mismatch', label: 'Price mismatch' },
              { value: 'volume_mismatch', label: 'Volume mismatch' },
              { value: 'settlement_dispute', label: 'Settlement dispute' },
              { value: 'unmatched', label: 'Unmatched' },
              { value: 'duplicate', label: 'Duplicate' },
              { value: 'other', label: 'Other' },
            ] },
            { key: 'severity', label: 'Severity', type: 'select', required: true, options: [
              { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
            ] },
            { key: 'reason', label: 'Reason', type: 'textarea', required: true },
            { key: 'expected_value', label: 'Expected value (optional)' },
            { key: 'actual_value', label: 'Actual value (optional)' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/trading/exceptions', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title={`Exception transition · current: ${transitioning.status}`}
          submitLabel="Transition"
          fields={[
            { key: 'to', label: 'To', type: 'select', required: true, options: [
              { value: 'investigating', label: 'Investigating' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'rejected', label: 'Rejected' },
            ] },
            { key: 'outcome', label: 'Outcome (resolved/rejected)', type: 'select', options: [
              { value: 'adjusted', label: 'Adjusted' },
              { value: 'cancelled', label: 'Cancelled' },
              { value: 'no_action', label: 'No action' },
            ] },
            { key: 'notes', label: 'Notes (≥3 chars on terminal transitions)', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(null)}
          onSubmit={async (v) => {
            await api.post(`/trading/exceptions/${transitioning.id}/transition`, v);
            setTransitioning(null); onRefresh();
          }}
        />
      )}
    </div>
  );
}
