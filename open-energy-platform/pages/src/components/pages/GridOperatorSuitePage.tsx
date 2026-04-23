import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';

const instructionTypes = [
  { value: 'curtail', label: 'Curtail' },
  { value: 'redispatch', label: 'Redispatch' },
  { value: 'ramp_up', label: 'Ramp up' },
  { value: 'ramp_down', label: 'Ramp down' },
  { value: 'start', label: 'Start' },
  { value: 'stop', label: 'Stop' },
  { value: 'islanding', label: 'Islanding' },
  { value: 'black_start', label: 'Black start' },
];

export function GridOperatorSuitePage() {
  const tabs: TabSpec[] = [
    {
      key: 'dispatch',
      label: 'Dispatch schedules',
      endpoint: '/grid-operator/dispatch/schedules',
      description:
        'Day-ahead and intraday schedules cleared by the system operator. Click a row for per-period breakdown.',
      columns: [
        { key: 'schedule_type', label: 'Type' },
        { key: 'trading_day', label: 'Day', date: true },
        { key: 'gate_closure_at', label: 'Gate closure' },
        { key: 'published_at', label: 'Published' },
        { key: 'total_scheduled_mwh', label: 'MWh', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'New dispatch schedule',
        endpoint: '/grid-operator/dispatch/schedules',
        fields: [
          { name: 'schedule_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'day_ahead', label: 'Day-ahead' },
            { value: 'intraday', label: 'Intraday' },
            { value: 'real_time', label: 'Real-time' },
            { value: 'balancing', label: 'Balancing' },
          ] },
          { name: 'trading_day', label: 'Trading day', type: 'date', required: true },
          { name: 'gate_closure_at', label: 'Gate closure', type: 'datetime', required: true },
        ],
      },
      rowActions: [
        { label: 'Publish', tone: 'primary', endpoint: '/grid-operator/dispatch/schedules/{id}/publish',
          show: (r) => r.status === 'draft', confirm: 'Publish this schedule?' },
      ],
      detail: {
        endpoint: '/grid-operator/dispatch/schedules/{id}',
        children: [
          { dataKey: 'periods', label: 'Periods', columns: [
            { key: 'period_start', label: 'From' },
            { key: 'period_end', label: 'To' },
            { key: 'participant_id', label: 'Participant' },
            { key: 'scheduled_mwh', label: 'MWh', align: 'right', number: true },
            { key: 'cleared_price_zar_mwh', label: 'R/MWh', align: 'right', currency: true },
            { key: 'zone', label: 'Zone' },
          ] },
        ],
      },
    },
    {
      key: 'instructions',
      label: 'Dispatch instructions',
      endpoint: '/grid-operator/dispatch/instructions',
      description:
        'Curtail / redispatch / ramp / black-start instructions. Generators must acknowledge; non-compliance may attract penalties.',
      columns: [
        { key: 'instruction_number', label: '#' },
        { key: 'participant_id', label: 'Participant' },
        { key: 'instruction_type', label: 'Type' },
        { key: 'target_mw', label: 'MW', align: 'right', number: true },
        { key: 'effective_from', label: 'From' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'penalty_amount_zar', label: 'Penalty', align: 'right', currency: true },
      ],
      create: {
        title: 'Issue dispatch instruction',
        endpoint: '/grid-operator/dispatch/instructions',
        fields: [
          { name: 'instruction_number', label: 'Instruction #', type: 'text', required: true },
          { name: 'participant_id', label: 'Generator participant ID', type: 'text', required: true },
          { name: 'site_id', label: 'Site ID', type: 'text' },
          { name: 'instruction_type', label: 'Type', type: 'select', required: true, options: instructionTypes },
          { name: 'effective_from', label: 'Effective from', type: 'datetime', required: true },
          { name: 'effective_to', label: 'Effective to', type: 'datetime' },
          { name: 'target_mw', label: 'Target MW', type: 'number' },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true },
          { name: 'grid_constraint_id', label: 'Related grid_constraint ID', type: 'text' },
        ],
      },
      rowActions: [
        { label: 'Acknowledge', endpoint: '/grid-operator/dispatch/instructions/{id}/acknowledge',
          show: (r) => r.status === 'issued', confirm: 'Acknowledge receipt of this instruction?' },
        { label: 'Compliant', tone: 'primary', endpoint: '/grid-operator/dispatch/instructions/{id}/compliance',
          show: (r) => ['issued', 'acknowledged'].includes(String(r.status)),
          form: { title: 'Mark compliance outcome', endpoint: '', fields: [
            { name: 'compliant', label: 'Compliant?', type: 'checkbox', default: true },
            { name: 'evidence_r2_key', label: 'Evidence R2 key', type: 'text' },
            { name: 'penalty_amount_zar', label: 'Penalty (ZAR)', type: 'number', help: 'Only if non-compliant.' },
          ] },
        },
      ],
    },
    {
      key: 'curtailment',
      label: 'Curtailment',
      endpoint: '/grid-operator/curtailment-notices',
      description: 'Bulk curtailment notices — advisory, mandatory or emergency.',
      columns: [
        { key: 'notice_number', label: '#' },
        { key: 'affected_zone', label: 'Zone' },
        { key: 'curtailment_mw', label: 'MW', align: 'right', number: true },
        { key: 'severity', label: 'Severity', render: (r) => <StatusPill status={String(r.severity)} /> },
        { key: 'effective_from', label: 'From' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Issue curtailment notice',
        endpoint: '/grid-operator/curtailment-notices',
        fields: [
          { name: 'notice_number', label: 'Notice #', type: 'text', required: true },
          { name: 'effective_from', label: 'Effective from', type: 'datetime', required: true },
          { name: 'effective_to', label: 'Effective to', type: 'datetime' },
          { name: 'affected_zone', label: 'Affected zone', type: 'text' },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true },
          { name: 'curtailment_mw', label: 'Curtailment MW', type: 'number' },
          { name: 'severity', label: 'Severity', type: 'select', options: [
            { value: 'advisory', label: 'Advisory' },
            { value: 'mandatory', label: 'Mandatory' },
            { value: 'emergency', label: 'Emergency' },
          ] },
        ],
      },
      rowActions: [
        { label: 'Lift', tone: 'primary', endpoint: '/grid-operator/curtailment-notices/{id}/lift',
          show: (r) => r.status === 'active', confirm: 'Lift this curtailment notice?' },
      ],
    },
    {
      key: 'ancillary',
      label: 'Ancillary tenders',
      endpoint: '/grid-operator/ancillary/tenders',
      description:
        'FCR / aFRR / mFRR / reserves / black-start procurement. Merit-order pay-as-cleared auctions.',
      columns: [
        { key: 'tender_number', label: 'Tender' },
        { key: 'service_type', label: 'Service' },
        { key: 'capacity_required_mw', label: 'MW needed', align: 'right', number: true },
        { key: 'ceiling_price_zar_mw_h', label: 'Ceiling R/MWh', align: 'right', currency: true },
        { key: 'delivery_window_start', label: 'From', date: true },
        { key: 'gate_closure_at', label: 'Gate closure' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'New ancillary service tender',
        endpoint: '/grid-operator/ancillary/tenders',
        fields: [
          { name: 'tender_number', label: 'Tender number', type: 'text', required: true },
          { name: 'product_id', label: 'Product ID', type: 'select', required: true, options: [
            { value: 'asp_fcr', label: 'FCR 4h' },
            { value: 'asp_afrr', label: 'aFRR 4h' },
            { value: 'asp_mfrr', label: 'mFRR 15min' },
            { value: 'asp_10min', label: '10-min reserve' },
            { value: 'asp_ramp', label: 'Ramping reserve' },
            { value: 'asp_black', label: 'Black start' },
            { value: 'asp_qvar', label: 'Reactive / voltage' },
          ] },
          { name: 'delivery_window_start', label: 'Delivery from', type: 'datetime', required: true },
          { name: 'delivery_window_end', label: 'Delivery to', type: 'datetime', required: true },
          { name: 'capacity_required_mw', label: 'Capacity required (MW)', type: 'number', required: true },
          { name: 'ceiling_price_zar_mw_h', label: 'Ceiling price (R/MWh)', type: 'number' },
          { name: 'gate_closure_at', label: 'Gate closure', type: 'datetime', required: true },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
      rowActions: [
        { label: 'Bid', endpoint: '/grid-operator/ancillary/tenders/{id}/bids',
          show: (r) => r.status === 'open',
          form: { title: 'Submit bid', endpoint: '', fields: [
            { name: 'capacity_offered_mw', label: 'Capacity offered (MW)', type: 'number', required: true },
            { name: 'price_zar_mw_h', label: 'Price (R/MWh)', type: 'number', required: true },
            { name: 'site_id', label: 'Site ID', type: 'text' },
          ] },
        },
        { label: 'Clear', tone: 'primary', endpoint: '/grid-operator/ancillary/tenders/{id}/clear',
          show: (r) => ['open', 'closed'].includes(String(r.status)),
          confirm: 'Run merit-order clearing for this tender?' },
      ],
    },
    {
      key: 'outages',
      label: 'Outages',
      endpoint: '/grid-operator/outages',
      description:
        'Bulk transmission / distribution outages. Post updates as the situation evolves.',
      columns: [
        { key: 'outage_number', label: '#' },
        { key: 'outage_type', label: 'Type' },
        { key: 'severity', label: 'Severity', render: (r) => <StatusPill status={String(r.severity)} /> },
        { key: 'affected_zone', label: 'Zone' },
        { key: 'affected_load_mw', label: 'Load (MW)', align: 'right', number: true },
        { key: 'affected_customers', label: 'Customers', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Report outage',
        endpoint: '/grid-operator/outages',
        fields: [
          { name: 'outage_number', label: 'Outage #', type: 'text', required: true },
          { name: 'outage_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'planned', label: 'Planned' },
            { value: 'unplanned', label: 'Unplanned' },
            { value: 'forced', label: 'Forced' },
            { value: 'emergency', label: 'Emergency' },
            { value: 'load_shedding', label: 'Load shedding' },
            { value: 'maintenance', label: 'Maintenance' },
          ] },
          { name: 'severity', label: 'Severity', type: 'select', options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'critical', label: 'Critical' },
          ] },
          { name: 'reported_at', label: 'Reported at', type: 'datetime', required: true },
          { name: 'started_at', label: 'Started at', type: 'datetime' },
          { name: 'estimated_restoration_at', label: 'ETA restoration', type: 'datetime' },
          { name: 'affected_zone', label: 'Affected zone', type: 'text' },
          { name: 'affected_load_mw', label: 'Affected load (MW)', type: 'number' },
          { name: 'affected_customers', label: 'Affected customers', type: 'number' },
          { name: 'cause', label: 'Cause', type: 'textarea' },
        ],
      },
      rowActions: [
        { label: '+ Update', endpoint: '/grid-operator/outages/{id}/updates',
          form: { title: 'Post outage update', endpoint: '', fields: [
            { name: 'update_text', label: 'Update', type: 'textarea', required: true },
            { name: 'affected_load_mw', label: 'Still-affected load (MW)', type: 'number' },
            { name: 'restored_load_mw', label: 'Restored load (MW)', type: 'number' },
            { name: 'status', label: 'New status', type: 'select', options: [
              { value: 'investigating', label: 'Investigating' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'partial_restoration', label: 'Partial restoration' },
              { value: 'restored', label: 'Restored' },
              { value: 'closed', label: 'Closed' },
            ] },
          ] },
        },
      ],
    },
    {
      key: 'connections',
      label: 'Connection applications',
      endpoint: '/grid-operator/connection-applications',
      description:
        'NERSA Grid Connection Code — enquiry → study → cost letter → GCA → construction → energised.',
      columns: [
        { key: 'application_number', label: '#' },
        { key: 'applicant_participant_id', label: 'Applicant' },
        { key: 'substation', label: 'Substation' },
        { key: 'voltage_kv', label: 'kV', align: 'right', number: true },
        { key: 'requested_capacity_mw', label: 'Req MW', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Log connection enquiry',
        endpoint: '/grid-operator/connection-applications',
        fields: [
          { name: 'application_number', label: 'Application #', type: 'text', required: true },
          { name: 'substation', label: 'Substation', type: 'text', required: true },
          { name: 'voltage_kv', label: 'Voltage (kV)', type: 'number', required: true },
          { name: 'requested_capacity_mw', label: 'Requested MW', type: 'number', required: true },
          { name: 'technology', label: 'Technology', type: 'text' },
          { name: 'connection_type', label: 'Connection type', type: 'select', required: true, options: [
            { value: 'new_generator', label: 'New generator' },
            { value: 'capacity_increase', label: 'Capacity increase' },
            { value: 'voltage_upgrade', label: 'Voltage upgrade' },
            { value: 'new_consumer', label: 'New consumer' },
            { value: 'relocation', label: 'Relocation' },
          ] },
          { name: 'project_id', label: 'Linked IPP project ID', type: 'text' },
          { name: 'target_energisation_date', label: 'Target energisation', type: 'date' },
        ],
      },
      rowActions: [
        { label: 'Advance', tone: 'primary', endpoint: '/grid-operator/connection-applications/{id}/advance',
          form: { title: 'Advance application', endpoint: '', fields: [
            { name: 'status', label: 'New status', type: 'select', required: true, options: [
              { value: 'screening', label: 'Screening' },
              { value: 'grid_study', label: 'Grid study' },
              { value: 'cost_estimate', label: 'Cost estimate' },
              { value: 'budget_quote', label: 'Budget quote' },
              { value: 'cost_letter_issued', label: 'Cost letter issued' },
              { value: 'cost_letter_accepted', label: 'Cost letter accepted' },
              { value: 'gca_drafted', label: 'GCA drafted' },
              { value: 'gca_signed', label: 'GCA signed' },
              { value: 'construction', label: 'Construction' },
              { value: 'commissioning', label: 'Commissioning' },
              { value: 'energised', label: 'Energised' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'withdrawn', label: 'Withdrawn' },
            ] },
            { name: 'grid_study_fee_zar', label: 'Grid study fee (ZAR)', type: 'number' },
            { name: 'connection_cost_estimate_zar', label: 'Cost estimate (ZAR)', type: 'number' },
            { name: 'confirmed_capacity_mw', label: 'Confirmed MW', type: 'number' },
            { name: 'actual_energisation_date', label: 'Actual energisation', type: 'date' },
            { name: 'assigned_engineer_id', label: 'Assigned engineer ID', type: 'text' },
            { name: 'rejection_reason', label: 'Rejection reason', type: 'textarea' },
            { name: 'description', label: 'Event note', type: 'textarea' },
            { name: 'document_r2_key', label: 'Document R2 key', type: 'text' },
          ] },
        },
      ],
    },
    {
      key: 'zones',
      label: 'Nodal zones',
      endpoint: '/grid-operator/zones',
      description: 'Zones used for locational pricing. Loss factors filed per month.',
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Name' },
        { key: 'region', label: 'Region' },
        { key: 'voltage_class', label: 'Voltage' },
      ],
      create: {
        title: 'New nodal zone',
        endpoint: '/grid-operator/zones',
        fields: [
          { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'ZA-GP-01' },
          { name: 'name', label: 'Name', type: 'text', required: true },
          { name: 'region', label: 'Region', type: 'text', required: true },
          { name: 'voltage_class', label: 'Voltage class', type: 'select', options: [
            { value: 'HV_400', label: '400 kV' },
            { value: 'HV_275', label: '275 kV' },
            { value: 'HV_132', label: '132 kV' },
            { value: 'MV', label: 'MV' },
          ] },
        ],
      },
      rowActions: [
        { label: '+ Loss factor', endpoint: '/grid-operator/zones/{code}/loss-factor',
          form: { title: 'File monthly loss factor', endpoint: '', fields: [
            { name: 'effective_month', label: 'Month', type: 'text', required: true, placeholder: '2026-04' },
            { name: 'loss_factor_pct', label: 'Loss factor (%)', type: 'number', required: true },
            { name: 'methodology', label: 'Methodology', type: 'select', options: [
              { value: 'measured', label: 'Measured' },
              { value: 'forecast', label: 'Forecast' },
              { value: 'average_system_loss', label: 'Avg system loss' },
            ] },
            { name: 'approved', label: 'Approved?', type: 'checkbox' },
          ] },
        },
      ],
    },
  ];

  return (
    <SuitePage
      title="System operator workbench"
      subtitle="Dispatch, ancillary markets, outages, curtailment and connections — aligned to the SA Grid Code."
      tabs={tabs}
      aiBriefRole="grid_operator"
      aiBriefAccent={{ from: '#b04e0f', to: '#bb0000' }}
    />
  );
}
