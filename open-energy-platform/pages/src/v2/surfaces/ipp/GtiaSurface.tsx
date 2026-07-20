// pages/src/meridian/surfaces/ipp/GtiaSurface.tsx — IPP "GTIA" surface (W224).
// Bucket B: extracted verbatim from the retired IppWorkstationPage `gtia` tab body. The
// Grid Technical Interface Agreement (W224) has NO MERIDIAN_CHAINS descriptor, so it is a
// standalone surface (not retired to /ledger). Self-contained `{ role }` body; husk
// `onRefresh` replaced by the body's own local refreshKey.
import { useState } from 'react';
import { ListingTable, Pill, ActionModal } from '../../../components/launch/WorkstationShell';
import { StatusPill } from '../../../meridian/components';
import { gtiaViz } from './viz';

const GTIA_TIER_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'bad'> = {
  small: 'neutral', medium: 'info', large: 'warn', bulk: 'bad',
};

function gtiaStatusTone(s: string): 'good' | 'bad' | 'warn' | 'neutral' | 'info' {
  if (s === 'gtia_executed') return 'good';
  if (s === 'ipp_rejected' || s === 'so_rejected') return 'bad';
  if (s === 'protection_settings_agreed' || s === 'scada_interface_agreed') return 'warn';
  if (s === 'so_under_review') return 'info';
  return 'neutral';
}

type GtiaModal = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

export default function GtiaSurface(_props: { role: string }) {
  const [modal, setModal] = useState<GtiaModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button"
          className="btn pri"
          onClick={() => setModal('create')}
        >
          + New GTIA
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/gtia"
        rowKey={(r) => r.id}
        viz={gtiaViz}
        empty={{ title: 'No GTIAs', description: 'Initiate a Grid Technical Interface Agreement to document protection and SCADA settings with the network operator.' }}
        columns={[
          { key: 'network_operator_name', label: 'Network operator', render: (r) => String(r.network_operator_name ?? '—').slice(0, 24) },
          { key: 'gtia_tier', label: 'Tier', render: (r) => <StatusPill status={String(r.gtia_tier)} tone={GTIA_TIER_TONE[String(r.gtia_tier)] ?? 'neutral'} /> },
          { key: 'installed_capacity_mw', label: 'Capacity', align: 'right', render: (r) => r.installed_capacity_mw != null ? `${r.installed_capacity_mw} MW` : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <StatusPill status={String(r.chain_status)} tone={gtiaStatusTone(String(r.chain_status))} /> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">On track</Pill> },
          { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(String(r.updated_at)).toLocaleDateString() : '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="New GTIA"
          submitLabel="Create"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/gtia', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                gtia_tier: v.gtia_tier,
                network_operator_name: v.network_operator_name || undefined,
                project_ref: v.project_ref || undefined,
                gca_ref: v.gca_ref || undefined,
                installed_capacity_mw: v.installed_capacity_mw ? Number(v.installed_capacity_mw) : undefined,
                connection_voltage_kv: v.connection_voltage_kv ? Number(v.connection_voltage_kv) : undefined,
                connection_type: v.connection_type || undefined,
                scada_protocol: v.scada_protocol || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'network_operator_name', label: 'Network operator name', required: true },
            { key: 'gtia_tier', label: 'GTIA tier', type: 'select', required: true, defaultValue: 'medium', options: [
              { value: 'small', label: 'Small (<10 MW, 7d SLA)' },
              { value: 'medium', label: 'Medium (10–100 MW, 14d SLA)' },
              { value: 'large', label: 'Large (100–500 MW, 21d SLA)' },
              { value: 'bulk', label: 'Bulk (>500 MW, 28d SLA)' },
            ]},
            { key: 'installed_capacity_mw', label: 'Installed capacity (MW)', type: 'number', required: false },
            { key: 'connection_voltage_kv', label: 'Connection voltage (kV)', type: 'number', required: false },
            { key: 'connection_type', label: 'Connection type', type: 'select', required: false, options: [
              { value: 'transmission', label: 'Transmission' },
              { value: 'sub_transmission', label: 'Sub-transmission' },
              { value: 'distribution', label: 'Distribution' },
              { value: 'embedded', label: 'Embedded' },
            ]},
            { key: 'scada_protocol', label: 'SCADA protocol', type: 'select', required: false, options: [
              { value: 'iec61850', label: 'IEC 61850' },
              { value: 'dnp3', label: 'DNP3' },
              { value: 'modbus', label: 'Modbus' },
              { value: 'iec104', label: 'IEC 104' },
              { value: 'proprietary', label: 'Proprietary' },
            ]},
            { key: 'project_ref', label: 'Project reference', required: false },
            { key: 'gca_ref', label: 'GCA reference', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title="GTIA action"
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/gtia/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                protection_relay_type: v.protection_relay_type || undefined,
                protection_settings_ref: v.protection_settings_ref || undefined,
                scada_protocol: v.scada_protocol || undefined,
                scada_point_list_ref: v.scada_point_list_ref || undefined,
                metering_class: v.metering_class || undefined,
                rejection_reason: v.rejection_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'initiate_gtia', label: 'Initiate GTIA process' },
              { value: 'raise_queries', label: 'Raise technical queries' },
              { value: 'respond_to_queries', label: 'Respond to queries' },
              { value: 'ipp_approve', label: 'IPP approve interface specs' },
              { value: 'commence_so_review', label: 'Commence SO review' },
              { value: 'agree_protection_settings', label: 'Agree protection relay settings' },
              { value: 'agree_scada_interface', label: 'Agree SCADA/metering interface' },
              { value: 'execute_gtia', label: 'Execute GTIA (sign & register)' },
              { value: 'ipp_reject', label: 'IPP reject interface requirements' },
              { value: 'so_reject', label: 'SO reject IPP technical specs' },
              { value: 'withdraw', label: 'Withdraw' },
            ]},
            { key: 'protection_relay_type', label: 'Protection relay type', required: false },
            { key: 'protection_settings_ref', label: 'Protection settings document ref', required: false },
            { key: 'scada_protocol', label: 'SCADA protocol', type: 'select', required: false, options: [
              { value: 'iec61850', label: 'IEC 61850' },
              { value: 'dnp3', label: 'DNP3' },
              { value: 'modbus', label: 'Modbus' },
              { value: 'iec104', label: 'IEC 104' },
            ]},
            { key: 'scada_point_list_ref', label: 'SCADA point list reference', required: false },
            { key: 'metering_class', label: 'Metering class', required: false },
            { key: 'rejection_reason', label: 'Rejection reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}
