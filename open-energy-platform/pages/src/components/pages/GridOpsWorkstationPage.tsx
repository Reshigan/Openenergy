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
        { key: 'ancillary', label: 'Ancillary services', group: 'Operations', body: ({ onRefresh }) => <AncillaryTab onRefresh={onRefresh} /> },
        { key: 'imbalance-settlement', label: 'Imbalance settlement', group: 'Operations', body: () => <ImbalanceSettlementChainTab /> },
        { key: 'wheeling_charges', label: 'Wheeling charges', group: 'Operations', body: () => <WheelingChargesTab /> },
        { key: 'rez_capacity', label: 'REZ capacity allocation', group: 'Connections', body: () => <RezCapacityChainTab /> },
        { key: 'transmission-outage', label: 'Transmission outage coordination', group: 'Connections', body: () => <TransmissionOutageChainTab /> },
        { key: 'outage', label: 'Outage responses', group: 'Connections', body: ({ onRefresh }) => <OutageTab onRefresh={onRefresh} /> },
        { key: 'planned_outage', label: 'Planned outages', group: 'Compliance', body: () => <PlannedOutageChainTab /> },
        { key: 'scada-connectors', label: 'SCADA data', group: 'Compliance', body: () => <ScadaConnectorTab /> },
        { key: 'mqtt-opcua-connectors', label: 'MQTT/OPC-UA connectors', group: 'Compliance', body: () => <MqttOpcuaConnectorTab /> },
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
