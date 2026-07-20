// pages/src/meridian/surfaces/offtaker/TariffsSurface.tsx
//
// Meridian surface — "Tariffs" (offtaker role). Extracted verbatim from the inline `TariffsTab`
// body of the OfftakerWorkstationPage husk (E2.6). Self-contained: lists active utility tariffs
// via the shared ListingTable against /offtaker-suite/tariffs. Registered as `offtaker:tariffs`
// in surfaces.tsx, reached from Atlas (⌘K) via the roleData feature key `tariffs` (added in E2.6).
// Non-chain master-data surface (Bucket B).
import React from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';

export default function TariffsSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/offtaker-suite/tariffs"
      rowKey={(r) => r.id}
      empty={{ title: 'No tariffs', description: 'Active utility tariffs will appear here for comparison and assignment.' }}
      columns={[
        { key: 'tariff_code', label: 'Code', render: (r) => <span className="font-mono text-[11px]">{r.tariff_code}</span> },
        { key: 'tariff_name', label: 'Name' },
        { key: 'utility', label: 'Utility' },
        { key: 'category', label: 'Category' },
        { key: 'structure_type', label: 'Structure', render: (r) => <Pill tone="info">{r.structure_type}</Pill> },
        { key: 'effective_from', label: 'Effective from' },
      ]}
    />
  );
}
