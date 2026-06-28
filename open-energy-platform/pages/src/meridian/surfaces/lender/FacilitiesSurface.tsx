// pages/src/meridian/surfaces/lender/FacilitiesSurface.tsx
//
// Meridian surface — "Facilities" (lender role). Extracted verbatim from the inline
// `FacilitiesTab` body of the LenderWorkstationPage husk (E2.8e). Self-contained: lists the
// active credit-facility portfolio via the shared ListingTable against /funder/facilities.
// Registered as `lender:facilities` in surfaces.tsx, reached from Atlas (⌘K) via the roleData
// feature key `facilities`. Non-chain listing surface (Bucket B).
import React from 'react';
import { ListingTable, Pill } from '../../../components/launch/WorkstationShell';
import { statusLabel } from '../../ease/statusLabel';

export default function FacilitiesSurface(_props: { role: string }) {
  return (
    <ListingTable
      endpoint="/funder/facilities"
      rowKey={(r) => r.id}
      empty={{ title: 'No facilities', description: 'No active lender facilities yet. Originate one from the credit-origination tab.' }}
      columns={[
        { key: 'facility_name', label: 'Facility', render: (r) => r.facility_name || r.borrower_name || r.id },
        { key: 'facility_type', label: 'Type', render: (r) => <Pill tone="info">{(r.facility_type || r.product_type || 'unknown').replace(/_/g, ' ')}</Pill> },
        { key: 'facility_amount_zar', label: 'Amount', align: 'right', render: (r) => r.facility_amount_zar != null ? Number(r.facility_amount_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
        { key: 'tenor_months', label: 'Tenor', align: 'right', render: (r) => r.tenor_months != null ? `${r.tenor_months}m` : '—' },
        { key: 'lifecycle_stage', label: 'Stage', render: (r) => <Pill tone={r.lifecycle_stage === 'operational' ? 'good' : r.lifecycle_stage === 'in_default' ? 'bad' : 'neutral'}>{statusLabel(r.lifecycle_stage || r.status).text}</Pill> },
        { key: 'updated_at', label: 'Updated', render: (r) => r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—' },
      ]}
    />
  );
}
