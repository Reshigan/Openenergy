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
        { key: 'dispatch_nomination', label: 'Dispatch nominations', group: 'Operations', chainKey: 'oe_dispatch_nominations', body: () => <DispatchNominationTab /> },
        { key: 'curtailment', label: 'Curtailment events', group: 'Operations', body: ({ onRefresh }) => <CurtailmentTab onRefresh={onRefresh} /> },
        { key: 'demand_response', label: 'Demand response (W205)', group: 'Operations', chainKey: 'demand_response_event', body: ({ onRefresh }) => <DemandResponseTab onRefresh={onRefresh} /> },
        { key: 'ancillary', label: 'Ancillary services', group: 'Operations', chainKey: 'reserve_activation', body: ({ onRefresh }) => <AncillaryTab onRefresh={onRefresh} /> },
        { key: 'imbalance-settlement', label: 'Imbalance settlement', group: 'Operations', chainKey: 'imbalance_settlement', body: () => <ImbalanceSettlementChainTab /> },
        { key: 'wheeling_charges', label: 'Wheeling charges', group: 'Operations', body: () => <WheelingChargesTab /> },
        { key: 'rez_capacity', label: 'REZ capacity allocation', group: 'Connections', chainKey: 'rez_capacity', body: () => <RezCapacityChainTab /> },
        { key: 'transmission-outage', label: 'Transmission outage coordination', group: 'Connections', chainKey: 'transmission_outage', body: () => <TransmissionOutageChainTab /> },
        { key: 'outage', label: 'Outage responses', group: 'Connections', body: ({ onRefresh }) => <OutageTab onRefresh={onRefresh} /> },
        { key: 'planned_outage', label: 'Planned outages', group: 'Compliance', chainKey: 'planned_outage', body: () => <PlannedOutageChainTab /> },
        { key: 'scada-connectors', label: 'SCADA data', group: 'Compliance', body: () => <ScadaConnectorTab /> },
        { key: 'mqtt-opcua-connectors', label: 'MQTT/OPC-UA connectors', group: 'Compliance', body: () => <MqttOpcuaConnectorTab /> },
        { key: 'smart-meter-assets', label: 'Smart meter assets (W199)', group: 'Compliance', chainKey: 'smart_meter_asset', body: ({ onRefresh }) => <SmartMeterAssetsTab onRefresh={onRefresh} /> },
        { key: 'substation-assets', label: 'Substation assets (W211)', group: 'Compliance', chainKey: 'substation_asset', body: ({ onRefresh }) => <SubstationAssetsTab onRefresh={onRefresh} /> },
        { key: 'eop_activations', label: 'EOP activations (W215)', group: 'Operations', chainKey: 'eop_activation', body: ({ onRefresh }) => <EopActivationTab onRefresh={onRefresh} /> },
        {
          key: 'load_curtailments',
          label: 'Load curtailment (W34)',
          group: 'Operations',
          chainKey: 'load_curtailment',
          body: () => (
            <ListingTable
              endpoint="/load-curtailment/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No load curtailment cases', description: 'NERSA §CSC-1 load curtailment cases will appear here.' }}
              columns={[
                { key: 'load_shedding_stage', label: 'Stage' },
                { key: 'affected_mw', label: 'Affected MW', render: (r) => r.affected_mw != null ? `${r.affected_mw} MW` : '—' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['restored','completed'].includes(r.chain_status) ? 'good' : ['escalated','disputed'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Activated', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'grid_capacity_allocations',
          label: 'Capacity allocation (W58)',
          group: 'Connections',
          chainKey: 'grid_capacity_allocation',
          body: () => (
            <ListingTable
              endpoint="/grid-capacity/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No capacity allocations', description: 'NTCSA 2024 grid capacity allocation queue will appear here.' }}
              columns={[
                { key: 'requested_capacity_mw', label: 'Requested MW', render: (r) => r.requested_capacity_mw != null ? `${r.requested_capacity_mw} MW` : '—' },
                { key: 'connection_type', label: 'Connection type' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['allocated','confirmed'].includes(r.chain_status) ? 'good' : ['rejected_application','withdrawn'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Applied', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'grid_code_compliance',
          label: 'Grid code compliance (W67)',
          group: 'Compliance',
          chainKey: 'grid_code_compliance',
          body: () => (
            <ListingTable
              endpoint="/grid-code-compliance/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No compliance cases', description: 'NERSA Grid Code/NRS 097 conformance cases will appear here.' }}
              columns={[
                { key: 'voltage_level_kv', label: 'Voltage (kV)', render: (r) => r.voltage_level_kv != null ? `${r.voltage_level_kv} kV` : '—' },
                { key: 'facility_type', label: 'Facility type' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['compliant','closed_compliant'].includes(r.chain_status) ? 'good' : ['non_compliant','escalated_disconnection'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Opened', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'connection_energization',
          label: 'Connection energization (W75)',
          group: 'Connections',
          chainKey: 'connection_energization',
          body: () => (
            <ListingTable
              endpoint="/connection-energization/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No energization cases', description: 'SA Grid Code/NTCSA connection energization and commissioning cases will appear here.' }}
              columns={[
                { key: 'connection_voltage_kv', label: 'Voltage (kV)', render: (r) => r.connection_voltage_kv != null ? `${r.connection_voltage_kv} kV` : '—' },
                { key: 'connection_type', label: 'Type' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['commercial_operation'].includes(r.chain_status) ? 'good' : ['withdrawn','suspended'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Initiated', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
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

// ─── W211: Substation Asset Lifecycle Tab ─────────────────────────────────────
const SAS_TIER_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'info'> = {
  critical_node: 'bad', transmission: 'warn', subtransmission: 'info', distribution: 'neutral',
};

function SubstationAssetsTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'action'; id: string; currentStatus: string; tier: string; name: string }>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setModal({ type: 'create' })} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + Register asset
        </button>
      </div>

      <ListingTable
        endpoint="/substation-assets"
        rowKey={(r) => r.id}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status, tier: r.asset_tier, name: r.name })}
        empty={{ title: 'No substation assets', description: 'Grid transformer and substation asset records will appear here.' }}
        columns={[
          { key: 'asset_number', label: 'Asset #', render: (r) => <span className="font-mono text-[11px]">{r.asset_number as string}</span> },
          { key: 'name', label: 'Name', render: (r) => <span className="font-medium text-[12px]">{r.name as string}</span> },
          { key: 'asset_type', label: 'Type', render: (r) => <span className="text-[11px]">{String(r.asset_type).replace(/_/g, ' ')}</span> },
          { key: 'asset_tier', label: 'Tier', render: (r) => <Pill tone={SAS_TIER_TONE[r.asset_tier as string] ?? 'neutral'}>{String(r.asset_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'voltage_kv', label: 'kV', render: (r) => r.voltage_kv != null ? <span>{r.voltage_kv as number} kV</span> : <span className="text-[#8fa3bd]">—</span> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['energised', 'returned_to_service'].includes(r.chain_status as string) ? 'good' : ['failed'].includes(r.chain_status as string) ? 'bad' : ['out_of_service', 'refurbishment'].includes(r.chain_status as string) ? 'warn' : 'neutral'}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'condition_score', label: 'Score', render: (r) => r.condition_score != null ? <span className={`font-semibold ${Number(r.condition_score) >= 7 ? 'text-green-700' : Number(r.condition_score) >= 4 ? 'text-amber-600' : 'text-red-600'}`}>{r.condition_score}/10</span> : <span className="text-[#8fa3bd]">—</span> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
      />

      {modal?.type === 'create' && (
        <ActionModal
          title="Register substation asset"
          submitLabel="Register"
          fields={[
            { key: 'asset_number', label: 'Asset number / tag', required: true },
            { key: 'name', label: 'Asset name', required: true },
            { key: 'asset_type', label: 'Asset type', type: 'select', required: true, options: [
              { value: 'power_transformer', label: 'Power transformer' },
              { value: 'auto_transformer', label: 'Auto-transformer' },
              { value: 'circuit_breaker', label: 'Circuit breaker' },
              { value: 'disconnector', label: 'Disconnector' },
              { value: 'busbar', label: 'Busbar' },
              { value: 'cable', label: 'Cable' },
              { value: 'overhead_line', label: 'Overhead line' },
              { value: 'reactor', label: 'Reactor' },
              { value: 'capacitor_bank', label: 'Capacitor bank' },
              { value: 'protection_relay', label: 'Protection relay' },
            ]} as FieldSpec,
            { key: 'asset_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'distribution', label: 'Distribution (11kV–66kV, 30d SLA)' },
              { value: 'subtransmission', label: 'Subtransmission (88kV–132kV, 45d SLA)' },
              { value: 'transmission', label: 'Transmission (220kV–765kV, 60d SLA)' },
              { value: 'critical_node', label: 'Critical node (N-1, 90d SLA)' },
            ]} as FieldSpec,
            { key: 'location_name', label: 'Substation / location name' },
            { key: 'voltage_kv', label: 'Rated voltage (kV)', type: 'number' },
            { key: 'rated_mva', label: 'Rated MVA', type: 'number' },
            { key: 'manufacturer', label: 'Manufacturer' },
            { key: 'year_manufactured', label: 'Year manufactured', type: 'number' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/substation-assets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, voltage_kv: v.voltage_kv ? Number(v.voltage_kv) : undefined, rated_mva: v.rated_mva ? Number(v.rated_mva) : undefined, year_manufactured: v.year_manufactured ? Number(v.year_manufactured) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); onRefresh?.();
          }}
        />
      )}

      {modal?.type === 'action' && (
        <ActionModal
          title={`${modal.name} — ${modal.tier} — ${String(modal.currentStatus).replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'start_commissioning', label: 'Start commissioning' },
              { value: 'energise', label: 'Energise (put in service)' },
              { value: 'schedule_assessment', label: 'Schedule condition assessment' },
              { value: 'complete_assessment', label: 'Complete assessment' },
              { value: 'plan_refurbishment', label: 'Plan refurbishment' },
              { value: 'take_out_of_service', label: 'Take out of service' },
              { value: 'start_refurbishment', label: 'Start refurbishment works' },
              { value: 'return_to_service', label: 'Return to service' },
              { value: 'initiate_decommission', label: 'Initiate decommission' },
              { value: 'decommission', label: 'Decommission (final)' },
              { value: 'record_failure', label: 'Record failure event' },
            ]} as FieldSpec,
            { key: 'condition_score', label: 'Condition score (0–10)', type: 'number' },
            { key: 'remaining_life_years', label: 'Remaining life (years)', type: 'number' },
            { key: 'refurbishment_type', label: 'Refurbishment type (minor/major/rewind)' },
            { key: 'refurbishment_cost_zar', label: 'Refurbishment cost (ZAR)', type: 'number' },
            { key: 'decommission_reason', label: 'Decommission reason', type: 'select', options: [
              { value: 'end_of_life', label: 'End of life' },
              { value: 'failure', label: 'Failure' },
              { value: 'replacement', label: 'Replacement' },
              { value: 'stranded_asset', label: 'Stranded asset' },
            ]} as FieldSpec,
            { key: 'failure_mode', label: 'Failure mode (if recording failure)' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/substation-assets/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, condition_score: v.condition_score ? Number(v.condition_score) : undefined, remaining_life_years: v.remaining_life_years ? Number(v.remaining_life_years) : undefined, refurbishment_cost_zar: v.refurbishment_cost_zar ? Number(v.refurbishment_cost_zar) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

// ─── W215: Grid EOP Activation ────────────────────────────────────────────────
const EOP_TIER_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  n1_minor: 'info',
  n1_significant: 'warn',
  n2_double: 'bad',
  black_start: 'bad',
};

function eopStatusTone(s: string): 'info' | 'warn' | 'bad' | 'good' | 'neutral' {
  if (s === 'per_completed') return 'good';
  if (s === 'per_outstanding' || s === 'escalated_to_regulator') return 'bad';
  if (s === 'restoration_in_progress' || s === 'load_shedding_assessed') return 'warn';
  return 'info';
}

type EopModal = null | 'create' | { type: 'action'; id: string; currentStatus: string };

function EopActivationTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<EopModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => { setRefreshKey(k => k + 1); onRefresh(); };

  return (
    <div>
      <button
        onClick={() => setModal('create')}
        className="mb-4 px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
      >
        Log contingency event
      </button>
      <ListingTable
        endpoint="/eop-activations"
        key={refreshKey}
        rowKey={(r) => r.id}
        empty={{ title: 'No EOP activations', description: 'Emergency Operations Plan activations will appear here.' }}
        columns={[
          { key: 'eop_tier', label: 'Severity', render: (r) => <Pill tone={EOP_TIER_TONE[r.eop_tier] ?? 'neutral'}>{String(r.eop_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'contingency_type', label: 'Type', render: (r) => r.contingency_type ? String(r.contingency_type).replace(/_/g, ' ') : '—' },
          { key: 'affected_mw', label: 'MW affected', align: 'right', render: (r) => r.affected_mw ? `${Number(r.affected_mw).toFixed(0)} MW` : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={eopStatusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'contingency_at', label: 'Event time', render: (r) => r.contingency_at ? new Date(r.contingency_at as string).toLocaleString() : '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Log contingency / EOP event"
          submitLabel="Log event"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/eop-activations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                eop_tier: v.eop_tier,
                contingency_type: v.contingency_type || undefined,
                contingency_description: v.contingency_description,
                affected_mw: v.affected_mw ? parseFloat(v.affected_mw) : undefined,
                affected_region: v.affected_region || undefined,
                load_shedding_stage: v.load_shedding_stage ? parseInt(v.load_shedding_stage, 10) : undefined,
                ntcsa_incident_ref: v.ntcsa_incident_ref || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            {
              key: 'eop_tier', label: 'Severity tier', type: 'select', required: true, defaultValue: 'n1_significant',
              options: [
                { value: 'n1_minor', label: 'N-1 Minor — <100MW (24h PER SLA)' },
                { value: 'n1_significant', label: 'N-1 Significant — 100–500MW (12h SLA)' },
                { value: 'n2_double', label: 'N-2 Double contingency — 500–1000MW (6h SLA)' },
                { value: 'black_start', label: 'Black start — system collapse (2h SLA)' },
              ],
            },
            {
              key: 'contingency_type', label: 'Contingency type', type: 'select', required: false,
              options: [
                { value: 'line_trip', label: 'Line trip' },
                { value: 'generator_trip', label: 'Generator trip' },
                { value: 'transformer_fault', label: 'Transformer fault' },
                { value: 'busbar_fault', label: 'Busbar fault' },
                { value: 'under_frequency', label: 'Under-frequency event' },
                { value: 'voltage_collapse', label: 'Voltage collapse' },
                { value: 'protection_failure', label: 'Protection failure' },
                { value: 'external', label: 'External cause' },
                { value: 'other', label: 'Other' },
              ],
            },
            { key: 'contingency_description', label: 'Description', type: 'textarea', required: true },
            { key: 'affected_mw', label: 'Affected MW', type: 'number', required: false },
            { key: 'affected_region', label: 'Affected region', required: false },
            { key: 'load_shedding_stage', label: 'Load shedding stage (1–8)', type: 'number', required: false },
            { key: 'ntcsa_incident_ref', label: 'NTCSA incident reference', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`EOP action — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/eop-activations/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                load_shedding_stage: v.load_shedding_stage ? parseInt(v.load_shedding_stage, 10) : undefined,
                affected_mw: v.affected_mw ? parseFloat(v.affected_mw) : undefined,
                total_outage_duration_min: v.total_outage_duration_min ? parseInt(v.total_outage_duration_min, 10) : undefined,
                per_lead_name: v.per_lead_name || undefined,
                root_cause: v.root_cause || undefined,
                contributing_factors: v.contributing_factors || undefined,
                lessons_learned: v.lessons_learned || undefined,
                action_items: v.action_items || undefined,
                nersa_notification_ref: v.nersa_notification_ref || undefined,
                escalation_reason: v.escalation_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'activate_eop', label: 'Activate EOP' },
                { value: 'alert_operations_centre', label: 'Alert operations centre' },
                { value: 'assess_load_shedding', label: 'Assess load shedding requirement' },
                { value: 'commence_restoration', label: 'Commence network restoration' },
                { value: 'restore_normal_operations', label: 'Restore normal operations' },
                { value: 'initiate_per', label: 'Initiate post-event review' },
                { value: 'complete_per', label: 'Complete PER — record lessons' },
                { value: 'escalate_to_regulator', label: 'Escalate to NERSA' },
                { value: 'withdraw', label: 'Withdraw (false alarm / test)' },
              ],
            },
            { key: 'load_shedding_stage', label: 'Load shedding stage', type: 'number', required: false },
            { key: 'affected_mw', label: 'Affected MW', type: 'number', required: false },
            { key: 'total_outage_duration_min', label: 'Total outage duration (min)', type: 'number', required: false },
            { key: 'per_lead_name', label: 'PER lead name', required: false },
            { key: 'root_cause', label: 'Root cause', type: 'textarea', required: false },
            { key: 'contributing_factors', label: 'Contributing factors', type: 'textarea', required: false },
            { key: 'lessons_learned', label: 'Lessons learned', type: 'textarea', required: false },
            { key: 'action_items', label: 'Action items (JSON array)', type: 'textarea', required: false },
            { key: 'nersa_notification_ref', label: 'NERSA notification reference', required: false },
            { key: 'escalation_reason', label: 'Escalation reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}
