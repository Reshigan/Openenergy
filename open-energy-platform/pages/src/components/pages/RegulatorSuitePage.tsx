import React from 'react';
import { SuitePage, StatusPill, Column, TabSpec } from '../SuitePage';

export function RegulatorSuitePage() {
  const tabs: TabSpec[] = [
    // ─── Licences ────────────────────────────────────────────────────────
    {
      key: 'licences',
      label: 'Licences',
      endpoint: '/regulator/licences',
      description:
        'Generation, distribution, trading and transmission licences issued under Electricity Regulation Act 4 of 2006 s.8. Click a row for conditions + lifecycle history.',
      emptyHint: 'Issue a licence via the New button to start the register.',
      columns: [
        { key: 'licence_number', label: 'Number' },
        { key: 'licensee_name', label: 'Licensee' },
        { key: 'licence_type', label: 'Type' },
        { key: 'technology', label: 'Technology' },
        { key: 'capacity_mw', label: 'MW', align: 'right', number: true },
        { key: 'issue_date', label: 'Issued', date: true },
        { key: 'expiry_date', label: 'Expires', date: true },
        {
          key: 'status', label: 'Status',
          render: (r) => <StatusPill status={String(r.status)} />,
        },
      ],
      create: {
        title: 'Issue new licence',
        endpoint: '/regulator/licences',
        fields: [
          { name: 'licence_number', label: 'Licence number', type: 'text', required: true, placeholder: 'GEN-2026-0001' },
          { name: 'licensee_name', label: 'Licensee name', type: 'text', required: true },
          { name: 'licensee_participant_id', label: 'Licensee participant ID', type: 'text', help: 'Optional — link to an existing participant.' },
          { name: 'licence_type', label: 'Licence type', type: 'select', required: true, options: [
            { value: 'generation', label: 'Generation' },
            { value: 'distribution', label: 'Distribution' },
            { value: 'trading', label: 'Trading' },
            { value: 'transmission', label: 'Transmission' },
            { value: 'import', label: 'Import' },
            { value: 'export', label: 'Export' },
            { value: 'reticulation', label: 'Reticulation' },
          ] },
          { name: 'technology', label: 'Technology', type: 'select', options: [
            { value: 'solar_pv', label: 'Solar PV' },
            { value: 'wind', label: 'Wind' },
            { value: 'hydro', label: 'Hydro' },
            { value: 'thermal', label: 'Thermal' },
            { value: 'storage', label: 'Storage' },
            { value: 'hybrid', label: 'Hybrid' },
            { value: 'n/a', label: 'N/A' },
          ] },
          { name: 'capacity_mw', label: 'Capacity MW', type: 'number' },
          { name: 'location', label: 'Location' , type: 'text' },
          { name: 'issue_date', label: 'Issue date', type: 'date', required: true },
          { name: 'effective_date', label: 'Effective date', type: 'date' },
          { name: 'expiry_date', label: 'Expiry date', type: 'date' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
        submitLabel: 'Issue licence',
      },
      rowActions: [
        { label: 'Vary', endpoint: '/regulator/licences/{id}/vary', tone: 'default',
          form: { title: 'Vary licence', endpoint: '', fields: [
            { name: 'details', label: 'Variation details', type: 'textarea', required: true },
          ] },
        },
        { label: 'Suspend', endpoint: '/regulator/licences/{id}/suspend', tone: 'default',
          show: (r) => r.status === 'active' || r.status === 'varied',
          form: { title: 'Suspend licence', endpoint: '', fields: [
            { name: 'details', label: 'Reason', type: 'textarea', required: true },
          ] },
        },
        { label: 'Revoke', endpoint: '/regulator/licences/{id}/revoke', tone: 'danger',
          confirm: 'Revoking a licence is a serious regulatory act. Continue?',
          show: (r) => r.status !== 'revoked' && r.status !== 'expired',
          form: { title: 'Revoke licence', endpoint: '', fields: [
            { name: 'details', label: 'Grounds for revocation', type: 'textarea', required: true },
          ] },
        },
        { label: 'Reinstate', endpoint: '/regulator/licences/{id}/reinstate', tone: 'primary',
          show: (r) => r.status === 'suspended',
          form: { title: 'Reinstate licence', endpoint: '', fields: [
            { name: 'details', label: 'Notes', type: 'textarea' },
          ] },
        },
        { label: '+ Condition', endpoint: '/regulator/licences/{id}/conditions',
          form: { title: 'Attach condition', endpoint: '', fields: [
            { name: 'condition_number', label: 'Number', type: 'text', required: true, placeholder: '4.1' },
            { name: 'condition_text', label: 'Text', type: 'textarea', required: true },
            { name: 'category', label: 'Category', type: 'select', options: [
              { value: 'technical', label: 'Technical' },
              { value: 'financial', label: 'Financial' },
              { value: 'reporting', label: 'Reporting' },
              { value: 'community', label: 'Community' },
              { value: 'env', label: 'Environmental' },
            ] },
          ] },
        },
      ],
      detail: {
        endpoint: '/regulator/licences/{id}',
        children: [
          { dataKey: 'conditions', label: 'Conditions', columns: [
            { key: 'condition_number', label: '#' },
            { key: 'category', label: 'Category' },
            { key: 'condition_text', label: 'Text' },
            {
              key: 'compliance_status', label: 'Compliance',
              render: (r) => <StatusPill status={String(r.compliance_status)} />,
            },
          ] },
          { dataKey: 'events', label: 'Lifecycle events', columns: [
            { key: 'event_type', label: 'Event' },
            { key: 'event_date', label: 'Date', date: true },
            { key: 'details', label: 'Details' },
          ] },
        ],
      },
    },

    // ─── Tariff submissions ───────────────────────────────────────────────
    {
      key: 'tariffs',
      label: 'Tariff applications',
      endpoint: '/regulator/tariff-submissions',
      description:
        'MYPD-style submissions under ERA 2006 s.16. Flow: submitted → public hearing → determination (published in the Gazette tab).',
      columns: [
        { key: 'reference_number', label: 'Reference' },
        { key: 'submission_title', label: 'Title' },
        { key: 'methodology', label: 'Methodology' },
        { key: 'requested_revenue_zar', label: 'Req Rev.', align: 'right', currency: true },
        { key: 'requested_tariff_c_per_kwh', label: 'c/kWh', align: 'right', number: true },
        { key: 'tariff_period_start', label: 'From', date: true },
        { key: 'tariff_period_end', label: 'To', date: true },
        {
          key: 'status', label: 'Status',
          render: (r) => <StatusPill status={String(r.status)} />,
        },
      ],
      create: {
        title: 'New tariff submission',
        endpoint: '/regulator/tariff-submissions',
        fields: [
          { name: 'reference_number', label: 'Reference', type: 'text', required: true },
          { name: 'submission_title', label: 'Title', type: 'text', required: true },
          { name: 'methodology', label: 'Methodology', type: 'select', options: [
            { value: 'MYPD4', label: 'MYPD4' },
            { value: 'MYPD5', label: 'MYPD5' },
            { value: 'bilateral', label: 'Bilateral' },
            { value: 'wheeling', label: 'Wheeling' },
          ] },
          { name: 'tariff_period_start', label: 'Period start', type: 'date', required: true },
          { name: 'tariff_period_end', label: 'Period end', type: 'date', required: true },
          { name: 'requested_revenue_zar', label: 'Requested revenue (ZAR)', type: 'number' },
          { name: 'requested_tariff_c_per_kwh', label: 'Requested tariff (c/kWh)', type: 'number' },
          { name: 'licence_id', label: 'Related licence ID', type: 'text' },
        ],
      },
      rowActions: [
        { label: 'Schedule hearing', endpoint: '/regulator/tariff-submissions/{id}/hearing',
          show: (r) => r.status === 'submitted',
          form: { title: 'Schedule public hearing', endpoint: '', fields: [
            { name: 'public_hearing_date', label: 'Hearing date', type: 'datetime', required: true },
          ] },
        },
        { label: 'Determine', tone: 'primary', endpoint: '/regulator/tariff-submissions/{id}/determine',
          show: (r) => r.status === 'public_hearing' || r.status === 'submitted',
          form: { title: 'Issue determination', endpoint: '', fields: [
            { name: 'decision_number', label: 'Decision number', type: 'text', required: true },
            { name: 'decision_date', label: 'Decision date', type: 'date', required: true },
            { name: 'approved_revenue_zar', label: 'Approved revenue (ZAR)', type: 'number' },
            { name: 'approved_tariff_c_per_kwh', label: 'Approved tariff (c/kWh)', type: 'number' },
            { name: 'effective_from', label: 'Effective from', type: 'date', required: true },
            { name: 'effective_to', label: 'Effective to', type: 'date' },
            { name: 'reasons', label: 'Reasons (PAJA)', type: 'textarea', required: true },
            { name: 'gazette_reference', label: 'Gazette ref', type: 'text' },
          ] },
        },
      ],
    },

    // ─── Determinations (gazette) ─────────────────────────────────────────
    {
      key: 'determinations',
      label: 'Gazette',
      endpoint: '/regulator/determinations',
      description: 'Publicly-accessible determinations, rules, notices (PAIA s.14).',
      columns: [
        { key: 'reference_number', label: 'Ref' },
        { key: 'title', label: 'Title' },
        { key: 'category', label: 'Category' },
        { key: 'statutory_basis', label: 'Statute' },
        { key: 'publication_date', label: 'Published', date: true },
        { key: 'gazette_reference', label: 'Gazette' },
      ],
      create: {
        title: 'Publish determination',
        endpoint: '/regulator/determinations',
        fields: [
          { name: 'reference_number', label: 'Reference', type: 'text', required: true },
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'category', label: 'Category', type: 'select', required: true, options: [
            { value: 'tariff', label: 'Tariff' },
            { value: 'licence', label: 'Licence' },
            { value: 'rule', label: 'Rule' },
            { value: 'notice', label: 'Notice' },
            { value: 'enforcement', label: 'Enforcement' },
            { value: 'code_of_conduct', label: 'Code of conduct' },
            { value: 'methodology', label: 'Methodology' },
          ] },
          { name: 'statutory_basis', label: 'Statutory basis', type: 'text', placeholder: 'ERA 2006 s.4' },
          { name: 'publication_date', label: 'Publication date', type: 'date', required: true },
          { name: 'summary', label: 'Summary', type: 'textarea' },
          { name: 'body_md', label: 'Body (markdown)', type: 'textarea' },
          { name: 'gazette_reference', label: 'Gazette reference', type: 'text' },
        ],
      },
    },

    // ─── Enforcement ──────────────────────────────────────────────────────
    {
      key: 'enforcement',
      label: 'Enforcement',
      endpoint: '/regulator/enforcement-cases',
      description:
        'Investigation → finding → penalty → appeal. Penalty caps per NERSA Rules on Penalties 2018.',
      columns: [
        { key: 'case_number', label: 'Case' },
        { key: 'respondent_name', label: 'Respondent' },
        { key: 'alleged_contravention', label: 'Contravention' },
        { key: 'statutory_provision', label: 'Provision' },
        {
          key: 'severity', label: 'Severity',
          render: (r) => <StatusPill status={String(r.severity)} />,
        },
        { key: 'penalty_amount_zar', label: 'Penalty', align: 'right', currency: true },
        {
          key: 'status', label: 'Status',
          render: (r) => <StatusPill status={String(r.status)} />,
        },
        { key: 'opened_at', label: 'Opened', date: true },
      ],
      create: {
        title: 'Open enforcement case',
        endpoint: '/regulator/enforcement-cases',
        fields: [
          { name: 'case_number', label: 'Case number', type: 'text', required: true },
          { name: 'respondent_name', label: 'Respondent name', type: 'text', required: true },
          { name: 'respondent_participant_id', label: 'Respondent participant ID', type: 'text' },
          { name: 'alleged_contravention', label: 'Alleged contravention', type: 'textarea', required: true },
          { name: 'statutory_provision', label: 'Statutory provision', type: 'text', placeholder: 'ERA 2006 s.24(1)' },
          { name: 'severity', label: 'Severity', type: 'select', options: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'critical', label: 'Critical' },
          ], default: 'medium' },
          { name: 'related_licence_id', label: 'Related licence ID', type: 'text' },
          { name: 'lead_investigator_id', label: 'Lead investigator ID', type: 'text' },
        ],
      },
      rowActions: [
        { label: '+ Event', endpoint: '/regulator/enforcement-cases/{id}/events',
          form: { title: 'Log investigation event', endpoint: '', fields: [
            { name: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'complaint', label: 'Complaint' },
              { value: 'hearing_notice', label: 'Hearing notice' },
              { value: 'evidence_submitted', label: 'Evidence submitted' },
              { value: 'decision', label: 'Decision' },
              { value: 'appeal_filed', label: 'Appeal filed' },
            ] },
            { name: 'event_date', label: 'Event date', type: 'datetime', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'evidence_r2_key', label: 'Evidence R2 key', type: 'text' },
          ] },
        },
        { label: 'Finding', tone: 'primary', endpoint: '/regulator/enforcement-cases/{id}/finding',
          show: (r) => ['open', 'investigating', 'hearing'].includes(String(r.status)),
          form: { title: 'Record finding + penalty', endpoint: '', fields: [
            { name: 'finding', label: 'Finding', type: 'textarea', required: true },
            { name: 'finding_date', label: 'Finding date', type: 'date', required: true },
            { name: 'penalty_amount_zar', label: 'Penalty (ZAR)', type: 'number', help: 'Leave blank for non-monetary findings.' },
            { name: 'penalty_description', label: 'Penalty description', type: 'textarea' },
          ] },
        },
        { label: 'Appeal', endpoint: '/regulator/enforcement-cases/{id}/appeal',
          show: (r) => ['finding', 'penalty_imposed'].includes(String(r.status)),
          form: { title: 'File appeal', endpoint: '', fields: [
            { name: 'appeal_filed_at', label: 'Appeal filed at', type: 'datetime' },
            { name: 'grounds', label: 'Grounds', type: 'textarea', required: true },
          ] },
        },
      ],
      detail: {
        endpoint: '/regulator/enforcement-cases/{id}',
        children: [
          { dataKey: 'events', label: 'Events', columns: [
            { key: 'event_type', label: 'Event' },
            { key: 'event_date', label: 'Date', date: true },
            { key: 'description', label: 'Description' },
          ] },
        ],
      },
    },

    // ─── Surveillance ─────────────────────────────────────────────────────
    {
      key: 'surveillance',
      label: 'Surveillance alerts',
      endpoint: '/regulator/surveillance/alerts',
      params: { status: 'open' },
      description:
        'Wash-trade, layering, spoofing, concentration and price-manipulation alerts. Scanned every 15 minutes by the cron.',
      columns: [
        { key: 'rule_code', label: 'Rule' },
        { key: 'entity_type', label: 'Entity' },
        { key: 'entity_id', label: 'ID' },
        { key: 'participant_id', label: 'Participant' },
        {
          key: 'severity', label: 'Severity',
          render: (r) => <StatusPill status={String(r.severity)} />,
        },
        {
          key: 'status', label: 'Status',
          render: (r) => <StatusPill status={String(r.status)} />,
        },
        { key: 'raised_at', label: 'Raised', date: true },
      ],
      rowActions: [
        { label: 'Investigate', endpoint: '/regulator/surveillance/alerts/{id}/resolve',
          form: { title: 'Mark investigating', endpoint: '', fields: [
            { name: 'status', label: 'Status', type: 'select', required: true, options: [
              { value: 'investigating', label: 'Investigating' },
            ], default: 'investigating' },
            { name: 'resolution_notes', label: 'Notes', type: 'textarea' },
          ] },
        },
        { label: 'Dismiss', endpoint: '/regulator/surveillance/alerts/{id}/resolve',
          form: { title: 'Dismiss as false positive', endpoint: '', fields: [
            { name: 'status', label: 'Status', type: 'select', required: true, options: [
              { value: 'false_positive', label: 'False positive' },
              { value: 'resolved', label: 'Resolved' },
            ] },
            { name: 'resolution_notes', label: 'Notes', type: 'textarea', required: true },
          ] },
        },
        { label: 'Escalate', tone: 'danger', endpoint: '/regulator/surveillance/alerts/{id}/escalate',
          confirm: 'Escalate this alert to a formal enforcement case?',
          form: { title: 'Escalate to enforcement', endpoint: '', fields: [
            { name: 'case_number', label: 'Case number', type: 'text' },
            { name: 'respondent_name', label: 'Respondent name', type: 'text', required: true },
            { name: 'grounds', label: 'Grounds', type: 'textarea', required: true },
          ] },
        },
      ],
    },
  ];

  return (
    <SuitePage
      title="Regulator workbench"
      subtitle="Licensing, tariff determinations, enforcement and market surveillance for the national energy sector."
      tabs={tabs}
      aiBriefRole="regulator"
      aiBriefAccent={{ from: '#107e3e', to: '#0a6ed1' }}
    />
  );
}
