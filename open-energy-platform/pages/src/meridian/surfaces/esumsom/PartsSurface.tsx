// pages/src/meridian/surfaces/esumsom/PartsSurface.tsx
//
// Meridian surface — "Parts" (esco / esums_owner O&M role). Extracted verbatim from the
// `parts` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, currency
// formatting) is preserved identically. This tab does NOT use StatusPill so it is not imported.
// Registered as `esco:parts` in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `parts`.
import React from 'react';
import { SuitePage, TabSpec } from '../../../components/SuitePage';

export default function PartsSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'parts',
      label: 'Parts',
      endpoint: '/esums/parts',
      description: 'Parts catalogue and stock. Low-stock items highlighted for reorder.',
      columns: [
        { key: 'part_number', label: 'Part #' },
        { key: 'name', label: 'Name' },
        { key: 'manufacturer', label: 'OEM' },
        { key: 'unit_cost_zar', label: 'Unit cost', align: 'right', currency: true },
        { key: 'current_stock', label: 'Stock', align: 'right', number: true },
        { key: 'min_stock_qty', label: 'Min', align: 'right', number: true },
        { key: 'lead_time_days', label: 'Lead (d)', align: 'right', number: true },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Parts"
      subtitle="Parts catalogue and stock with low-stock reorder flags."
      tabs={tabs}
      initialTab="parts"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
