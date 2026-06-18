// pages/src/meridian/surfaces/lender/RiskSurface.tsx
//
// Meridian surface — "Covenant & default risk" (lender role). The breach-management end of the
// lender book: financial covenants (GET /api/lender/covenants), covenant actions
// (GET /api/lender/covenant-actions), dunning cycles (GET /api/lender/dunning) and the deep
// watchlist (GET /api/lender-deep/watchlist), toggled by sub-view, plus two write paths —
// record a covenant action (POST /api/lender/covenant-tests/:id/actions) and transition an open
// action (POST /api/lender/covenant-actions/:id/transition). Bucket B / L4 surface. Registered
// as `lender:lender_risk` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature
// key `lender_risk`.
import React, { useState } from 'react';
import { ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';
import { AutoTable } from './_AutoTable';

type View = 'covenants' | 'actions' | 'dunning' | 'watchlist';

export default function RiskSurface(_props: { role: string }) {
  const [view, setView] = useState<View>('covenants');
  const [recording, setRecording] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const TABS: { key: View; label: string }[] = [
    { key: 'covenants', label: 'Covenants' },
    { key: 'actions', label: 'Actions' },
    { key: 'dunning', label: 'Dunning' },
    { key: 'watchlist', label: 'Watchlist' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setView(t.key)}
              className={`h-8 px-3 rounded-md text-[12px] font-semibold ${view === t.key ? 'bg-[var(--petrol)] text-white' : 'bg-[var(--raised)] text-[var(--ink2)]'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRecording(true)} className="h-8 px-3 rounded-md bg-[var(--petrol)] text-white text-[12px] font-semibold">+ Record action</button>
          <button type="button" onClick={() => setTransitioning(true)} className="h-8 px-3 rounded-md border border-[var(--line)] text-[var(--ink2)] text-[12px] font-semibold">Transition action</button>
        </div>
      </div>

      {view === 'covenants' && <AutoTable refreshKey={refreshKey} endpoint="/lender/covenants" empty="No covenants." prefer={['project_name', 'covenant_type', 'threshold', 'latest_value', 'status']} />}
      {view === 'actions' && <AutoTable refreshKey={refreshKey} endpoint="/lender/covenant-actions" empty="No covenant actions." prefer={['id', 'action_type', 'severity', 'status', 'cure_deadline']} />}
      {view === 'dunning' && <AutoTable refreshKey={refreshKey} endpoint="/lender/dunning" empty="No dunning cases." prefer={['borrower_name', 'cycle', 'status', 'amount_zar_m', 'due_date']} />}
      {view === 'watchlist' && <AutoTable refreshKey={refreshKey} endpoint="/lender-deep/watchlist" empty="Watchlist clear." prefer={['project_name', 'reason', 'severity', 'status']} />}

      {recording && (
        <ActionModal
          title="Record covenant action"
          submitLabel="Record"
          fields={[
            { key: 'covenant_test_id', label: 'Covenant test ID', required: true, helperText: 'ID of the failed/flagged covenant test' },
            { key: 'action_type', label: 'Action type', type: 'select', required: true, options: [
              { value: 'waiver_request', label: 'Waiver request' }, { value: 'cure_plan', label: 'Cure plan' },
              { value: 'reservation_of_rights', label: 'Reservation of rights' }, { value: 'acceleration_notice', label: 'Acceleration notice' },
            ] },
            { key: 'severity', label: 'Severity', type: 'select', options: [
              { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' },
            ] },
            { key: 'cure_deadline', label: 'Cure deadline', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'textarea', required: true, placeholder: 'Rationale (min 3 chars)' },
          ] as FieldSpec[]}
          onClose={() => setRecording(false)}
          onSubmit={async (v) => {
            const { covenant_test_id, ...body } = v;
            await api.post(`/lender/covenant-tests/${covenant_test_id}/actions`, body);
            setRecording(false); refresh();
          }}
        />
      )}
      {transitioning && (
        <ActionModal
          title="Transition covenant action"
          submitLabel="Apply"
          cta="primary"
          fields={[
            { key: 'action_id', label: 'Action ID', required: true },
            { key: 'to', label: 'To state', type: 'select', required: true, options: [
              { value: 'investigating', label: 'Investigating' }, { value: 'resolved', label: 'Resolved' }, { value: 'rejected', label: 'Rejected' },
            ] },
            { key: 'outcome', label: 'Outcome', type: 'text' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setTransitioning(false)}
          onSubmit={async (v) => {
            const { action_id, ...body } = v;
            await api.post(`/lender/covenant-actions/${action_id}/transition`, body);
            setTransitioning(false); refresh();
          }}
        />
      )}
    </div>
  );
}
