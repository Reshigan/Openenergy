// pages/src/meridian/surfaces/carbon/CertificatesSurface.tsx
//
// Meridian surface — "Retirement certificates" (carbon_fund role). Extracted verbatim from
// the `certificates` tab body of the CarbonWorkstationPage husk (E2.8c). Self-contained:
// lists certificates via ListingTable against /carbon-registry/retirement-certificates and
// issues them via POST /carbon-registry/retirement-certificates/issue. Registered as
// `carbon_fund:certificates` in surfaces.tsx, reached from Atlas (⌘K) via roleData feature
// key `certificates`. Non-chain CRUD surface (Bucket B).
import React, { useState } from 'react';
import { ListingTable, Pill, ActionModal, FieldSpec } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

export default function CertificatesSurface(_props: { role: string }) {
  const [issuing, setIssuing] = useState(false);
  const [bump, setBump] = useState(0);
  return (
    <div>
      <Header onCreate={() => setIssuing(true)} label="Issue certificate" />
      <ListingTable
        key={`certificates-${bump}`}
        endpoint="/carbon-registry/retirement-certificates"
        rowKey={(r) => r.id}
        empty={{ title: 'No retirement certificates', description: 'Certificates issued for retired tCO₂e on behalf of buyers will appear here.' }}
        columns={[
          { key: 'certificate_number', label: 'Certificate', render: (r) => <span className="font-mono text-[11px]">{r.certificate_number}</span> },
          { key: 'beneficiary_name', label: 'Beneficiary' },
          { key: 'retired_volume_tco2e', label: 'tCO₂e', align: 'right', render: (r) => Number(r.retired_volume_tco2e || 0).toFixed(1) },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'delivered' ? 'good' : r.status === 'revoked' ? 'bad' : 'info'}>{r.status}</Pill> },
          { key: 'issued_at', label: 'Issued', render: (r) => r.issued_at ? new Date(r.issued_at).toLocaleDateString() : '—' },
        ]}
      />
      {issuing && (
        <ActionModal
          title="Issue retirement certificate"
          submitLabel="Issue"
          fields={[
            { key: 'retirement_id', label: 'Retirement ID', required: true, placeholder: 'retirement_…' },
            { key: 'retired_volume_tco2e', label: 'Retired tCO₂e', type: 'number', required: true },
            { key: 'beneficiary_name', label: 'Beneficiary name' },
            { key: 'beneficiary_email', label: 'Beneficiary email' },
          ] as FieldSpec[]}
          onClose={() => setIssuing(false)}
          onSubmit={async (v) => {
            await api.post('/carbon-registry/retirement-certificates/issue', {
              retirement_id: v.retirement_id,
              retired_volume_tco2e: Number(v.retired_volume_tco2e),
              beneficiary_name: v.beneficiary_name || undefined,
              beneficiary_email: v.beneficiary_email || undefined,
            });
            setIssuing(false); setBump((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
