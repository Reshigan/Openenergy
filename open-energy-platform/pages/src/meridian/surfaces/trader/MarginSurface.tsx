// pages/src/meridian/surfaces/trader/MarginSurface.tsx
//
// Meridian surface — "Margin calls" (trader role). Extracted verbatim from the inline
// `MarginTab` body of the TraderWorkstationPage husk (E2.3). Lists IM/VM margin calls with a
// best-effort "Run margin scan" trigger. Non-chain listing surface (Bucket B). Registered as
// `trader:margin` in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key `margin`.
import React, { useState } from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';
import { api } from '../../../lib/api';

export default function MarginSurface(_props: { role: string }) {
  const [running, setRunning] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const onRefresh = () => setRefreshKey((k) => k + 1);
  const runScan = async () => {
    setRunning(true);
    try {
      await api.post('/trader-risk/margin-calls/run', {});
      onRefresh();
    } catch {
      // Best-effort — non-risk-officer roles get a 403 and that's fine.
    } finally { setRunning(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={runScan} disabled={running} className="h-9 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold disabled:opacity-50">
          {running ? 'Running…' : 'Run margin scan'}
        </button>
      </div>
      <ListingTable
        key={refreshKey}
        endpoint="/trader-risk/margin-calls"
        rowKey={(r) => r.id}
        empty={{ title: 'No margin calls', description: 'When exposure exceeds posted collateral, calls land here with a due-by timestamp.' }}
        columns={[
          { key: 'as_of', label: 'As of', render: (r) => new Date(r.as_of).toLocaleString() },
          { key: 'exposure_zar', label: 'Exposure', align: 'right', render: (r) => Number(r.exposure_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'initial_margin_zar', label: 'IM', align: 'right', render: (r) => Number(r.initial_margin_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'posted_collateral_zar', label: 'Posted', align: 'right', render: (r) => Number(r.posted_collateral_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }) },
          { key: 'shortfall_zar', label: 'Shortfall', align: 'right', render: (r) => <span className="text-red-700 font-semibold">{Number(r.shortfall_zar || 0).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</span> },
          { key: 'due_by', label: 'Due by', render: (r) => r.due_by ? new Date(r.due_by).toLocaleString() : '—' },
          { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'met' ? 'good' : r.status === 'defaulted' ? 'bad' : 'warn'}>{r.status}</Pill> },
        ]}
      />
    </div>
  );
}
