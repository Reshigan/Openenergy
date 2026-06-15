// pages/src/meridian/surfaces/esumsom/PredictionsSurface.tsx
//
// Meridian surface — "Predictive" (esco / esums_owner O&M role). Extracted verbatim from the
// `predictions` tab body of the retired EsumsOmPage SuitePage husk (E2.2). Self-contained:
// it renders a single-tab SuitePage so the inline SuiteTable behaviour (columns, params,
// currency/date formatting, StatusPill) is preserved identically. Registered as `esco:predictions`
// in surfaces.tsx and reached from Atlas (⌘K) via the roleData feature key `predictions`.
import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../../../components/SuitePage';

export default function PredictionsSurface(_props: { role: string }) {
  const tabs: TabSpec[] = [
    {
      key: 'predictions',
      label: 'Predictive',
      endpoint: '/esums/predictions',
      description: 'AI-derived predictive maintenance signals — surfaces likely failures weeks before they happen.',
      params: { status: 'open' },
      columns: [
        { key: 'site_id', label: 'Site' },
        { key: 'prediction_type', label: 'Prediction' },
        { key: 'confidence', label: 'Confidence', align: 'right', number: true },
        { key: 'estimated_failure_at', label: 'Likely by', date: true },
        { key: 'estimated_loss_zar', label: 'If ignored', align: 'right', currency: true },
        { key: 'recommended_action', label: 'Recommendation' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
    },
  ];
  return (
    <SuitePage
      eyebrow="Esums · Operations"
      title="Predictive"
      subtitle="AI-derived predictive maintenance signals."
      tabs={tabs}
      initialTab="predictions"
      aiBriefAccent={{ from: '#1e3a5f', to: '#336a38' }}
    />
  );
}
