// pages/src/meridian/surfaces/carbon/VintagesSurface.tsx
//
// Meridian surface — "Vintage workflow" (carbon_fund role). Extracted verbatim from the
// `vintages` tab body of the CarbonWorkstationPage husk (E2.8c). Self-contained: fetches
// its own data via the shared ListingTable against /carbon-registry/vintage-workflow and
// advances vintage stages via POST /carbon-registry/vintage-workflow/:id/advance.
// Registered as `carbon_fund:vintages` in surfaces.tsx, reached from Atlas (⌘K) via the
// roleData feature key `vintages`. Non-chain CRUD surface (Bucket B) — no MERIDIAN_CHAINS
// descriptor, so extracted rather than retired to /ledger.
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

const STAGE_OPTIONS = [
  { value: 'validated', label: 'Validated' },
  { value: 'listed', label: 'Listed' },
  { value: 'traded', label: 'Traded' },
  { value: 'retired_partial', label: 'Retired (partial)' },
  { value: 'retired_full', label: 'Retired (full)' },
  { value: 'expired', label: 'Expired' },
];

export default function VintagesSurface(_props: { role: string }) {
  const [advancing, setAdvancing] = useState<any | null>(null);
  const [bump, setBump] = useState(0);
  return (
    <div>
      <ListingTable
        key={`vintages-${bump}`}
        endpoint="/carbon-registry/vintage-workflow"
        rowKey={(r) => r.id}
        rowHref={(r) => `/carbon-registry/vintages/${r.id}`}
        empty={{ title: 'No vintages in workflow', description: 'Vintage cohorts will appear here as they progress through issued → validated → listed → traded → retired.' }}
        columns={[
          { key: 'vintage_id', label: 'Vintage', render: (r) => <span className="font-mono text-[11px]">{(r.vintage_id || '').slice(0, 12)}…</span> },
          { key: 'current_stage', label: 'Stage', render: (r) => <Pill tone={r.current_stage === 'retired_full' ? 'good' : 'info'}>{r.current_stage.replace(/_/g, ' ')}</Pill> },
          { key: 'retired_volume_tco2e', label: 'Retired tCO₂e', align: 'right', render: (r) => Number(r.retired_volume_tco2e || 0).toFixed(1) },
          { key: 'outstanding_tco2e', label: 'Outstanding tCO₂e', align: 'right', render: (r) => Number(r.outstanding_tco2e || 0).toFixed(1) },
          { key: 'updated_at', label: 'Updated', render: (r) => new Date(r.updated_at).toLocaleDateString() },
          { key: '_actions', label: '', render: (r) => (
            <button type="button" onClick={() => setAdvancing(r)} className="px-2 py-1 text-[11px] bg-[#c2873a] text-white rounded">Advance</button>
          ) },
        ]}
      />
      {advancing && (
        <ActionModal
          title={`Advance vintage stage · current: ${advancing.current_stage}`}
          submitLabel="Advance"
          fields={[
            { key: 'to_stage', label: 'Next stage', type: 'select', required: true, options: STAGE_OPTIONS },
          ] as FieldSpec[]}
          onClose={() => setAdvancing(null)}
          onSubmit={async (v) => {
            await api.post(`/carbon-registry/vintage-workflow/${advancing.id}/advance`, { to_stage: v.to_stage });
            setAdvancing(null); setBump((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
