// pages/src/meridian/surfaces/esumsom/WorkOrdersSurface.tsx
//
// Meridian surface — "Work orders" (esco / esums_owner O&M role). Extracted verbatim from the
// `workorders` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, date
// formatting, StatusPill, rowActions) is preserved identically. Registered as `esco:workorders`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `workorders`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';
import { workOrdersViz } from './viz';

export default function WorkOrdersSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'workorders',
      label: 'Work orders',
      endpoint: '/esums/work-orders',
      description: '12-state WO lifecycle. Tap a row to drill into the timeline, parts, photos and SLA tracking.',
      viz: workOrdersViz,
      columns: [
        { key: 'wo_number',     label: 'WO #' },
        { key: 'site_id',       label: 'Site' },
        { key: 'title',         label: 'Title' },
        { key: 'category',      label: 'Type' },
        { key: 'priority',      label: 'Priority', render: (r) => <StatusPill status={String(r.priority)} /> },
        { key: 'status',        label: 'Status',   render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'technician_name', label: 'Tech' },
        { key: 'sla_deadline',  label: 'SLA', date: true },
      ],
      rowActions: [
        { label: 'Acknowledge', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Acknowledge WO', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true,
              options: [{ value: 'acknowledged', label: 'Acknowledged' }, { value: 'cancelled', label: 'Cancelled' }]},
          ]}},
        { label: 'En route', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Mark en route', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'en_route', label: 'En route' }]},
          ]}},
        { label: 'On site', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Arrived on site', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'on_site', label: 'On site' }]},
          ]}},
        { label: 'Complete', tone: 'primary', endpoint: '/esums/work-orders/{id}/transition',
          form: { title: 'Complete WO', endpoint: '', fields: [
            { name: 'to', label: 'Next state', type: 'select', required: true, options: [{ value: 'completed', label: 'Completed' }]},
            { name: 'resolution_notes', label: 'Resolution notes', type: 'textarea', required: true },
          ]}},
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="O&M · Operations"
      title="Work orders"
      subtitle="12-state work-order lifecycle with SLA tracking."
      tabs={tabs}
      initialTab="workorders"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
