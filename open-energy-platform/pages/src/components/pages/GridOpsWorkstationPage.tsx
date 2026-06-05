import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { DispatchNominationTab } from '../grid/DispatchNominationTab';
import { PlannedOutageChainTab } from '../grid/PlannedOutageChainTab';
import { RezCapacityChainTab } from '../grid/RezCapacityChainTab';
import { WheelingChargesTab } from '../grid/WheelingChargesTab';
import { ImbalanceSettlementChainTab } from '../grid/ImbalanceSettlementChainTab';
import { TransmissionOutageChainTab } from '../grid/TransmissionOutageChainTab';
import { ScadaConnectorTab } from '../scadaConnector/ScadaConnectorTab';
import { MqttOpcuaConnectorTab } from '../mqttOpcuaConnector/MqttOpcuaConnectorTab';

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button onClick={onCreate} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

export function GridOpsWorkstationPage() {
  const kpis = useWorkstationKpis('grid_operator');
  const curtailPanel = useWorkstationPanel('Active curtailment', '/grid-operator/curtailment', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fff4d6] text-[#a06200]">{r.status || 'live'}</span>,
    text: <span>{r.instruction_number || r.id} · {r.target_mw ? `${r.target_mw} MW` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.effective_from ? new Date(r.effective_from).toLocaleTimeString('en-ZA') : ''}</span>,
  }), 'No active curtailment.');
  const outagePanel = useWorkstationPanel('Open outage responses', '/grid-operator/outages', (r) => ({
    id: r.id,
    lead: <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${r.severity === 'critical' ? 'bg-[#fbe9e6] text-[#c0392b]' : 'bg-[#fff4d6] text-[#a06200]'}`}>{r.severity || r.status || '—'}</span>,
    text: <span>{r.area || r.substation} · {r.affected_mw ? `${r.affected_mw} MW` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.detected_at ? new Date(r.detected_at).toLocaleTimeString('en-ZA') : ''}</span>,
  }), 'No outages.');
  const panels = [curtailPanel, outagePanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="grid_operator"
      eyebrow="Grid operator · Workstation"
      title="Grid operations workstation"
      subtitle="Curtailment events · Outage responses · Ancillary award events. Single screen, all in-platform."
      backHref="/grid-operator"
      backLabel="Operator suite"
      kpis={kpis}
      panels={panels}
      tabs={[
        { key: 'dispatch_nomination', label: 'Dispatch nominations', group: 'Operations', body: () => <DispatchNominationTab /> },
        { key: 'curtailment', label: 'Curtailment events', group: 'Operations', body: ({ onRefresh }) => <CurtailmentTab onRefresh={onRefresh} /> },
        { key: 'demand_response', label: 'Demand response (W205)', group: 'Operations', body: ({ onRefresh }) => <DemandResponseTab onRefresh={onRefresh} /> },
        { key: 'ancillary', label: 'Ancillary services', group: 'Operations', body: ({ onRefresh }) => <AncillaryTab onRefresh={onRefresh} /> },
        { key: 'imbalance-settlement', label: 'Imbalance settlement', group: 'Operations', body: () => <ImbalanceSettlementChainTab /> },
        { key: 'wheeling_charges', label: 'Wheeling charges', group: 'Operations', body: () => <WheelingChargesTab /> },
        { key: 'rez_capacity', label: 'REZ capacity allocation', group: 'Connections', body: () => <RezCapacityChainTab /> },
        { key: 'transmission-outage', label: 'Transmission outage coordination', group: 'Connections', body: () => <TransmissionOutageChainTab /> },
        { key: 'outage', label: 'Outage responses', group: 'Connections', body: ({ onRefresh }) => <OutageTab onRefresh={onRefresh} /> },
        { key: 'planned_outage', label: 'Planned outages', group: 'Compliance', body: () => <PlannedOutageChainTab /> },
        { key: 'scada-connectors', label: 'SCADA data', group: 'Compliance', body: () => <ScadaConnectorTab /> },
        { key: 'mqtt-opcua-connectors', label: 'MQTT/OPC-UA connectors', group: 'Compliance', body: () => <MqttOpcuaConnectorTab /> },
        { key: 'smart-meter-assets', label: 'Smart meter assets (W199)', group: 'Compliance', body: ({ onRefresh }) => <SmartMeterAssetsTab onRefresh={onRefresh} /> },
        { key: 'audit', label: 'Audit & compliance', group: 'Compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/grid-operator"
              reconHint="instruction_number,effective_from,target_mw,participant_id"
              reconSourceOptions={['eskom', 'nersa', 'so_internal']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function CurtailmentTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log curtailment event" />
      <ListingTable
        endpoint="/grid-operator/curtailment-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No curtailment events', description: 'Issuance, acknowledgement, partial / full lift events will appear here.' }}
        columns={[
          { key: 'curtailment_id', label: 'Curtailment', render: (r) => <span className="font-mono text-[11px]">{(r.curtailment_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type.includes('lift') ? 'good' : r.event_type === 'disputed' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log curtailment event"
          submitLabel="Log"
          fields={[
            { key: 'curtailment_id', label: 'Curtailment ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'issued', label: 'Issued' },
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'disputed', label: 'Disputed' },
              { value: 'partial_lift', label: 'Partial lift' },
              { value: 'full_lift', label: 'Full lift' },
              { value: 'escalated', label: 'Escalated' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/grid-operator/curtailment-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function OutageTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log outage response" />
      <ListingTable
        endpoint="/grid-operator/outage-responses"
        rowKey={(r) => r.id}
        rowHref={(r) => `/grid-operator/outages/${encodeURIComponent(r.outage_id)}`}
        empty={{ title: 'No outage responses', description: 'Acknowledgements, crew dispatch, rerouting and restoration events will appear here.' }}
        columns={[
          { key: 'outage_id', label: 'Outage', render: (r) => <span className="font-mono text-[11px]">{(r.outage_id || '').slice(0, 12)}…</span> },
          { key: 'response_type', label: 'Response', render: (r) => <Pill tone={r.response_type === 'restored' || r.response_type === 'closed' ? 'good' : 'warn'}>{r.response_type.replace(/_/g, ' ')}</Pill> },
          { key: 'eta_minutes', label: 'ETA (min)', align: 'right' },
          { key: 'responded_at', label: 'When', render: (r) => new Date(r.responded_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log outage response"
          submitLabel="Log"
          fields={[
            { key: 'outage_id', label: 'Outage ID', required: true },
            { key: 'response_type', label: 'Response type', type: 'select', required: true, options: [
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'dispatched_crew', label: 'Dispatched crew' },
              { value: 'rerouted', label: 'Rerouted' },
              { value: 'restored', label: 'Restored' },
              { value: 'escalated', label: 'Escalated' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'eta_minutes', label: 'ETA (minutes)', type: 'number' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            const body: any = { outage_id: v.outage_id, response_type: v.response_type, notes: v.notes };
            if (v.eta_minutes) body.eta_minutes = Number(v.eta_minutes);
            await api.post('/grid-operator/outage-responses', body);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function AncillaryTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log ancillary event" />
      <ListingTable
        endpoint="/grid-operator/ancillary-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No ancillary events', description: 'Award acceptances, deliveries, failures and settlement events land here.' }}
        columns={[
          { key: 'award_id', label: 'Award', render: (r) => <span className="font-mono text-[11px]">{(r.award_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'delivered' || r.event_type === 'settled' ? 'good' : r.event_type === 'failed' || r.event_type === 'declined' ? 'bad' : 'info'}>{r.event_type}</Pill> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log ancillary award event"
          submitLabel="Log"
          fields={[
            { key: 'award_id', label: 'Award ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'awarded', label: 'Awarded' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'declined', label: 'Declined' },
              { value: 'delivered', label: 'Delivered' },
              { value: 'failed', label: 'Failed' },
              { value: 'settled', label: 'Settled' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/grid-operator/ancillary-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

const SMA_STATUS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  operational: 'good', decommissioned: 'bad', fault_detected: 'bad',
  replacement_pending: 'warn', commissioning: 'info', data_quality_pass: 'info',
};
const METER_CLASS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  hv_bulk: 'bad', bulk: 'warn', prepaid: 'info', post_paid: 'good',
};
const SMA_ACTIONS = [
  { value: 'confirm_fat', label: 'Confirm FAT' },
  { value: 'confirm_delivery', label: 'Confirm delivery' },
  { value: 'schedule_installation', label: 'Schedule installation' },
  { value: 'confirm_installed', label: 'Confirm installed' },
  { value: 'start_commissioning', label: 'Start commissioning' },
  { value: 'confirm_communication', label: 'Confirm communication' },
  { value: 'pass_data_quality', label: 'Pass data quality' },
  { value: 'go_live', label: 'Go live' },
  { value: 'report_fault', label: 'Report fault' },
  { value: 'schedule_replacement', label: 'Schedule replacement' },
  { value: 'decommission', label: 'Decommission' },
  { value: 'return_to_service', label: 'Return to service' },
];

function SmartMeterAssetsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [actionRow, setActionRow] = useState<Record<string, unknown> | null>(null);

  const createFields: FieldSpec[] = [
    { key: 'meter_serial', label: 'Meter serial', required: true },
    { key: 'meter_class', label: 'Meter class', type: 'select', options: [
      { value: 'hv_bulk', label: 'HV Bulk (7d SLA)' },
      { value: 'bulk', label: 'Bulk (14d SLA)' },
      { value: 'prepaid', label: 'Prepaid (21d SLA)' },
      { value: 'post_paid', label: 'Post-paid (30d SLA)' },
    ]},
    { key: 'site_id', label: 'Site ID', required: true },
    { key: 'owner_id', label: 'Owner participant ID' },
    { key: 'make_model', label: 'Make / model' },
    { key: 'communication_tech', label: 'Comms technology', type: 'select', options: [
      { value: 'gprs', label: 'GPRS' }, { value: 'plc', label: 'PLC' },
      { value: 'rf_mesh', label: 'RF Mesh' }, { value: 'fibre', label: 'Fibre' },
      { value: 'nb_iot', label: 'NB-IoT' },
    ]},
  ];

  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Register meter" />
      {filing && (
        <ActionModal
          title="Register smart meter asset"
          fields={createFields}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/smart-meter-assets', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {actionRow && (
        <ActionModal
          title={`Meter action: ${String(actionRow.meter_serial || '')}`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: SMA_ACTIONS },
            { key: 'reason', label: 'Reason', type: 'textarea' },
            { key: 'fault_code', label: 'Fault code' },
            { key: 'data_quality_score', label: 'Data quality score (0-100)', type: 'number' },
          ] as FieldSpec[]}
          onClose={() => setActionRow(null)}
          onSubmit={async (v) => {
            await api.post(`/smart-meter-assets/${String(actionRow.id)}/action`, v);
            setActionRow(null); onRefresh();
          }}
        />
      )}
      <ListingTable
        endpoint="/smart-meter-assets"
        rowKey={(r) => r.id}
        columns={[
          { key: 'meter_serial', label: 'Serial', render: (r) => <span className="font-mono text-[11px]">{String(r.meter_serial || '')}</span> },
          { key: 'meter_class', label: 'Class', render: (r) => <Pill tone={METER_CLASS_TONE[String(r.meter_class)] ?? 'info'}>{String(r.meter_class || '').replace(/_/g, ' ')}</Pill> },
          { key: 'site_id', label: 'Site', render: (r) => <span className="font-mono text-[11px]">{String(r.site_id || '').slice(0, 16)}…</span> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={SMA_STATUS_TONE[String(r.chain_status)] ?? 'info'}>{String(r.chain_status || '').replace(/_/g, ' ')}</Pill> },
          { key: 'sla_deadline', label: 'SLA', render: (r) => r.sla_deadline ? String(r.sla_deadline) : '—' },
          { key: 'sla_breached', label: 'Breach', render: (r) => r.sla_breached ? <Pill tone="bad">BREACH</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'data_quality_score', label: 'DQ score', render: (r) => r.data_quality_score != null ? String(r.data_quality_score) : '—' },
          { key: 'actions', label: '', render: (r) => (
            <button onClick={() => setActionRow(r)} className="text-[11px] text-[#1a3a5c] underline">Action</button>
          )},
        ]}
      />
    </div>
  );
}

// ─── W205: Demand-Response Programme ─────────────────────────────────────────
type DrModalMode = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function DemandResponseTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<DrModalMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  const statusTone = (s: string) => {
    if (s === 'settled') return 'good' as const;
    if (['non_performance', 'cancelled'].includes(s)) return 'bad' as const;
    if (['settlement_disputed', 'load_shed'].includes(s)) return 'warn' as const;
    return 'neutral' as const;
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          className="px-3 py-1.5 rounded bg-[#1a3a5c] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + Register DR event
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/demand-response-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No demand-response events', description: 'Register a DR programme activation event.' }}
        columns={[
          { key: 'event_date', label: 'Date', render: (r) => r.event_date },
          { key: 'dr_programme', label: 'Programme', render: (r) => <Pill tone="info">{String(r.dr_programme).replace(/_/g, ' ')}</Pill> },
          { key: 'requested_mw', label: 'Requested MW', align: 'right', render: (r) => r.requested_mw != null ? `${r.requested_mw} MW` : '—' },
          { key: 'actual_mw_shed', label: 'Actual MW', align: 'right', render: (r) => r.actual_mw_shed != null ? `${r.actual_mw_shed} MW` : '—' },
          { key: 'incentive_amount_zar', label: 'Incentive', align: 'right', render: (r) => r.incentive_amount_zar != null ? Number(r.incentive_amount_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Register demand-response event"
          submitLabel="Register"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/demand-response-events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                dr_programme: v.dr_programme,
                event_date: v.event_date,
                requested_mw: v.requested_mw ? parseFloat(v.requested_mw) : undefined,
                notification_type: v.notification_type || undefined,
                incentive_rate_per_mw: v.incentive_rate_per_mw ? parseFloat(v.incentive_rate_per_mw) : undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'event_date', label: 'Event date', type: 'date', required: true },
            {
              key: 'dr_programme', label: 'DR programme', type: 'select', required: true, defaultValue: 'day_ahead',
              options: [
                { value: 'frequency_response', label: 'Frequency response (2h SLA)' },
                { value: 'real_time', label: 'Real-time (4h SLA)' },
                { value: 'day_ahead', label: 'Day-ahead (24h SLA)' },
                { value: 'interruptible_tariff', label: 'Interruptible tariff (48h SLA)' },
              ],
            },
            { key: 'requested_mw', label: 'Requested MW curtailment', type: 'number', required: false },
            {
              key: 'notification_type', label: 'Notification type', type: 'select', required: false,
              options: [
                { value: 'day_ahead', label: 'Day-ahead' },
                { value: 'real_time', label: 'Real-time' },
                { value: 'test', label: 'Test activation' },
              ],
            },
            { key: 'incentive_rate_per_mw', label: 'Incentive rate (ZAR/MW)', type: 'number', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance DR event — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/demand-response-events/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                reason: v.reason || undefined,
                actual_mw_shed: v.actual_mw_shed ? parseFloat(v.actual_mw_shed) : undefined,
                performance_pct: v.performance_pct ? parseFloat(v.performance_pct) : undefined,
                incentive_amount_zar: v.incentive_amount_zar ? parseFloat(v.incentive_amount_zar) : undefined,
                settlement_ref: v.settlement_ref || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'send_notification', label: 'Send notification to participant' },
                { value: 'acknowledge', label: 'Participant acknowledges' },
                { value: 'activate', label: 'Issue activation instruction' },
                { value: 'confirm_load_shed', label: 'Confirm load shed started' },
                { value: 'close_metering', label: 'Close metering window' },
                { value: 'verify_performance', label: 'Verify performance (independent)' },
                { value: 'calculate_settlement', label: 'Calculate incentive settlement' },
                { value: 'agree_settlement', label: 'Agree settlement amount' },
                { value: 'dispute_settlement', label: 'Raise settlement dispute' },
                { value: 'resolve_dispute', label: 'Resolve dispute' },
                { value: 'post_settlement', label: 'Post incentive payment' },
                { value: 'record_non_performance', label: 'Record non-performance' },
                { value: 'cancel', label: 'Cancel activation' },
              ],
            },
            { key: 'actual_mw_shed', label: 'Actual MW shed (metered)', type: 'number', required: false },
            { key: 'performance_pct', label: 'Performance % (actual/requested)', type: 'number', required: false },
            { key: 'incentive_amount_zar', label: 'Incentive amount (ZAR)', type: 'number', required: false },
            { key: 'settlement_ref', label: 'Settlement reference', required: false },
            { key: 'reason', label: 'Notes / reason', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}
