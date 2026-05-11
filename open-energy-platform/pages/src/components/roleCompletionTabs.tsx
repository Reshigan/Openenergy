// ═══════════════════════════════════════════════════════════════════════════
// Role-completion TabSpecs — daily-workflow tabs each role needs to make
// the platform their only tool.
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';
import { StatusPill, TabSpec } from './SuitePage';

// ─── IPP ───────────────────────────────────────────────────────────────

export function ippCompletionTabs(): TabSpec[] {
  return [
    {
      key: 'ipp_epc',
      label: 'EPC contractors',
      endpoint: '/roles/ipp/epc-contractors',
      description: 'Approved + preferred EPC contractor register with BBBEE level, technologies, bonds and insurance capacity.',
      columns: [
        { key: 'contractor_name', label: 'Contractor' },
        { key: 'bbbee_level', label: 'BBBEE', align: 'right', number: true },
        { key: 'technologies', label: 'Techs' },
        { key: 'rating', label: 'Rating', render: (r) => <StatusPill label={String(r.rating || 'approved')} tone={r.rating === 'preferred' ? 'good' : r.rating === 'blacklisted' ? 'critical' : 'info'} /> },
        { key: 'bonds_capacity_zar', label: 'Bonds', align: 'right', currency: true },
        { key: 'primary_contact', label: 'Contact' },
        { key: 'primary_email', label: 'Email' },
      ],
      create: {
        title: 'Add EPC contractor', endpoint: '/roles/ipp/epc-contractors',
        fields: [
          { name: 'contractor_name', label: 'Contractor name', type: 'text', required: true },
          { name: 'registration_no', label: 'Registration #', type: 'text' },
          { name: 'bbbee_level', label: 'BBBEE level (1-8)', type: 'number' },
          { name: 'technologies', label: 'Technologies', type: 'text', placeholder: 'solar,wind,bess' },
          { name: 'rating', label: 'Rating', type: 'select', options: [
            { value: 'approved', label: 'Approved' }, { value: 'preferred', label: 'Preferred' },
            { value: 'probation', label: 'Probation' }, { value: 'blacklisted', label: 'Blacklisted' },
          ] },
          { name: 'primary_contact', label: 'Primary contact', type: 'text' },
          { name: 'primary_email', label: 'Email', type: 'text' },
          { name: 'primary_phone', label: 'Phone', type: 'text' },
          { name: 'bonds_capacity_zar', label: 'Bond capacity (ZAR)', type: 'number' },
          { name: 'insurance_capacity_zar', label: 'Insurance capacity (ZAR)', type: 'number' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    {
      key: 'ipp_land',
      label: 'Land leases',
      endpoint: '/roles/ipp/land-leases',
      description: 'Land lease register — title deed, lease term, rental and escalation, SPLUMA consent-use status.',
      columns: [
        { key: 'property_description', label: 'Property' },
        { key: 'erf_number', label: 'ERF' },
        { key: 'landowner_name', label: 'Landowner' },
        { key: 'hectares', label: 'ha', align: 'right', number: true },
        { key: 'rental_zar_per_yr', label: 'Rental/yr', align: 'right', currency: true },
        { key: 'lease_end_date', label: 'Expires', date: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add land lease', endpoint: '/roles/ipp/land-leases',
        fields: [
          { name: 'property_description', label: 'Property description', type: 'text', required: true },
          { name: 'erf_number', label: 'ERF #', type: 'text' },
          { name: 'title_deed', label: 'Title deed', type: 'text' },
          { name: 'landowner_name', label: 'Landowner', type: 'text' },
          { name: 'hectares', label: 'Hectares', type: 'number' },
          { name: 'zoning', label: 'Zoning', type: 'text' },
          { name: 'lease_start_date', label: 'Lease start', type: 'date' },
          { name: 'lease_end_date', label: 'Lease end', type: 'date' },
          { name: 'rental_zar_per_yr', label: 'Rental ZAR/yr', type: 'number' },
          { name: 'escalation_pct', label: 'Escalation %', type: 'number' },
          { name: 'consent_use_secured', label: 'SPLUMA consent secured', type: 'checkbox' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    {
      key: 'ipp_insurance',
      label: 'Insurance',
      endpoint: '/roles/ipp/insurance',
      description: 'Insurance policy register including CAR, OAR, marine, public liability, BI, D&O, cyber and environmental impairment.',
      columns: [
        { key: 'policy_type', label: 'Type' },
        { key: 'insurer_name', label: 'Insurer' },
        { key: 'policy_number', label: 'Policy #' },
        { key: 'sum_insured_zar', label: 'Sum insured', align: 'right', currency: true },
        { key: 'premium_zar', label: 'Premium', align: 'right', currency: true },
        { key: 'effective_to', label: 'Expires', date: true },
        { key: 'lender_endorsement', label: 'Lender', render: (r) => r.lender_endorsement ? <StatusPill label="Yes" tone="good" /> : <span className="text-[#6b7685] text-[12px]">no</span> },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add insurance policy', endpoint: '/roles/ipp/insurance',
        fields: [
          { name: 'policy_type', label: 'Policy type', type: 'select', required: true, options: [
            { value: 'construction_all_risk', label: 'Construction All Risk' },
            { value: 'operational_all_risk', label: 'Operational All Risk' },
            { value: 'marine_cargo', label: 'Marine Cargo' },
            { value: 'erection_all_risk', label: 'Erection All Risk' },
            { value: 'public_liability', label: 'Public Liability' },
            { value: 'professional_indemnity', label: 'Professional Indemnity' },
            { value: 'business_interruption', label: 'Business Interruption' },
            { value: 'delay_in_start_up', label: 'Delay in Start-up' },
            { value: 'political_risk', label: 'Political Risk' },
            { value: 'cyber', label: 'Cyber' },
            { value: 'directors_officers', label: 'D&O' },
            { value: 'environmental_impairment', label: 'Environmental Impairment' },
            { value: 'warranty', label: 'Warranty' },
          ] },
          { name: 'insurer_name', label: 'Insurer', type: 'text', required: true },
          { name: 'broker_name', label: 'Broker', type: 'text' },
          { name: 'policy_number', label: 'Policy #', type: 'text' },
          { name: 'sum_insured_zar', label: 'Sum insured (ZAR)', type: 'number', required: true },
          { name: 'premium_zar', label: 'Premium (ZAR)', type: 'number' },
          { name: 'deductible_zar', label: 'Deductible (ZAR)', type: 'number' },
          { name: 'effective_from', label: 'Effective from', type: 'date', required: true },
          { name: 'effective_to', label: 'Effective to', type: 'date', required: true },
          { name: 'lender_endorsement', label: 'Lender named on policy', type: 'checkbox' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    {
      key: 'ipp_community',
      label: 'Community',
      endpoint: '/roles/ipp/community',
      description: 'Community engagement register — open days, consultations, COSI/SED/ED funding, grievances.',
      columns: [
        { key: 'engagement_type', label: 'Type' },
        { key: 'engagement_date', label: 'Date', date: true },
        { key: 'location', label: 'Location' },
        { key: 'attendees', label: 'Attendees', align: 'right', number: true },
        { key: 'topic', label: 'Topic' },
        { key: 'grievance_status', label: 'Grievance', render: (r) => r.grievance_status ? <StatusPill status={String(r.grievance_status)} /> : <span className="text-[#6b7685] text-[12px]">—</span> },
      ],
      create: {
        title: 'Log community engagement', endpoint: '/roles/ipp/community',
        fields: [
          { name: 'engagement_type', label: 'Engagement type', type: 'select', required: true, options: [
            { value: 'open_day', label: 'Open day' },
            { value: 'consultation', label: 'Consultation' },
            { value: 'community_trust_meeting', label: 'Community Trust meeting' },
            { value: 'grievance', label: 'Grievance' },
            { value: 'cosi_funding', label: 'COSI funding' },
            { value: 'sed_funding', label: 'SED funding' },
            { value: 'ed_funding', label: 'ED funding' },
            { value: 'jobs_event', label: 'Jobs event' },
            { value: 'training_event', label: 'Training event' },
          ] },
          { name: 'engagement_date', label: 'Date', type: 'date', required: true },
          { name: 'location', label: 'Location', type: 'text' },
          { name: 'attendees', label: 'Attendees', type: 'number' },
          { name: 'topic', label: 'Topic', type: 'text' },
          { name: 'outcome', label: 'Outcome', type: 'textarea' },
          { name: 'grievance_severity', label: 'Grievance severity (if applicable)', type: 'select', options: [
            { value: '', label: 'n/a' }, { value: 'minor', label: 'Minor' },
            { value: 'significant', label: 'Significant' }, { value: 'material', label: 'Material' },
          ] },
          { name: 'grievance_status', label: 'Grievance status (if applicable)', type: 'select', options: [
            { value: '', label: 'n/a' }, { value: 'logged', label: 'Logged' },
            { value: 'investigating', label: 'Investigating' }, { value: 'resolved', label: 'Resolved' },
            { value: 'escalated', label: 'Escalated' },
          ] },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    {
      key: 'ipp_env',
      label: 'Env compliance',
      endpoint: '/roles/ipp/env-compliance',
      description: 'Environmental compliance obligations — EA conditions, AEL, WUL, avifauna/bat monitoring, rehab.',
      columns: [
        { key: 'obligation_type', label: 'Type' },
        { key: 'description', label: 'Description' },
        { key: 'frequency', label: 'Frequency' },
        { key: 'due_date', label: 'Due', date: true },
        { key: 'responsible_party', label: 'Responsible' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add environmental obligation', endpoint: '/roles/ipp/env-compliance',
        fields: [
          { name: 'obligation_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'ea_condition', label: 'EA condition' }, { value: 'ael_condition', label: 'AEL condition' },
            { value: 'wul_condition', label: 'WUL condition' }, { value: 'noise', label: 'Noise' },
            { value: 'avifauna_monitoring', label: 'Avifauna monitoring' },
            { value: 'bats_monitoring', label: 'Bats monitoring' },
            { value: 'flora_monitoring', label: 'Flora monitoring' },
            { value: 'rehab', label: 'Rehab' }, { value: 'water_quality', label: 'Water quality' },
            { value: 'dust', label: 'Dust' },
            { value: 'community_trust_distribution', label: 'Community Trust distribution' },
          ] },
          { name: 'source_doc', label: 'Source doc / ROD ref', type: 'text' },
          { name: 'description', label: 'Description', type: 'textarea', required: true },
          { name: 'due_date', label: 'Due date', type: 'date' },
          { name: 'frequency', label: 'Frequency', type: 'select', options: [
            { value: 'annual', label: 'Annual' }, { value: 'quarterly', label: 'Quarterly' },
            { value: 'monthly', label: 'Monthly' }, { value: 'event', label: 'Event-driven' },
          ] },
          { name: 'responsible_party', label: 'Responsible party', type: 'text' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
  ];
}

// ─── Offtaker ──────────────────────────────────────────────────────────

export function offtakerCompletionTabs(): TabSpec[] {
  return [
    {
      key: 'off_ppa_market',
      label: 'PPA market',
      endpoint: '/roles/offtaker/ppa-market',
      description: 'Marketplace of PPA buy/sell listings — find sellers (or buyers), place offers, sign contracts.',
      columns: [
        { key: 'listing_type', label: 'Side' },
        { key: 'technology', label: 'Tech' },
        { key: 'capacity_mw', label: 'MW', align: 'right', number: true },
        { key: 'expected_p50_gwh_yr', label: 'P50 GWh/yr', align: 'right', number: true },
        { key: 'ppa_term_years', label: 'Term', align: 'right', number: true },
        { key: 'price_zar_per_mwh', label: 'Price', align: 'right', currency: true },
        { key: 'green_attributes', label: 'Green' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'List PPA', endpoint: '/roles/offtaker/ppa-market',
        fields: [
          { name: 'listing_type', label: 'Side', type: 'select', required: true, options: [
            { value: 'sell', label: 'Sell (offer power)' },
            { value: 'buy', label: 'Buy (seek power)' },
          ] },
          { name: 'technology', label: 'Technology', type: 'select', required: true, options: [
            { value: 'solar', label: 'Solar' }, { value: 'wind', label: 'Wind' },
            { value: 'hybrid', label: 'Hybrid (Solar+BESS)' }, { value: 'bess', label: 'BESS' },
            { value: 'gas', label: 'Gas' },
          ] },
          { name: 'capacity_mw', label: 'Capacity (MW)', type: 'number', required: true },
          { name: 'expected_p50_gwh_yr', label: 'Expected P50 GWh/yr', type: 'number' },
          { name: 'ppa_term_years', label: 'PPA term (years)', type: 'number', required: true },
          { name: 'price_zar_per_mwh', label: 'Price (ZAR/MWh)', type: 'number' },
          { name: 'delivery_point', label: 'Delivery point', type: 'text' },
          { name: 'delivery_grid_zone', label: 'Grid zone', type: 'text' },
          { name: 'start_date', label: 'Start date', type: 'date' },
          { name: 'green_attributes', label: 'Green attributes', type: 'select', options: [
            { value: 'rec_bundled', label: 'RECs bundled' },
            { value: 'rec_stripped', label: 'RECs stripped' },
            { value: '24_7_cfe', label: '24/7 CFE matched' },
          ] },
          { name: 'description', label: 'Description', type: 'textarea' },
        ],
      },
    },
    {
      key: 'off_dr_programs',
      label: 'Demand response',
      endpoint: '/roles/offtaker/demand-response/programs',
      description: 'Enrolled demand response programs — IOL, dispatchable load, VPP, peak clipping, TOU arbitrage.',
      columns: [
        { key: 'program_name', label: 'Program' },
        { key: 'program_type', label: 'Type' },
        { key: 'baseline_load_mw', label: 'Baseline MW', align: 'right', number: true },
        { key: 'reducible_load_mw', label: 'Reducible MW', align: 'right', number: true },
        { key: 'compensation_zar_per_mwh', label: 'Comp ZAR/MWh', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Enrol in DR program', endpoint: '/roles/offtaker/demand-response/programs',
        fields: [
          { name: 'program_name', label: 'Program name', type: 'text', required: true },
          { name: 'program_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'iol', label: 'Interruptible Load' },
            { value: 'dispatchable_load', label: 'Dispatchable Load' },
            { value: 'vpp', label: 'Virtual Power Plant' },
            { value: 'peak_clipping', label: 'Peak Clipping' },
            { value: 'tou_arbitrage', label: 'TOU Arbitrage' },
          ] },
          { name: 'baseline_load_mw', label: 'Baseline load (MW)', type: 'number', required: true },
          { name: 'reducible_load_mw', label: 'Reducible load (MW)', type: 'number', required: true },
          { name: 'notice_period_minutes', label: 'Notice period (min)', type: 'number' },
          { name: 'recovery_period_minutes', label: 'Recovery period (min)', type: 'number' },
          { name: 'compensation_zar_per_mwh', label: 'Compensation ZAR/MWh', type: 'number' },
          { name: 'max_events_per_month', label: 'Max events/month', type: 'number' },
        ],
      },
    },
    {
      key: 'off_bill_val',
      label: 'Bill validation',
      endpoint: '/roles/offtaker/bill-validations',
      description: 'Auto-validate utility bills (Eskom, City Power, etc.) against metered consumption and computed tariff.',
      columns: [
        { key: 'supplier', label: 'Supplier' },
        { key: 'account_number', label: 'Account #' },
        { key: 'reading_month', label: 'Month' },
        { key: 'billed_kwh', label: 'Billed kWh', align: 'right', number: true },
        { key: 'metered_kwh', label: 'Metered kWh', align: 'right', number: true },
        { key: 'variance_kwh', label: 'Δ kWh', align: 'right', number: true },
        { key: 'variance_zar', label: 'Δ ZAR', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add bill for validation', endpoint: '/roles/offtaker/bill-validations',
        fields: [
          { name: 'supplier', label: 'Supplier', type: 'select', required: true, options: [
            { value: 'Eskom', label: 'Eskom' }, { value: 'City of CT', label: 'City of Cape Town' },
            { value: 'City of JHB', label: 'City of Johannesburg' },
            { value: 'City Power', label: 'City Power' }, { value: 'eThekwini', label: 'eThekwini' },
          ] },
          { name: 'account_number', label: 'Account #', type: 'text' },
          { name: 'reading_month', label: 'Reading month (YYYY-MM)', type: 'text', required: true },
          { name: 'billed_kwh', label: 'Billed kWh', type: 'number' },
          { name: 'billed_amount_zar', label: 'Billed (ZAR)', type: 'number' },
          { name: 'metered_kwh', label: 'Metered kWh', type: 'number' },
          { name: 'expected_amount_zar', label: 'Expected (ZAR) — computed', type: 'number' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
  ];
}

// ─── Lender ────────────────────────────────────────────────────────────

export function lenderCompletionTabs(): TabSpec[] {
  return [
    {
      key: 'lend_origination',
      label: 'Loan origination',
      endpoint: '/roles/lender/loans',
      description: 'Loan origination pipeline — term sheet, credit committee, documentation, financial close.',
      columns: [
        { key: 'borrower_name', label: 'Borrower' },
        { key: 'facility_type', label: 'Type' },
        { key: 'proposed_amount_zar', label: 'Amount', align: 'right', currency: true },
        { key: 'proposed_tenor_years', label: 'Tenor', align: 'right', number: true },
        { key: 'proposed_margin_bps', label: 'Margin bps', align: 'right', number: true },
        { key: 'stage', label: 'Stage', render: (r) => <StatusPill status={String(r.stage)} /> },
        { key: 'expected_close_date', label: 'Close', date: true },
      ],
      create: {
        title: 'New origination', endpoint: '/roles/lender/loans',
        fields: [
          { name: 'borrower_name', label: 'Borrower', type: 'text', required: true },
          { name: 'project_id', label: 'Project ID (if PF)', type: 'text' },
          { name: 'facility_type', label: 'Facility', type: 'select', required: true, options: [
            { value: 'term_loan', label: 'Term loan' }, { value: 'revolving', label: 'Revolving' },
            { value: 'syndicated', label: 'Syndicated' }, { value: 'bridge', label: 'Bridge' },
            { value: 'mezzanine', label: 'Mezzanine' }, { value: 'green_bond', label: 'Green bond' },
            { value: 'sustainability_linked', label: 'Sustainability-linked loan' },
            { value: 'vendor_finance', label: 'Vendor finance' },
          ] },
          { name: 'proposed_amount_zar', label: 'Amount (ZAR)', type: 'number', required: true },
          { name: 'proposed_tenor_years', label: 'Tenor (years)', type: 'number' },
          { name: 'proposed_margin_bps', label: 'Margin (bps over reference)', type: 'number' },
          { name: 'reference_rate', label: 'Reference rate', type: 'select', options: [
            { value: 'JIBAR', label: 'JIBAR 3m' }, { value: 'PRIME', label: 'Prime' },
            { value: 'SOFR', label: 'SOFR' },
          ] },
          { name: 'expected_close_date', label: 'Expected close', type: 'date' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
      rowActions: [
        { label: 'Advance stage', tone: 'primary', endpoint: '/roles/lender/loans/{id}', method: 'PATCH',
          form: { title: 'Advance loan stage', endpoint: '', fields: [
            { name: 'stage', label: 'Stage', type: 'select', required: true, options: [
              { value: 'origination', label: 'Origination' },
              { value: 'term_sheet', label: 'Term sheet' },
              { value: 'credit_committee', label: 'Credit committee' },
              { value: 'documentation', label: 'Documentation' },
              { value: 'signing', label: 'Signing' },
              { value: 'financial_close', label: 'Financial close' },
              { value: 'disbursed', label: 'Disbursed' },
              { value: 'declined', label: 'Declined' },
              { value: 'withdrawn', label: 'Withdrawn' },
            ] },
            { name: 'credit_committee_outcome', label: 'CC outcome (if at CC stage)', type: 'select', options: [
              { value: '', label: '—' },
              { value: 'approved', label: 'Approved' },
              { value: 'approved_with_conditions', label: 'Approved with conditions' },
              { value: 'deferred', label: 'Deferred' },
              { value: 'declined', label: 'Declined' },
            ] },
            { name: 'conditions_precedent', label: 'Conditions precedent', type: 'textarea' },
            { name: 'actual_close_date', label: 'Actual close date', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'textarea' },
          ] },
        },
      ],
    },
    {
      key: 'lend_syndication',
      label: 'Syndication',
      endpoint: '/roles/lender/syndication',
      description: 'Syndication participants per loan with commitment, role, and status.',
      columns: [
        { key: 'borrower_name', label: 'Borrower' },
        { key: 'participant_name', label: 'Co-lender' },
        { key: 'role', label: 'Role' },
        { key: 'commitment_zar', label: 'Commitment', align: 'right', currency: true },
        { key: 'participation_pct', label: '%', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add syndication participant', endpoint: '/roles/lender/syndication',
        fields: [
          { name: 'loan_id', label: 'Loan ID', type: 'text', required: true, help: 'Copy from a row id in the Loan origination tab.' },
          { name: 'participant_name', label: 'Co-lender', type: 'text', required: true },
          { name: 'commitment_zar', label: 'Commitment (ZAR)', type: 'number', required: true },
          { name: 'participation_pct', label: 'Participation %', type: 'number' },
          { name: 'role', label: 'Role', type: 'select', options: [
            { value: 'mlp', label: 'MLP' }, { value: 'arranger', label: 'Arranger' },
            { value: 'underwriter', label: 'Underwriter' }, { value: 'participant', label: 'Participant' },
            { value: 'agent', label: 'Agent' }, { value: 'security_trustee', label: 'Security trustee' },
          ] },
        ],
      },
    },
    {
      key: 'lend_sll',
      label: 'SLL KPIs',
      endpoint: '/roles/lender/sll-kpis',
      description: 'Sustainability-linked loan KPI tracker — margin step-ups/downs tied to SBTi targets, renewables %, safety, BBBEE level.',
      columns: [
        { key: 'kpi_name', label: 'KPI' },
        { key: 'kpi_type', label: 'Type' },
        { key: 'baseline_value', label: 'Baseline', align: 'right', number: true },
        { key: 'target_value', label: 'Target', align: 'right', number: true },
        { key: 'current_value', label: 'Current', align: 'right', number: true },
        { key: 'margin_step_up_bps', label: 'Step-up bps', align: 'right', number: true },
        { key: 'margin_step_down_bps', label: 'Step-down bps', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add SLL KPI', endpoint: '/roles/lender/sll-kpis',
        fields: [
          { name: 'loan_id', label: 'Loan ID (optional)', type: 'text' },
          { name: 'kpi_name', label: 'KPI name', type: 'text', required: true },
          { name: 'kpi_type', label: 'KPI type', type: 'select', required: true, options: [
            { value: 'emissions_intensity', label: 'Emissions intensity' },
            { value: 'renewable_pct', label: 'Renewable %' },
            { value: 'sbti_target', label: 'SBTi target' },
            { value: 'water_intensity', label: 'Water intensity' },
            { value: 'safety_ltifr', label: 'Safety (LTIFR)' },
            { value: 'bbbee_level', label: 'BBBEE level' },
            { value: 'jobs_created', label: 'Jobs created' },
            { value: 'custom', label: 'Custom' },
          ] },
          { name: 'baseline_value', label: 'Baseline', type: 'number' },
          { name: 'target_value', label: 'Target', type: 'number', required: true },
          { name: 'observation_period', label: 'Observation period', type: 'select', options: [
            { value: 'annual', label: 'Annual' }, { value: 'semi_annual', label: 'Semi-annual' },
          ] },
          { name: 'margin_step_up_bps', label: 'Step-up (bps, penalty if missed)', type: 'number' },
          { name: 'margin_step_down_bps', label: 'Step-down (bps, reward if met)', type: 'number' },
          { name: 'current_value', label: 'Current value', type: 'number' },
          { name: 'reporting_year', label: 'Reporting year', type: 'number' },
          { name: 'assured_by', label: 'Assured by', type: 'text' },
        ],
      },
    },
    {
      key: 'lend_workouts',
      label: 'Workouts',
      endpoint: '/roles/lender/workouts',
      description: 'Distressed-loan workout register — standstill, reschedule, restructure, enforcement, write-down.',
      columns: [
        { key: 'workout_type', label: 'Type' },
        { key: 'trigger_event', label: 'Trigger' },
        { key: 'exposure_at_default_zar', label: 'EAD', align: 'right', currency: true },
        { key: 'expected_recovery_zar', label: 'Expected recovery', align: 'right', currency: true },
        { key: 'loss_given_default_pct', label: 'LGD %', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Open workout', endpoint: '/roles/lender/workouts',
        fields: [
          { name: 'loan_id', label: 'Loan ID', type: 'text', required: true },
          { name: 'workout_type', label: 'Type', type: 'select', required: true, options: [
            { value: 'standstill', label: 'Standstill' }, { value: 'reschedule', label: 'Reschedule' },
            { value: 'restructure', label: 'Restructure' }, { value: 'enforcement', label: 'Enforcement' },
            { value: 'write_down', label: 'Write-down' }, { value: 'dpo', label: 'DPO (Discounted payoff)' },
          ] },
          { name: 'trigger_event', label: 'Trigger event', type: 'text' },
          { name: 'exposure_at_default_zar', label: 'Exposure at default (ZAR)', type: 'number' },
          { name: 'expected_recovery_zar', label: 'Expected recovery (ZAR)', type: 'number' },
          { name: 'loss_given_default_pct', label: 'LGD %', type: 'number' },
          { name: 'legal_counsel', label: 'Legal counsel', type: 'text' },
        ],
      },
    },
  ];
}

// ─── Carbon Fund ───────────────────────────────────────────────────────

export function carbonCompletionTabs(): TabSpec[] {
  return [
    {
      key: 'carb_buffer',
      label: 'Buffer pool',
      endpoint: '/roles/carbon/buffer-pool',
      description: 'VCS-style buffer pool reserves — held against reversal/permanence risk.',
      columns: [
        { key: 'project_id', label: 'Project' },
        { key: 'total_contributed_tco2e', label: 'Contributed t', align: 'right', number: true },
        { key: 'reserved_tco2e', label: 'Reserved t', align: 'right', number: true },
        { key: 'buffer_pct', label: 'Buffer %', align: 'right', number: true },
        { key: 'reason', label: 'Reason' },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add buffer contribution', endpoint: '/roles/carbon/buffer-pool',
        fields: [
          { name: 'project_id', label: 'CDR project ID', type: 'text', required: true },
          { name: 'total_contributed_tco2e', label: 'Total contributed (tCO₂e)', type: 'number', required: true },
          { name: 'reserved_tco2e', label: 'Reserved (tCO₂e)', type: 'number' },
          { name: 'buffer_pct', label: 'Buffer %', type: 'number', required: true },
          { name: 'reason', label: 'Reason', type: 'select', options: [
            { value: 'reversal_risk', label: 'Reversal risk' },
            { value: 'permanence_risk', label: 'Permanence risk' },
            { value: 'baseline_uncertainty', label: 'Baseline uncertainty' },
          ] },
        ],
      },
    },
    {
      key: 'carb_dd',
      label: 'Due diligence',
      endpoint: '/roles/carbon/due-diligence',
      description: 'CDR project due diligence steps — technical, methodology, additionality, leakage, permanence, financial, legal.',
      columns: [
        { key: 'project_id', label: 'Project' },
        { key: 'dd_step', label: 'Step' },
        { key: 'reviewer', label: 'Reviewer' },
        { key: 'outcome', label: 'Outcome', render: (r) => <StatusPill label={String(r.outcome || 'pending')} tone={r.outcome === 'pass' ? 'good' : r.outcome === 'fail' ? 'critical' : 'info'} /> },
        { key: 'rating_score', label: 'Score', align: 'right', number: true },
        { key: 'completed_at', label: 'Completed', date: true },
      ],
      create: {
        title: 'Record DD step', endpoint: '/roles/carbon/due-diligence',
        fields: [
          { name: 'project_id', label: 'CDR project ID', type: 'text', required: true },
          { name: 'dd_step', label: 'DD step', type: 'select', required: true, options: [
            { value: 'technical_review', label: 'Technical review' },
            { value: 'methodology_review', label: 'Methodology review' },
            { value: 'additionality_test', label: 'Additionality test' },
            { value: 'leakage_assessment', label: 'Leakage assessment' },
            { value: 'permanence_assessment', label: 'Permanence assessment' },
            { value: 'baseline_validation', label: 'Baseline validation' },
            { value: 'site_visit', label: 'Site visit' },
            { value: 'financial_review', label: 'Financial review' },
            { value: 'legal_review', label: 'Legal review' },
            { value: 'co_benefits', label: 'Co-benefits' },
            { value: 'mrv_review', label: 'MRV review' },
            { value: 'registry_check', label: 'Registry check' },
          ] },
          { name: 'reviewer', label: 'Reviewer', type: 'text' },
          { name: 'outcome', label: 'Outcome', type: 'select', options: [
            { value: 'pass', label: 'Pass' }, { value: 'conditional', label: 'Conditional' },
            { value: 'fail', label: 'Fail' }, { value: 'withdrawn', label: 'Withdrawn' },
          ] },
          { name: 'rating_score', label: 'Rating (1-10)', type: 'number' },
          { name: 'completed_at', label: 'Completed at', type: 'date' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    {
      key: 'carb_perm',
      label: 'Permanence',
      endpoint: '/roles/carbon/permanence',
      description: 'Long-term storage monitoring for engineered + nature removals.',
      columns: [
        { key: 'project_id', label: 'Project' },
        { key: 'observation_date', label: 'Observed', date: true },
        { key: 'reporting_year', label: 'Year' },
        { key: 'stored_tco2e', label: 'Stored t', align: 'right', number: true },
        { key: 'reversal_tco2e', label: 'Reversal t', align: 'right', number: true },
        { key: 'reversal_cause', label: 'Cause' },
        { key: 'monitoring_method', label: 'Method' },
      ],
      create: {
        title: 'Log permanence observation', endpoint: '/roles/carbon/permanence',
        fields: [
          { name: 'project_id', label: 'CDR project ID', type: 'text', required: true },
          { name: 'observation_date', label: 'Observation date', type: 'date', required: true },
          { name: 'reporting_year', label: 'Reporting year', type: 'number', required: true },
          { name: 'stored_tco2e', label: 'Stored (tCO₂e)', type: 'number', required: true },
          { name: 'reversal_tco2e', label: 'Reversal (tCO₂e)', type: 'number' },
          { name: 'reversal_cause', label: 'Cause (if reversal)', type: 'select', options: [
            { value: 'fire', label: 'Fire' }, { value: 'disease', label: 'Disease' },
            { value: 'natural', label: 'Natural' }, { value: 'intentional', label: 'Intentional' },
            { value: 'measurement_revision', label: 'Measurement revision' },
          ] },
          { name: 'monitoring_method', label: 'Method', type: 'select', options: [
            { value: 'satellite', label: 'Satellite' }, { value: 'field_survey', label: 'Field survey' },
            { value: 'sensors', label: 'Sensors' }, { value: 'self_reported', label: 'Self-reported' },
          ] },
        ],
      },
    },
    {
      key: 'carb_attribution',
      label: 'Client attribution',
      endpoint: '/roles/carbon/client-attribution',
      description: 'Share-link offset attestations issued to clients — clients see their attributed retirement publicly.',
      columns: [
        { key: 'client_name', label: 'Client' },
        { key: 'retirement_id', label: 'Retirement' },
        { key: 'attributed_tco2e', label: 'Attributed t', align: 'right', number: true },
        { key: 'reporting_year', label: 'Year' },
        { key: 'proof_of_offset_url', label: 'Public proof' },
      ],
      create: {
        title: 'Issue attribution', endpoint: '/roles/carbon/client-attribution',
        fields: [
          { name: 'client_name', label: 'Client name', type: 'text', required: true },
          { name: 'retirement_id', label: 'Retirement ID', type: 'text', required: true },
          { name: 'attributed_tco2e', label: 'Attributed tCO₂e', type: 'number', required: true },
          { name: 'reporting_year', label: 'Reporting year', type: 'number', required: true },
        ],
      },
    },
  ];
}

// ─── Grid Operator ─────────────────────────────────────────────────────

export function gridCompletionTabs(): TabSpec[] {
  return [
    {
      key: 'grid_queue',
      label: 'Connection queue',
      endpoint: '/roles/grid/connection-queue',
      description: 'NTCSA-style connection queue with capacity, voltage, queue position, budget quote, CUA.',
      columns: [
        { key: 'queue_position', label: '#', align: 'right', number: true },
        { key: 'applicant_name', label: 'Applicant' },
        { key: 'project_name', label: 'Project' },
        { key: 'capacity_mw', label: 'MW', align: 'right', number: true },
        { key: 'technology', label: 'Tech' },
        { key: 'request_voltage_kv', label: 'V kV', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'expected_energised', label: 'Energise', date: true },
      ],
      create: {
        title: 'Add connection request', endpoint: '/roles/grid/connection-queue',
        fields: [
          { name: 'applicant_name', label: 'Applicant', type: 'text', required: true },
          { name: 'application_no', label: 'Application #', type: 'text' },
          { name: 'project_name', label: 'Project name', type: 'text' },
          { name: 'capacity_mw', label: 'Capacity (MW)', type: 'number', required: true },
          { name: 'technology', label: 'Technology', type: 'text' },
          { name: 'request_voltage_kv', label: 'Voltage (kV)', type: 'number' },
          { name: 'connection_point', label: 'Connection point', type: 'text' },
          { name: 'grid_zone', label: 'Grid zone', type: 'text' },
          { name: 'request_date', label: 'Request date', type: 'date', required: true },
          { name: 'budget_quote_zar', label: 'Budget quote (ZAR)', type: 'number' },
          { name: 'expected_energised', label: 'Expected energise', type: 'date' },
        ],
      },
    },
    {
      key: 'grid_fcr',
      label: 'FCR/FRR/RR',
      endpoint: '/roles/grid/frequency-response/markets',
      description: 'Frequency response markets — FCR, FRR-a, FRR-m, RR, synthetic inertia, black-start.',
      columns: [
        { key: 'market_type', label: 'Market' },
        { key: 'product_window_start', label: 'Start', date: true },
        { key: 'product_window_end', label: 'End', date: true },
        { key: 'required_mw', label: 'Req MW', align: 'right', number: true },
        { key: 'procured_mw', label: 'Procured MW', align: 'right', number: true },
        { key: 'clearing_price_zar_per_mw_per_h', label: 'Price ZAR/MW/h', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Open FCR/FRR market', endpoint: '/roles/grid/frequency-response/markets',
        fields: [
          { name: 'market_type', label: 'Market type', type: 'select', required: true, options: [
            { value: 'FCR', label: 'FCR (primary)' },
            { value: 'FRR_a', label: 'FRR automatic (secondary)' },
            { value: 'FRR_m', label: 'FRR manual (tertiary)' },
            { value: 'RR', label: 'Replacement Reserve' },
            { value: 'synthetic_inertia', label: 'Synthetic inertia' },
            { value: 'black_start', label: 'Black start' },
          ] },
          { name: 'product_window_start', label: 'Window start', type: 'datetime-local', required: true },
          { name: 'product_window_end', label: 'Window end', type: 'datetime-local', required: true },
          { name: 'required_mw', label: 'Required MW', type: 'number', required: true },
        ],
      },
    },
    {
      key: 'grid_voltage',
      label: 'Voltage zones',
      endpoint: '/roles/grid/voltage-zones',
      description: 'Voltage management zones with target pu, bands, reactive capability, status.',
      columns: [
        { key: 'zone_name', label: 'Zone' },
        { key: 'voltage_level_kv', label: 'V kV', align: 'right', number: true },
        { key: 'target_voltage_pu', label: 'Target pu', align: 'right', number: true },
        { key: 'current_voltage_pu', label: 'Current pu', align: 'right', number: true },
        { key: 'reactive_capability_mvar', label: 'Q MVar', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add voltage zone', endpoint: '/roles/grid/voltage-zones',
        fields: [
          { name: 'zone_name', label: 'Zone name', type: 'text', required: true },
          { name: 'voltage_level_kv', label: 'Voltage level (kV)', type: 'number', required: true },
          { name: 'target_voltage_pu', label: 'Target voltage (pu)', type: 'number', default: 1.0 },
          { name: 'band_low_pu', label: 'Low band (pu)', type: 'number', default: 0.95 },
          { name: 'band_high_pu', label: 'High band (pu)', type: 'number', default: 1.05 },
          { name: 'reactive_capability_mvar', label: 'Reactive capability (MVar)', type: 'number' },
        ],
      },
    },
    {
      key: 'grid_ndp',
      label: 'Network dev plan',
      endpoint: '/roles/grid/network-development',
      description: 'Network development plan items — new substations, line upgrades, corridors, reactive, battery.',
      columns: [
        { key: 'item_name', label: 'Item' },
        { key: 'item_type', label: 'Type' },
        { key: 'voltage_kv', label: 'V kV', align: 'right', number: true },
        { key: 'estimated_capex_zar', label: 'Capex', align: 'right', currency: true },
        { key: 'expected_inservice', label: 'In-service', date: true },
        { key: 'driver', label: 'Driver' },
        { key: 'priority', label: 'Priority', render: (r) => <StatusPill label={String(r.priority)} tone={r.priority === 'critical' ? 'critical' : r.priority === 'high' ? 'warn' : 'info'} /> },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Add NDP item', endpoint: '/roles/grid/network-development',
        fields: [
          { name: 'item_name', label: 'Item name', type: 'text', required: true },
          { name: 'item_type', label: 'Type', type: 'select', options: [
            { value: 'new_substation', label: 'New substation' },
            { value: 'line_upgrade', label: 'Line upgrade' },
            { value: 'new_corridor', label: 'New corridor' },
            { value: 'reactive_compensation', label: 'Reactive compensation' },
            { value: 'battery_storage', label: 'Battery storage' },
            { value: 'automation', label: 'Automation' },
          ] },
          { name: 'voltage_kv', label: 'Voltage (kV)', type: 'number' },
          { name: 'estimated_capex_zar', label: 'Estimated capex (ZAR)', type: 'number' },
          { name: 'expected_inservice', label: 'Expected in-service', type: 'date' },
          { name: 'driver', label: 'Driver', type: 'select', options: [
            { value: 'growth', label: 'Demand growth' }, { value: 'reliability', label: 'Reliability' },
            { value: 'curtailment', label: 'Curtailment relief' },
            { value: 'renewables', label: 'Renewables integration' },
            { value: 'reactive', label: 'Reactive support' },
          ] },
          { name: 'priority', label: 'Priority', type: 'select', options: [
            { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' }, { value: 'critical', label: 'Critical' },
          ] },
        ],
      },
    },
  ];
}

// ─── Regulator ─────────────────────────────────────────────────────────

export function regulatorCompletionTabs(): TabSpec[] {
  return [
    {
      key: 'reg_consult',
      label: 'Public consultations',
      endpoint: '/roles/regulator/consultations',
      description: 'Consultation register — open consultations, written comments collection, hearings tally.',
      columns: [
        { key: 'consultation_ref', label: 'Ref' },
        { key: 'title', label: 'Title' },
        { key: 'scope', label: 'Scope' },
        { key: 'opened_at', label: 'Opened', date: true },
        { key: 'closed_at', label: 'Closed', date: true },
        { key: 'written_comments_count', label: 'Comments', align: 'right', number: true },
        { key: 'hearings_held', label: 'Hearings', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Open consultation', endpoint: '/roles/regulator/consultations',
        fields: [
          { name: 'consultation_ref', label: 'Consultation ref', type: 'text', required: true, placeholder: 'NERSA/2026/01' },
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'scope', label: 'Scope', type: 'select', options: [
            { value: 'tariff', label: 'Tariff' }, { value: 'licence', label: 'Licence' },
            { value: 'code', label: 'Grid code' }, { value: 'rule', label: 'Rule' },
            { value: 'policy', label: 'Policy' },
          ] },
          { name: 'opened_at', label: 'Opened at', type: 'date', required: true },
          { name: 'closed_at', label: 'Closes at', type: 'date' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    {
      key: 'reg_hearings',
      label: 'Hearings',
      endpoint: '/roles/regulator/hearings',
      description: 'Public hearings calendar with venue, panel, transcript and attendance.',
      columns: [
        { key: 'hearing_date', label: 'Date', date: true },
        { key: 'venue', label: 'Venue' },
        { key: 'panel_chair', label: 'Chair' },
        { key: 'attendee_count', label: 'Attendees', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Schedule hearing', endpoint: '/roles/regulator/hearings',
        fields: [
          { name: 'consultation_id', label: 'Consultation ID (optional)', type: 'text' },
          { name: 'hearing_date', label: 'Date', type: 'datetime-local', required: true },
          { name: 'venue', label: 'Venue', type: 'text' },
          { name: 'panel_chair', label: 'Panel chair', type: 'text' },
        ],
      },
    },
    {
      key: 'reg_determinations',
      label: 'Determinations',
      endpoint: '/roles/regulator/determinations',
      description: 'Determinations register — published decisions, appeals, supersessions.',
      columns: [
        { key: 'determination_ref', label: 'Ref' },
        { key: 'title', label: 'Title' },
        { key: 'category', label: 'Category' },
        { key: 'decision_date', label: 'Decided', date: true },
        { key: 'effective_from', label: 'Effective', date: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Publish determination', endpoint: '/roles/regulator/determinations',
        fields: [
          { name: 'determination_ref', label: 'Ref', type: 'text', required: true },
          { name: 'title', label: 'Title', type: 'text', required: true },
          { name: 'category', label: 'Category', type: 'select', options: [
            { value: 'tariff', label: 'Tariff' }, { value: 'licence', label: 'Licence' },
            { value: 'enforcement', label: 'Enforcement' }, { value: 'code_amendment', label: 'Code amendment' },
          ] },
          { name: 'consultation_id', label: 'From consultation (optional)', type: 'text' },
          { name: 'decision_date', label: 'Decision date', type: 'date' },
          { name: 'effective_from', label: 'Effective from', type: 'date' },
          { name: 'expires_at', label: 'Expires', type: 'date' },
          { name: 'affected_parties', label: 'Affected parties', type: 'text' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
    },
    {
      key: 'reg_fees',
      label: 'License fees',
      endpoint: '/roles/regulator/license-fees',
      description: 'License fees register — invoiced, paid, overdue per licensee per year.',
      columns: [
        { key: 'licensee_name', label: 'Licensee' },
        { key: 'license_category', label: 'Category' },
        { key: 'capacity_mw', label: 'MW', align: 'right', number: true },
        { key: 'fee_year', label: 'Year' },
        { key: 'fee_zar', label: 'Fee', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
        { key: 'paid_at', label: 'Paid', date: true },
      ],
      create: {
        title: 'Invoice license fee', endpoint: '/roles/regulator/license-fees',
        fields: [
          { name: 'licensee_name', label: 'Licensee', type: 'text', required: true },
          { name: 'license_category', label: 'Category', type: 'select', required: true, options: [
            { value: 'generation', label: 'Generation' },
            { value: 'distribution', label: 'Distribution' },
            { value: 'trading', label: 'Trading' },
            { value: 'transmission', label: 'Transmission' },
            { value: 'reseller', label: 'Reseller' },
          ] },
          { name: 'capacity_mw', label: 'Capacity (MW)', type: 'number' },
          { name: 'fee_year', label: 'Year', type: 'number', required: true },
          { name: 'fee_zar', label: 'Fee (ZAR)', type: 'number', required: true },
          { name: 'invoice_ref', label: 'Invoice ref', type: 'text' },
        ],
      },
    },
  ];
}

// ─── Trader ────────────────────────────────────────────────────────────

export function traderCompletionTabs(): TabSpec[] {
  return [
    {
      key: 'tr_day_ahead',
      label: 'Day-ahead blocks',
      endpoint: '/roles/trader/day-ahead',
      description: 'Day-ahead block bids — base, peak, off-peak, super-peak, solar-hours, wind-hours.',
      columns: [
        { key: 'delivery_date', label: 'Delivery', date: true },
        { key: 'block_type', label: 'Block' },
        { key: 'side', label: 'Side' },
        { key: 'volume_mwh', label: 'MWh', align: 'right', number: true },
        { key: 'price_zar_per_mwh', label: 'Price', align: 'right', currency: true },
        { key: 'cleared_volume_mwh', label: 'Cleared MWh', align: 'right', number: true },
        { key: 'cleared_price_zar', label: 'Cleared px', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Submit day-ahead block', endpoint: '/roles/trader/day-ahead',
        fields: [
          { name: 'delivery_date', label: 'Delivery date', type: 'date', required: true },
          { name: 'block_type', label: 'Block type', type: 'select', required: true, options: [
            { value: 'base', label: 'Base (24h)' },
            { value: 'peak', label: 'Peak' }, { value: 'off_peak', label: 'Off-peak' },
            { value: 'super_peak', label: 'Super-peak' },
            { value: 'solar_hours', label: 'Solar hours' },
            { value: 'wind_hours', label: 'Wind hours' },
          ] },
          { name: 'side', label: 'Side', type: 'select', required: true, options: [
            { value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' },
          ] },
          { name: 'volume_mwh', label: 'Volume (MWh)', type: 'number', required: true },
          { name: 'price_zar_per_mwh', label: 'Price (ZAR/MWh)', type: 'number', required: true },
          { name: 'energy_type', label: 'Energy type', type: 'select', options: [
            { value: 'electricity', label: 'Electricity' },
            { value: 'green_electricity', label: 'Green electricity (REC-bundled)' },
          ] },
        ],
      },
    },
    {
      key: 'tr_intraday',
      label: 'Intraday',
      endpoint: '/roles/trader/intraday',
      description: 'Intraday hourly orders — close-to-delivery balancing.',
      columns: [
        { key: 'delivery_hour', label: 'Hour' },
        { key: 'side', label: 'Side' },
        { key: 'volume_mwh', label: 'MWh', align: 'right', number: true },
        { key: 'limit_price_zar', label: 'Limit', align: 'right', currency: true },
        { key: 'filled_volume_mwh', label: 'Filled', align: 'right', number: true },
        { key: 'vwap_zar', label: 'VWAP', align: 'right', currency: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'Submit intraday order', endpoint: '/roles/trader/intraday',
        fields: [
          { name: 'delivery_hour', label: 'Delivery hour (ISO datetime)', type: 'datetime-local', required: true },
          { name: 'side', label: 'Side', type: 'select', required: true, options: [
            { value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' },
          ] },
          { name: 'volume_mwh', label: 'Volume (MWh)', type: 'number', required: true },
          { name: 'limit_price_zar', label: 'Limit price (ZAR)', type: 'number', required: true },
        ],
      },
    },
    {
      key: 'tr_pre_trade',
      label: 'Pre-trade checks',
      endpoint: '/roles/trader/pre-trade-check',
      description: 'Run a compliance + credit check before placing an order. Outcome: allow / warn / block.',
      columns: [
        { key: 'checked_at', label: 'When', date: true },
        { key: 'intent_type', label: 'Intent' },
        { key: 'outcome', label: 'Outcome', render: (r) => <StatusPill label={String(r.outcome)} tone={r.outcome === 'block' ? 'critical' : r.outcome === 'warn' ? 'warn' : 'good'} /> },
        { key: 'credit_used_pre', label: 'Pre exp', align: 'right', currency: true },
        { key: 'credit_used_post', label: 'Post exp', align: 'right', currency: true },
        { key: 'credit_limit', label: 'Limit', align: 'right', currency: true },
        { key: 'failed_checks', label: 'Failed checks' },
      ],
      create: {
        title: 'Run pre-trade check', endpoint: '/roles/trader/pre-trade-check',
        fields: [
          { name: 'intent_type', label: 'Intent type', type: 'select', required: true, options: [
            { value: 'order', label: 'Order' }, { value: 'block_bid', label: 'Block bid' },
            { value: 'intraday', label: 'Intraday' }, { value: 'rec', label: 'REC' },
            { value: 'carbon', label: 'Carbon' },
          ] },
          { name: 'intent_payload', label: 'Intent payload (JSON: volume_mwh, price)', type: 'json', required: true, default: { volume_mwh: 100, price: 1200 } },
        ],
      },
    },
    {
      key: 'tr_confirmations',
      label: 'Confirmations',
      endpoint: '/roles/trader/confirmations',
      description: 'T+0 trade affirmations — affirm, dispute, or novate.',
      columns: [
        { key: 'trade_id', label: 'Trade ID' },
        { key: 'counterparty_id', label: 'Counterparty' },
        { key: 'affirmation_status', label: 'Status', render: (r) => <StatusPill status={String(r.affirmation_status)} /> },
        { key: 'affirmed_at', label: 'Affirmed', date: true },
        { key: 'dispute_reason', label: 'Dispute reason' },
      ],
      create: {
        title: 'Add trade confirmation', endpoint: '/roles/trader/confirmations',
        fields: [
          { name: 'trade_id', label: 'Trade ID', type: 'text', required: true },
          { name: 'counterparty_id', label: 'Counterparty ID', type: 'text' },
          { name: 'affirmation_status', label: 'Status', type: 'select', options: [
            { value: 'pending', label: 'Pending' }, { value: 'affirmed', label: 'Affirmed' },
            { value: 'disputed', label: 'Disputed' },
          ] },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
      },
      rowActions: [
        { label: 'Update', endpoint: '/roles/trader/confirmations/{id}', method: 'PATCH', tone: 'primary',
          form: { title: 'Update confirmation', endpoint: '', fields: [
            { name: 'affirmation_status', label: 'Status', type: 'select', required: true, options: [
              { value: 'affirmed', label: 'Affirmed' }, { value: 'disputed', label: 'Disputed' },
              { value: 'novated', label: 'Novated' }, { value: 'cancelled', label: 'Cancelled' },
            ] },
            { name: 'dispute_reason', label: 'Dispute reason', type: 'textarea' },
            { name: 'novation_to', label: 'Novated to (new counterparty)', type: 'text' },
          ] },
        },
      ],
    },
  ];
}
