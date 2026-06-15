// pages/src/meridian/surfaces/ipp/InsuranceSurface.tsx — IPP "Insurance" surface.
// Bucket B: extracted verbatim from the retired IppWorkstationPage `insurance` tab body
// (expiring-policies listing + file-claim ActionModal). Self-contained `{ role }` body;
// the husk's `onRefresh` re-fetch trigger is replaced by a local refreshKey on the table.
import { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function InsuranceSurface(_props: { role: string }) {
  const [withinDays, setWithinDays] = useState('90');
  const [claiming, setClaiming] = useState<any | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <label className="block text-[13px]">
          <span className="text-[#6b7685]">Expiring within (days)</span>
          <select value={withinDays} onChange={(e) => setWithinDays(e.target.value)} className="mt-1 h-9 px-3 border border-[#dde4ec] rounded-md text-[13px]">
            <option value="30">30</option><option value="60">60</option>
            <option value="90">90</option><option value="180">180</option>
          </select>
        </label>
      </div>
      <ListingTable
        key={refreshKey}
        endpoint={`/ipp/insurance/expiring?within_days=${withinDays}`}
        rowKey={(r) => r.id}
        empty={{ title: 'No policies expiring', description: 'No active policies expire within the selected window.' }}
        columns={[
          { key: 'policy_number', label: 'Policy', render: (r) => <span className="font-mono text-[11px]">{r.policy_number}</span> },
          { key: 'policy_type', label: 'Type', render: (r) => <Pill tone="info">{(r.policy_type || '').replace(/_/g, ' ')}</Pill> },
          { key: 'insurer', label: 'Insurer' },
          { key: 'sum_insured_zar', label: 'Sum insured', align: 'right', render: (r) => r.sum_insured_zar != null ? Number(r.sum_insured_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
          { key: 'period_end', label: 'Expires', render: (r) => r.period_end },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'active' ? 'good' : 'bad'}>{r.status}</Pill> },
          { key: '_actions', label: '', render: (r) => (
            <button type="button" onClick={() => setClaiming(r)} className="px-2 py-1 text-[11px] bg-[oklch(0.46_0.16_55)] text-white rounded">File claim</button>
          ) },
        ]}
      />
      {claiming && (
        <ActionModal
          title={`File claim against ${claiming.policy_number}`}
          submitLabel="File claim"
          fields={[
            { key: 'claim_number', label: 'Claim number', required: true },
            { key: 'loss_event_date', label: 'Loss event date', type: 'date' },
            { key: 'quantum_zar', label: 'Quantum (ZAR)', type: 'number' },
            { key: 'description', label: 'Description', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setClaiming(null)}
          onSubmit={async (v) => {
            const body: any = { claim_number: v.claim_number };
            if (v.loss_event_date) body.loss_event_date = v.loss_event_date;
            if (v.quantum_zar) body.quantum_zar = Number(v.quantum_zar);
            if (v.description) body.description = v.description;
            await api.post(`/ipp/insurance/policies/${claiming.id}/claim`, body);
            setClaiming(null); setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
