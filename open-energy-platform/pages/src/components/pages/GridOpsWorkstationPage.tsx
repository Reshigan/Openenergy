import React, { useState } from 'react';
import { WorkstationShell, ListingTable, Pill, ActionModal, FieldSpec } from '../launch/WorkstationShell';
import { AuditPanel } from '../launch/AuditPanel';
import { useWorkstationKpis, useWorkstationPanel } from '../launch/useWorkstationSummary';
import { api } from '../../lib/api';
import { DispatchNominationTab } from '../grid/DispatchNominationTab';
import { PlannedOutageChainTab } from '../grid/PlannedOutageChainTab';
import { RezCapacityChainTab } from '../grid/RezCapacityChainTab';
import { WheelingChargesTab } from '../grid/WheelingChargesTab';
import { ImbalanceSettlementChainTab } from '../grid/ImbalanceSettlementChainTab';
import { TransmissionOutageChainTab } from '../grid/TransmissionOutageChainTab';
import { ScadaConnectorTab } from '../scadaConnector/ScadaConnectorTab';
import { MqttOpcuaConnectorTab } from '../mqttOpcuaConnector/MqttOpcuaConnectorTab';
import { ReportPanel, type ReportConfig } from '../launch/ReportPanel';
import type { WizardSpec } from '../launch/WizardModal';
import type { TourDef } from '../launch/ProductTour';

const GRID_REPORTS: ReportConfig[] = [
  {
    title: 'Wheeling Charges',
    endpoint: '/api/grid/wheeling-charges',
    columns: [
      { key: 'charge_ref', label: 'Reference' },
      { key: 'licensee_id', label: 'Licensee' },
      { key: 'amount_zar', label: 'ZAR', numeric: true },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    filters: [{ key: 'chain_status', label: 'Status', type: 'select', options: [{ value: 'invoiced', label: 'Invoiced' }, { value: 'disputed', label: 'Disputed' }, { value: 'settled', label: 'Settled' }] }],
    pivotGroupBy: 'chain_status',
    mailSubject: 'Open Energy — Grid Wheeling Charges Report',
  },
  {
    title: 'Dispatch Nominations',
    endpoint: '/api/grid/dispatch-nominations',
    columns: [
      { key: 'trading_day', label: 'Trading Day' },
      { key: 'scheduled_mwh', label: 'Scheduled MWh', numeric: true },
      { key: 'actual_mwh', label: 'Actual MWh', numeric: true },
      { key: 'imbalance_mwh', label: 'Imbalance MWh', numeric: true },
      { key: 'nomination_status', label: 'Status' },
    ],
    dateKey: 'trading_day',
    pivotGroupBy: 'nomination_status',
    mailSubject: 'Open Energy — Dispatch Nominations Report',
  },
  {
    title: 'Grid Code Compliance',
    endpoint: '/api/grid/code-compliance',
    columns: [
      { key: 'compliance_ref', label: 'Reference' },
      { key: 'requirement_code', label: 'Code' },
      { key: 'chain_status', label: 'Status' },
      { key: 'created_at', label: 'Filed' },
    ],
    pivotGroupBy: 'requirement_code',
    mailSubject: 'Open Energy — Grid Code Compliance Report',
  },
];

const GRID_WIZARDS: WizardSpec[] = [
  {
    id: 'grid-complete-setup',
    title: 'Set up your grid operator workstation',
    subtitle: 'Configure operations, infrastructure, commercial, and regulatory workflows for your network',
    steps: [
      {
        title: 'Grid operations',
        description: 'Set up Dispatch nominations, Ancillary services, Curtailment management, Demand response, Load curtailments, and EOP activation workflows.',
        aiHint: 'Dispatch nominations use the 30-minute settlement interval. BRP nominations must be submitted by 12:00 D-1. EOP activation (Wave W215) has the tightest SLA — black_start events must be reviewed within 2 hours. Set your duty officer escalation contacts now so the system can auto-page during grid emergencies.',
        fields: [
          { key: 'ntcsa_member_code', label: 'NTCSA member code (BRP)', type: 'text', placeholder: 'e.g. OE-BRP-001' },
          { key: 'grid_zone', label: 'Primary grid zone', type: 'select', options: [{ value: 'transmission', label: 'Transmission (400kV/765kV)' }, { value: 'sub_transmission', label: 'Sub-transmission (132kV)' }, { value: 'distribution', label: 'Distribution (33kV and below)' }] },
          { key: 'eop_duty_officer', label: 'EOP duty officer contact', type: 'text', placeholder: 'Name — mobile number' },
        ],
      },
      {
        title: 'Infrastructure management',
        description: 'Configure Outage management, Planned outages, Transmission outages, Substation assets, and Smart meter assets.',
        aiHint: 'Substation asset lifecycle (Wave W211) tracks IEC 60076 transformer condition. Critical substations (serving > 500MW) get 90-day SLA for planned maintenance. Smart meter assets feed directly into settlement — meter data quality issues here affect imbalance settlement accuracy.',
        fields: [
          { key: 'substation_count', label: 'Number of substations managed', type: 'number', placeholder: 'e.g. 12' },
          { key: 'smart_meter_count', label: 'Metering points registered', type: 'number', placeholder: 'e.g. 450' },
          { key: 'maintenance_planner', label: 'Maintenance planning contact', type: 'text', placeholder: 'Name and email' },
        ],
      },
      {
        title: 'Commercial & wheeling',
        description: 'Set up Wheeling charges, Imbalance settlement, REZ capacity allocation, and grid capacity queue workflows.',
        aiHint: 'Wheeling charges (Wave W8) are calculated monthly on contracted transmission usage. Dispute resolution has a 30-day SLA. REZ capacity allocation (Wave W58) uses the NTCSA 2024 queue rules — first-in, first-served with technical merit scoring for ties.',
        fields: [
          { key: 'wheeling_methodology', label: 'Wheeling charge methodology', type: 'select', options: [{ value: 'postage_stamp', label: 'Postage stamp (flat rate)' }, { value: 'distance_based', label: 'Distance-based MW·km' }, { value: 'contract_path', label: 'Contract path allocation' }] },
          { key: 'rez_zones_managed', label: 'REZ zones managed', type: 'text', placeholder: 'e.g. Northern Cape REZ, Western Cape REZ' },
        ],
      },
      {
        title: 'Regulatory & compliance',
        description: 'Set up Grid capacity allocations, Grid code compliance monitoring, Connection energization, and Interconnector schedules.',
        aiHint: 'Grid code compliance monitoring (Wave W67) is proactive — the SO monitors facilities against NRS 097 thresholds and issues non-conformance notices automatically. Connection energization (Wave W75) requires witnessed hold-points — set your witness contacts so the workflow can auto-schedule commissioning inspections.',
        fields: [
          { key: 'grid_code_version', label: 'Applicable Grid Code version', type: 'select', options: [{ value: 'nersa_2022', label: 'NERSA Grid Code 2022' }, { value: 'nersa_2019', label: 'NERSA Grid Code 2019' }, { value: 'eskom_nrs', label: 'Eskom NRS 097 (distribution)' }] },
          { key: 'connection_queue_count', label: 'Applications in connection queue', type: 'number', placeholder: 'Current queue depth' },
          { key: 'commissioning_contact', label: 'Commissioning witness contact', type: 'text', placeholder: 'Name and email for energization witnessing' },
        ],
      },
    ],
    submitLabel: 'Save grid operator setup',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'grid_operator', ...values }) }).catch(() => {});
    },
  },
  {
    id: 'grid-dispatch-nomination',
    title: 'Submit a dispatch nomination',
    subtitle: 'NERSA Grid Code — BRP day-ahead nomination',
    steps: [
      {
        title: 'Nomination details',
        description: 'Identify the balancing responsible party and nomination window.',
        aiHint: 'Day-ahead nominations must be submitted by 12:00 the day before the delivery date. Late submissions are accepted but incur a penalty under the Grid Code.',
        fields: [
          { key: 'brp_name', label: 'BRP entity name', type: 'text', required: true, placeholder: 'e.g. Open Energy BRP001' },
          { key: 'delivery_date', label: 'Delivery date', type: 'date', required: true },
          { key: 'delivery_period', label: 'Delivery period', type: 'select', required: true, options: [{ value: 'full_day', label: 'Full day (48 x 30-min intervals)' }, { value: 'peak', label: 'Peak (07:00–21:00)' }, { value: 'offpeak', label: 'Off-peak' }, { value: 'custom', label: 'Custom intervals' }] },
        ],
      },
      {
        title: 'Volume profile',
        description: 'Set the nominated generation volumes.',
        aiHint: 'Nomination accuracy determines your imbalance settlement costs. The platform compares your nominations against actual metered output 30 minutes after delivery.',
        fields: [
          { key: 'nominated_mwh', label: 'Total nominated volume (MWh)', type: 'number', required: true, placeholder: 'e.g. 2400' },
          { key: 'peak_mw', label: 'Peak capacity nominated (MW)', type: 'number', placeholder: 'e.g. 140' },
          { key: 'renewable_mix', label: 'Renewable generation type', type: 'select', options: [{ value: 'solar', label: 'Solar dominant' }, { value: 'wind', label: 'Wind dominant' }, { value: 'mixed', label: 'Mixed' }] },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Contingency plant availability, weather-related caveats…' },
        ],
      },
    ],
    submitLabel: 'Submit nomination',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/dispatch-nominations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Nomination submission failed'); }
    },
  },
  {
    id: 'grid-planned-outage',
    title: 'Schedule a planned outage',
    subtitle: 'NERSA Grid Code — NTCSA outage notification',
    steps: [
      {
        title: 'Outage scope',
        description: 'Describe the maintenance scope and the affected asset.',
        aiHint: 'Under the Grid Code, transmission outages > 72h require NTCSA approval 14 days in advance. Distribution outages require 72h notice. The system sets the SLA based on duration and asset tier.',
        fields: [
          { key: 'asset_id', label: 'Asset identifier', type: 'text', required: true, placeholder: 'Substation ID or line segment' },
          { key: 'asset_type', label: 'Asset type', type: 'select', required: true, options: [{ value: 'transmission_line', label: 'Transmission line' }, { value: 'transformer', label: 'Transformer' }, { value: 'substation', label: 'Substation' }, { value: 'generator_connection', label: 'Generator connection point' }] },
          { key: 'outage_type', label: 'Outage category', type: 'select', options: [{ value: 'planned_maintenance', label: 'Planned maintenance' }, { value: 'inspection', label: 'Safety inspection' }, { value: 'upgrade', label: 'Capital upgrade' }, { value: 'testing', label: 'Protection relay testing' }] },
        ],
      },
      {
        title: 'Timing',
        description: 'Set the outage window and affected capacity.',
        aiHint: 'Peak hours (07:00–21:00) require NTCSA approval at least 7 days in advance regardless of duration. Scheduling outages outside peak hours typically gets faster approval.',
        fields: [
          { key: 'planned_start', label: 'Planned start', type: 'date', required: true },
          { key: 'planned_end', label: 'Planned end', type: 'date', required: true },
          { key: 'affected_capacity_mw', label: 'Affected capacity (MW)', type: 'number', placeholder: 'Capacity removed from service' },
        ],
      },
      {
        title: 'NTCSA notification',
        description: 'Provide the reference for the NTCSA notification.',
        fields: [
          { key: 'ntcsa_ref', label: 'NTCSA outage request reference', type: 'text', placeholder: 'NTCSA reference (if already pre-approved)' },
          { key: 'safety_plan_ref', label: 'Safety work plan reference', type: 'text', required: true, placeholder: 'Safety work plan document ID' },
          { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Special conditions, back-up supply arrangements…' },
        ],
      },
    ],
    submitLabel: 'Schedule outage',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/planned-outage', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Outage scheduling failed'); }
    },
  },
  {
    id: 'grid-reserve-activation',
    title: 'Activate an ancillary services reserve',
    subtitle: 'Grid Code SOC — NTCSA reserve activation',
    steps: [
      {
        title: 'Reserve type',
        description: 'Identify the reserve product and provider.',
        aiHint: 'Frequency response (FCR) reserves must respond within seconds. Slower reserves (RR, FRR) have minutes to respond but are cheaper. Use the correct reserve type to avoid performance penalties.',
        fields: [
          { key: 'reserve_type', label: 'Reserve type', type: 'select', required: true, options: [{ value: 'fcr', label: 'FCR — Frequency containment reserve' }, { value: 'frr_auto', label: 'FRR (automatic) — aFRR' }, { value: 'frr_manual', label: 'FRR (manual) — mFRR' }, { value: 'rr', label: 'RR — Replacement reserve' }] },
          { key: 'provider_name', label: 'Reserve provider', type: 'text', required: true, placeholder: 'Provider entity name' },
          { key: 'activation_reason', label: 'Activation reason', type: 'select', required: true, options: [{ value: 'frequency_deviation', label: 'Frequency deviation' }, { value: 'unit_trip', label: 'Generating unit trip' }, { value: 'load_surge', label: 'Unexpected load surge' }, { value: 'test', label: 'Scheduled test activation' }] },
        ],
      },
      {
        title: 'Volume & timing',
        description: 'Set the activation volume and expected duration.',
        fields: [
          { key: 'activated_mw', label: 'Activated volume (MW)', type: 'number', required: true, placeholder: 'e.g. 50' },
          { key: 'activation_time', label: 'Activation date/time', type: 'date', required: true },
          { key: 'expected_duration_min', label: 'Expected duration (minutes)', type: 'number', placeholder: 'e.g. 30' },
        ],
      },
    ],
    submitLabel: 'Record activation',
    onSubmit: async (values) => {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/reserve-activations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as any).error || 'Reserve activation failed'); }
    },
  },
  {
    id: 'grid-demand-response',
    title: 'Activate demand response event (W205)',
    steps: [
      {
        title: 'Activation',
        description: 'Configure the demand response programme and activation parameters.',
        fields: [
          { key: 'dr_programme', label: 'DR programme', type: 'select', required: true, options: [{ value: 'interruptible_load', label: 'Interruptible load' }, { value: 'smart_load_shifting', label: 'Smart load shifting' }, { value: 'emergency_demand_reduction', label: 'Emergency demand reduction' }, { value: 'frequency_response', label: 'Frequency response' }] },
          { key: 'event_date', label: 'Event date', type: 'date', required: true },
          { key: 'requested_mw', label: 'Requested MW', type: 'number', required: true },
          { key: 'duration_minutes', label: 'Duration (minutes)', type: 'number', required: true },
          { key: 'incentive_rate_per_mw', label: 'Incentive rate (ZAR/MW)', type: 'number', required: true },
        ],
      },
      {
        title: 'Performance',
        description: 'Record performance outcomes and incentive settlement.',
        fields: [
          { key: 'actual_mw_shed', label: 'Actual MW shed', type: 'number' },
          { key: 'performance_pct', label: 'Performance %', type: 'number', placeholder: 'actual/requested × 100' },
          { key: 'incentive_amount_zar', label: 'Incentive amount (ZAR)', type: 'number' },
          { key: 'non_performance_reason', label: 'Non-performance reason', type: 'textarea', placeholder: 'Required if performance < 80%' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/demand-response', values); },
  },
  {
    id: 'grid-imbalance-settlement',
    title: 'Process imbalance settlement',
    steps: [
      {
        title: 'BRP position',
        description: 'Record the balancing responsible party position and imbalance volume.',
        fields: [
          { key: 'brp_id', label: 'BRP ID', type: 'text', required: true },
          { key: 'delivery_period', label: 'Delivery period', type: 'text', required: true, placeholder: 'e.g. 2026-06-10 HH14' },
          { key: 'scheduled_mwh', label: 'Scheduled MWh', type: 'number', required: true },
          { key: 'actual_mwh', label: 'Actual MWh', type: 'number', required: true },
          { key: 'imbalance_mwh', label: 'Imbalance MWh', type: 'number', required: true },
        ],
      },
      {
        title: 'Settlement',
        description: 'Record settlement amounts and dispute status.',
        fields: [
          { key: 'imbalance_price_zar_per_mwh', label: 'Imbalance price (ZAR/MWh)', type: 'number', required: true },
          { key: 'settlement_amount_zar', label: 'Settlement amount (ZAR)', type: 'number', required: true },
          { key: 'dispute_raised', label: 'Dispute raised', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'dispute_grounds', label: 'Dispute grounds', type: 'textarea' },
          { key: 'settlement_date', label: 'Settlement date', type: 'date', required: true },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/imbalance-settlement', values); },
  },
  {
    id: 'grid-interconnector',
    title: 'Schedule interconnector trade',
    steps: [
      {
        title: 'Schedule',
        description: 'Define the interconnector and delivery schedule.',
        fields: [
          { key: 'interconnector_id', label: 'Interconnector ID', type: 'text', required: true },
          { key: 'neighbour_country', label: 'Neighbour country', type: 'select', required: true, options: [{ value: 'mozambique', label: 'Mozambique' }, { value: 'zambia', label: 'Zambia' }, { value: 'zimbabwe', label: 'Zimbabwe' }, { value: 'namibia', label: 'Namibia' }, { value: 'lesotho', label: 'Lesotho' }, { value: 'swaziland', label: 'Swaziland' }, { value: 'botswana', label: 'Botswana' }] },
          { key: 'direction', label: 'Direction', type: 'select', required: true, options: [{ value: 'import', label: 'Import' }, { value: 'export', label: 'Export' }] },
          { key: 'scheduled_mw', label: 'Scheduled MW', type: 'number', required: true },
          { key: 'delivery_start', label: 'Delivery start', type: 'date', required: true },
        ],
      },
      {
        title: 'Commercial',
        description: 'Set commercial terms and pre-approval references.',
        fields: [
          { key: 'delivery_end', label: 'Delivery end', type: 'date', required: true },
          { key: 'product_type', label: 'Product type', type: 'select', required: true, options: [{ value: 'firm', label: 'Firm' }, { value: 'non_firm', label: 'Non-firm' }, { value: 'emergency', label: 'Emergency' }] },
          { key: 'price_per_mwh', label: 'Price per MWh', type: 'number', required: true },
          { key: 'counterparty_ref', label: 'Counterparty reference', type: 'text' },
          { key: 'ntcsa_pre_approval_ref', label: 'NTCSA pre-approval reference', type: 'text', required: true },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/interconnector-schedules', values); },
  },
  {
    id: 'grid-rez-capacity',
    title: 'Register REZ capacity allocation (W58)',
    steps: [
      {
        title: 'Capacity request',
        description: 'Define the REZ zone and capacity being requested.',
        fields: [
          { key: 'rez_zone', label: 'REZ zone', type: 'text', required: true, placeholder: 'e.g. Northern Cape Zone 1' },
          { key: 'requested_capacity_mw', label: 'Requested capacity (MW)', type: 'number', required: true },
          { key: 'facility_type', label: 'Facility type', type: 'select', required: true, options: [{ value: 'solar_pv', label: 'Solar PV' }, { value: 'wind', label: 'Wind' }, { value: 'gas_peaker', label: 'Gas peaker' }, { value: 'battery', label: 'Battery' }, { value: 'hybrid', label: 'Hybrid' }] },
          { key: 'applicant_name', label: 'Applicant name', type: 'text', required: true },
          { key: 'gca_ref', label: 'GCA reference', type: 'text' },
        ],
      },
      {
        title: 'Queue position',
        description: 'Set queue priority and technical study requirements.',
        fields: [
          { key: 'application_priority', label: 'Application priority', type: 'select', options: [{ value: 'first_in_queue', label: 'First in queue' }, { value: 'competitive_window', label: 'Competitive window' }, { value: 'emergency_allocation', label: 'Emergency allocation' }] },
          { key: 'technical_study_required', label: 'Technical study required', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'connection_cost_estimate_zar', label: 'Connection cost estimate (ZAR)', type: 'number' },
          { key: 'grid_reinforcement_required', label: 'Grid reinforcement required', type: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
          { key: 'target_allocation_date', label: 'Target allocation date', type: 'date' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/grid-capacity-allocations', values); },
  },
  {
    id: 'grid-transmission-outage',
    title: 'Log transmission outage',
    steps: [
      {
        title: 'Outage details',
        description: 'Record the transmission asset and outage parameters.',
        fields: [
          { key: 'asset_id', label: 'Asset ID', type: 'text', required: true },
          { key: 'outage_type', label: 'Outage type', type: 'select', required: true, options: [{ value: 'planned', label: 'Planned' }, { value: 'forced', label: 'Forced' }, { value: 'emergency', label: 'Emergency' }] },
          { key: 'affected_voltage_kv', label: 'Affected voltage (kV)', type: 'select', required: true, options: [{ value: '765', label: '765 kV' }, { value: '400', label: '400 kV' }, { value: '275', label: '275 kV' }, { value: '132', label: '132 kV' }, { value: '88', label: '88 kV' }] },
          { key: 'affected_capacity_mw', label: 'Affected capacity (MW)', type: 'number', required: true },
          { key: 'start_time', label: 'Start time', type: 'date', required: true },
        ],
      },
      {
        title: 'Restoration',
        description: 'Set restoration timeline and contingency status.',
        fields: [
          { key: 'estimated_restoration', label: 'Estimated restoration', type: 'date' },
          { key: 'affected_region', label: 'Affected region', type: 'text', required: true },
          { key: 'ntcsa_ref', label: 'NTCSA reference', type: 'text' },
          { key: 'n1_contingency_met', label: 'N-1 contingency met', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'na', label: 'N/A' }] },
          { key: 'load_shedding_triggered', label: 'Load shedding triggered', type: 'select', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/transmission-outages', values); },
  },
  {
    id: 'grid-smart-meter',
    title: 'Register smart meter asset (W198)',
    steps: [
      {
        title: 'Meter details',
        description: 'Provide the smart meter identification and classification.',
        fields: [
          { key: 'meter_serial', label: 'Meter serial', type: 'text', required: true },
          { key: 'meter_class', label: 'Meter class', type: 'select', required: true, options: [{ value: 'class_0_2', label: 'Class 0.2' }, { value: 'class_0_5', label: 'Class 0.5' }, { value: 'class_1', label: 'Class 1' }, { value: 'class_2', label: 'Class 2' }] },
          { key: 'site_id', label: 'Site ID', type: 'text', required: true },
          { key: 'owner_id', label: 'Owner ID', type: 'text', required: true },
          { key: 'make_model', label: 'Make / model', type: 'text', required: true },
        ],
      },
      {
        title: 'Communication',
        description: 'Configure communication technology and commissioning dates.',
        fields: [
          { key: 'communication_tech', label: 'Communication technology', type: 'select', required: true, options: [{ value: 'plc', label: 'PLC' }, { value: 'gsm', label: 'GSM' }, { value: 'fibre', label: 'Fibre' }, { value: 'rf_mesh', label: 'RF Mesh' }, { value: 'zigbee', label: 'Zigbee' }] },
          { key: 'data_quality_score', label: 'Data quality score', type: 'number', placeholder: '0-100, 95+ is target' },
          { key: 'metering_point_id', label: 'Metering point ID', type: 'text' },
          { key: 'installation_date', label: 'Installation date', type: 'date', required: true },
          { key: 'commissioning_date', label: 'Commissioning date', type: 'date' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/smart-meter-assets', values); },
  },
  {
    id: 'grid-substation',
    title: 'Record substation asset event (W211)',
    steps: [
      {
        title: 'Asset',
        description: 'Identify the substation asset and its classification.',
        fields: [
          { key: 'asset_number', label: 'Asset number', type: 'text', required: true },
          { key: 'asset_type', label: 'Asset type', type: 'select', required: true, options: [{ value: 'power_transformer', label: 'Power transformer' }, { value: 'circuit_breaker', label: 'Circuit breaker' }, { value: 'disconnect_switch', label: 'Disconnect switch' }, { value: 'bus_bar', label: 'Bus bar' }, { value: 'protection_relay', label: 'Protection relay' }, { value: 'capacitor_bank', label: 'Capacitor bank' }] },
          { key: 'asset_tier', label: 'Asset tier', type: 'select', required: true, options: [{ value: 'distribution', label: 'Distribution' }, { value: 'sub_transmission', label: 'Sub-transmission' }, { value: 'transmission', label: 'Transmission' }, { value: 'critical_node', label: 'Critical node' }] },
          { key: 'voltage_kv', label: 'Voltage (kV)', type: 'number', required: true },
          { key: 'rated_mva', label: 'Rated MVA', type: 'number' },
        ],
      },
      {
        title: 'Condition',
        description: 'Record the condition assessment and maintenance activity.',
        fields: [
          { key: 'condition_score', label: 'Condition score', type: 'number', required: true, placeholder: '0-100' },
          { key: 'remaining_life_years', label: 'Remaining life (years)', type: 'number' },
          { key: 'maintenance_type', label: 'Maintenance type', type: 'select', required: true, options: [{ value: 'routine', label: 'Routine' }, { value: 'preventive', label: 'Preventive' }, { value: 'corrective', label: 'Corrective' }, { value: 'emergency', label: 'Emergency' }, { value: 'refurbishment', label: 'Refurbishment' }] },
          { key: 'failure_mode', label: 'Failure mode', type: 'select', placeholder: 'Required for failure records', options: [{ value: 'insulation_failure', label: 'Insulation failure' }, { value: 'mechanical_failure', label: 'Mechanical failure' }, { value: 'overload', label: 'Overload' }, { value: 'protection_mal_operation', label: 'Protection mal-operation' }, { value: 'corrosion', label: 'Corrosion' }] },
          { key: 'maintenance_cost_zar', label: 'Maintenance cost (ZAR)', type: 'number' },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/substation-assets', values); },
  },
  {
    id: 'grid-eop',
    title: 'Activate emergency operating procedure (W215)',
    steps: [
      {
        title: 'Emergency',
        description: 'Classify and describe the grid emergency.',
        fields: [
          { key: 'eop_tier', label: 'EOP tier', type: 'select', required: true, options: [{ value: 'n1_minor', label: 'N-1 minor' }, { value: 'n1_major', label: 'N-1 major' }, { value: 'n2', label: 'N-2' }, { value: 'black_start', label: 'Black start' }] },
          { key: 'contingency_type', label: 'Contingency type', type: 'select', required: true, options: [{ value: 'line_fault', label: 'Line fault' }, { value: 'station_failure', label: 'Station failure' }, { value: 'generation_trip', label: 'Generation trip' }, { value: 'frequency_emergency', label: 'Frequency emergency' }, { value: 'voltage_collapse', label: 'Voltage collapse' }] },
          { key: 'affected_mw', label: 'Affected MW', type: 'number', required: true },
          { key: 'affected_region', label: 'Affected region', type: 'text', required: true },
          { key: 'load_shedding_stage', label: 'Load shedding stage', type: 'select', required: true, options: [{ value: 'stage_1', label: 'Stage 1' }, { value: 'stage_2', label: 'Stage 2' }, { value: 'stage_3', label: 'Stage 3' }, { value: 'stage_4', label: 'Stage 4' }, { value: 'stage_5', label: 'Stage 5' }, { value: 'stage_6', label: 'Stage 6' }, { value: 'stage_7', label: 'Stage 7' }, { value: 'stage_8', label: 'Stage 8' }] },
        ],
      },
      {
        title: 'Response',
        description: 'Record response details and restoration plan.',
        fields: [
          { key: 'ntcsa_incident_ref', label: 'NTCSA incident reference', type: 'text', required: true },
          { key: 'per_lead_name', label: 'PER lead name', type: 'text', required: true },
          { key: 'root_cause', label: 'Root cause', type: 'textarea' },
          { key: 'restoration_plan', label: 'Restoration plan', type: 'textarea', required: true },
        ],
      },
    ],
    onSubmit: async (values) => { await api.post('/api/eop-activations', values); },
  },
];

const GRID_TOUR: TourDef = {
  id: 'grid-workstation-v1',
  steps: [
    { target: 'ws-header', title: 'Grid operator workstation', body: 'Real-time grid operations hub — dispatch nominations, planned outages, wheeling charges, EOP activations, and connection agreements all in one place.', placement: 'bottom' },
    { target: 'kpi-row', title: 'Grid KPIs', body: 'Live frequency, active nominations, open outage requests, and wheeling charge disputes. Critical operations are highlighted in red.', placement: 'bottom' },
    { target: 'tab-nav', title: 'Operations tabs', body: 'Grouped by function — Operations, Connections, Commercial, Compliance. Each tab is a live state-machine workflow with SLA timers.', placement: 'bottom' },
    { target: 'quick-start', title: 'Quick start', body: 'Wizards for submitting dispatch nominations, scheduling planned outages, and recording reserve activations with full NTCSA guidance at each step.', placement: 'bottom' },
    { target: 'capability-palette', title: 'What can I do?', body: 'See all grid operator actions — dispatch, ancillary services, GCA processing, EOP activation, and capacity allocation queue management.', placement: 'bottom' },
    { target: 'incoming-panel', title: 'Incoming actions', body: 'IPP connection requests, GCA applications, and NTCSA directives appear here for you to act on.', placement: 'left' },
  ],
};

function Header({ onCreate, label }: { onCreate: () => void; label: string }) {
  return (
    <div className="flex justify-end mb-3">
      <button type="button" onClick={onCreate} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
        + {label}
      </button>
    </div>
  );
}

export function GridOpsWorkstationPage() {
  const kpis = useWorkstationKpis('grid_operator');
  const curtailPanel = useWorkstationPanel('Active curtailment', '/grid-operator/curtailment', (r) => ({
    id: r.id,
    lead: <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-[#fff4d6] text-[#a06200]">{r.status || 'live'}</span>,
    text: <span>{r.instruction_number || r.id} · {r.target_mw ? `${r.target_mw} MW` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.effective_from ? new Date(r.effective_from).toLocaleTimeString('en-ZA') : ''}</span>,
  }), 'No active curtailment.');
  const outagePanel = useWorkstationPanel('Open outage responses', '/grid-operator/outages', (r) => ({
    id: r.id,
    lead: <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${r.severity === 'critical' ? 'bg-[#fbe9e6] text-[#c0392b]' : 'bg-[#fff4d6] text-[#a06200]'}`}>{r.severity || r.status || '—'}</span>,
    text: <span>{r.area || r.substation} · {r.affected_mw ? `${r.affected_mw} MW` : ''}</span>,
    meta: <span className="font-mono text-[10px] text-[#6b7685]">{r.detected_at ? new Date(r.detected_at).toLocaleTimeString('en-ZA') : ''}</span>,
  }), 'No outages.');
  const panels = [curtailPanel, outagePanel].filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <WorkstationShell
      role="grid_operator"
      eyebrow="Grid operator · Workstation"
      title="Grid operations workstation"
      subtitle="Curtailment events · Outage responses · Ancillary award events. Single screen, all in-platform."
      backHref="/grid-operator"
      backLabel="Operator suite"
      kpis={kpis}
      panels={panels}
      wizards={GRID_WIZARDS}
      tour={GRID_TOUR}
      tabs={[
        { key: 'dispatch_nomination', label: 'Dispatch nominations', group: 'Operations', chainKey: 'oe_dispatch_nominations', body: () => <DispatchNominationTab /> },
        { key: 'curtailment', label: 'Curtailment events', group: 'Operations', body: ({ onRefresh }) => <CurtailmentTab onRefresh={onRefresh} /> },
        { key: 'demand_response', label: 'Demand response (W205)', group: 'Operations', chainKey: 'demand_response_event', body: ({ onRefresh }) => <DemandResponseTab onRefresh={onRefresh} /> },
        { key: 'ancillary', label: 'Ancillary services', group: 'Operations', chainKey: 'reserve_activation', body: ({ onRefresh }) => <AncillaryTab onRefresh={onRefresh} /> },
        { key: 'imbalance-settlement', label: 'Imbalance settlement', group: 'Operations', chainKey: 'imbalance_settlement', body: () => <ImbalanceSettlementChainTab /> },
        { key: 'wheeling_charges', label: 'Wheeling charges', group: 'Operations', body: () => <WheelingChargesTab /> },
        { key: 'interconnector_schedules', label: 'SAPP interconnector schedules (W234)', group: 'Operations', chainKey: 'interconnector_schedule', body: ({ onRefresh }) => <InterconnectorScheduleTab onRefresh={onRefresh} /> },
        { key: 'rez_capacity', label: 'REZ capacity allocation', group: 'Connections', chainKey: 'rez_capacity', body: () => <RezCapacityChainTab /> },
        { key: 'transmission-outage', label: 'Transmission outage coordination', group: 'Connections', chainKey: 'transmission_outage', body: () => <TransmissionOutageChainTab /> },
        { key: 'outage', label: 'Outage responses', group: 'Connections', body: ({ onRefresh }) => <OutageTab onRefresh={onRefresh} /> },
        { key: 'planned_outage', label: 'Planned outages', group: 'Compliance', chainKey: 'planned_outage', body: () => <PlannedOutageChainTab /> },
        { key: 'scada-connectors', label: 'SCADA data', group: 'Compliance', body: () => <ScadaConnectorTab /> },
        { key: 'mqtt-opcua-connectors', label: 'MQTT/OPC-UA connectors', group: 'Compliance', body: () => <MqttOpcuaConnectorTab /> },
        { key: 'smart-meter-assets', label: 'Smart meter assets (W199)', group: 'Compliance', chainKey: 'smart_meter_asset', body: ({ onRefresh }) => <SmartMeterAssetsTab onRefresh={onRefresh} /> },
        { key: 'substation-assets', label: 'Substation assets (W211)', group: 'Compliance', chainKey: 'substation_asset', body: ({ onRefresh }) => <SubstationAssetsTab onRefresh={onRefresh} /> },
        { key: 'eop_activations', label: 'EOP activations (W215)', group: 'Operations', chainKey: 'eop_activation', body: ({ onRefresh }) => <EopActivationTab onRefresh={onRefresh} /> },
        {
          key: 'load_curtailments',
          label: 'Load curtailment (W34)',
          group: 'Operations',
          chainKey: 'load_curtailment',
          body: () => (
            <ListingTable
              endpoint="/load-curtailment/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No load curtailment cases', description: 'NERSA §CSC-1 load curtailment cases will appear here.' }}
              columns={[
                { key: 'load_shedding_stage', label: 'Stage' },
                { key: 'affected_mw', label: 'Affected MW', render: (r) => r.affected_mw != null ? `${r.affected_mw} MW` : '—' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['restored','completed'].includes(r.chain_status) ? 'good' : ['escalated','disputed'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Activated', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'grid_capacity_allocations',
          label: 'Capacity allocation (W58)',
          group: 'Connections',
          chainKey: 'grid_capacity_allocation',
          body: () => (
            <ListingTable
              endpoint="/grid-capacity/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No capacity allocations', description: 'NTCSA 2024 grid capacity allocation queue will appear here.' }}
              columns={[
                { key: 'requested_capacity_mw', label: 'Requested MW', render: (r) => r.requested_capacity_mw != null ? `${r.requested_capacity_mw} MW` : '—' },
                { key: 'connection_type', label: 'Connection type' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['allocated','confirmed'].includes(r.chain_status) ? 'good' : ['rejected_application','withdrawn'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Applied', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'grid_code_compliance',
          label: 'Grid code compliance (W67)',
          group: 'Compliance',
          chainKey: 'grid_code_compliance',
          body: () => (
            <ListingTable
              endpoint="/grid-code-compliance/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No compliance cases', description: 'NERSA Grid Code/NRS 097 conformance cases will appear here.' }}
              columns={[
                { key: 'voltage_level_kv', label: 'Voltage (kV)', render: (r) => r.voltage_level_kv != null ? `${r.voltage_level_kv} kV` : '—' },
                { key: 'facility_type', label: 'Facility type' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['compliant','closed_compliant'].includes(r.chain_status) ? 'good' : ['non_compliant','escalated_disconnection'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Opened', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        {
          key: 'connection_energization',
          label: 'Connection energization (W75)',
          group: 'Connections',
          chainKey: 'connection_energization',
          body: () => (
            <ListingTable
              endpoint="/connection-energization/chain"
              rowKey={(r) => r.id}
              empty={{ title: 'No energization cases', description: 'SA Grid Code/NTCSA connection energization and commissioning cases will appear here.' }}
              columns={[
                { key: 'connection_voltage_kv', label: 'Voltage (kV)', render: (r) => r.connection_voltage_kv != null ? `${r.connection_voltage_kv} kV` : '—' },
                { key: 'connection_type', label: 'Type' },
                { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['commercial_operation'].includes(r.chain_status) ? 'good' : ['withdrawn','suspended'].includes(r.chain_status) ? 'bad' : 'warn'}>{r.chain_status.replace(/_/g,' ')}</Pill> },
                { key: 'created_at', label: 'Initiated', render: (r) => new Date(r.created_at).toLocaleDateString() },
              ]}
            />
          ),
        },
        { key: 'reports', label: 'Reports & Exports', group: 'Compliance',
          body: () => (
            <div className="space-y-8">
              {GRID_REPORTS.map(cfg => (
                <div key={cfg.endpoint} className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{cfg.title}</p>
                  <ReportPanel config={cfg} />
                </div>
              ))}
            </div>
          ),
        },
        { key: 'audit', label: 'Audit & compliance', group: 'Compliance',
          body: ({ onRefresh }) => (
            <AuditPanel
              prefix="/grid-operator"
              reconHint="instruction_number,effective_from,target_mw,participant_id"
              reconSourceOptions={['eskom', 'nersa', 'so_internal']}
              onChange={onRefresh}
            />
          ),
        },
      ]}
    />
  );
}

function CurtailmentTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log curtailment event" />
      <ListingTable
        endpoint="/grid-operator/curtailment-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No curtailment events', description: 'Issuance, acknowledgement, partial / full lift events will appear here.' }}
        columns={[
          { key: 'curtailment_id', label: 'Curtailment', render: (r) => <span className="font-mono text-[11px]">{(r.curtailment_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type.includes('lift') ? 'good' : r.event_type === 'disputed' ? 'bad' : 'info'}>{r.event_type.replace(/_/g, ' ')}</Pill> },
          { key: 'actor_id', label: 'Actor', render: (r) => <span className="font-mono text-[11px]">{(r.actor_id || '').slice(0, 12)}…</span> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log curtailment event"
          submitLabel="Log"
          fields={[
            { key: 'curtailment_id', label: 'Curtailment ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'issued', label: 'Issued' },
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'disputed', label: 'Disputed' },
              { value: 'partial_lift', label: 'Partial lift' },
              { value: 'full_lift', label: 'Full lift' },
              { value: 'escalated', label: 'Escalated' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/grid-operator/curtailment-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function OutageTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log outage response" />
      <ListingTable
        endpoint="/grid-operator/outage-responses"
        rowKey={(r) => r.id}
        rowHref={(r) => `/grid-operator/outages/${encodeURIComponent(r.outage_id)}`}
        empty={{ title: 'No outage responses', description: 'Acknowledgements, crew dispatch, rerouting and restoration events will appear here.' }}
        columns={[
          { key: 'outage_id', label: 'Outage', render: (r) => <span className="font-mono text-[11px]">{(r.outage_id || '').slice(0, 12)}…</span> },
          { key: 'response_type', label: 'Response', render: (r) => <Pill tone={r.response_type === 'restored' || r.response_type === 'closed' ? 'good' : 'warn'}>{r.response_type.replace(/_/g, ' ')}</Pill> },
          { key: 'eta_minutes', label: 'ETA (min)', align: 'right' },
          { key: 'responded_at', label: 'When', render: (r) => new Date(r.responded_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log outage response"
          submitLabel="Log"
          fields={[
            { key: 'outage_id', label: 'Outage ID', required: true },
            { key: 'response_type', label: 'Response type', type: 'select', required: true, options: [
              { value: 'acknowledged', label: 'Acknowledged' },
              { value: 'dispatched_crew', label: 'Dispatched crew' },
              { value: 'rerouted', label: 'Rerouted' },
              { value: 'restored', label: 'Restored' },
              { value: 'escalated', label: 'Escalated' },
              { value: 'closed', label: 'Closed' },
            ] },
            { key: 'eta_minutes', label: 'ETA (minutes)', type: 'number' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            const body: any = { outage_id: v.outage_id, response_type: v.response_type, notes: v.notes };
            if (v.eta_minutes) body.eta_minutes = Number(v.eta_minutes);
            await api.post('/grid-operator/outage-responses', body);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

function AncillaryTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Log ancillary event" />
      <ListingTable
        endpoint="/grid-operator/ancillary-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No ancillary events', description: 'Award acceptances, deliveries, failures and settlement events land here.' }}
        columns={[
          { key: 'award_id', label: 'Award', render: (r) => <span className="font-mono text-[11px]">{(r.award_id || '').slice(0, 12)}…</span> },
          { key: 'event_type', label: 'Event', render: (r) => <Pill tone={r.event_type === 'delivered' || r.event_type === 'settled' ? 'good' : r.event_type === 'failed' || r.event_type === 'declined' ? 'bad' : 'info'}>{r.event_type}</Pill> },
          { key: 'occurred_at', label: 'When', render: (r) => new Date(r.occurred_at).toLocaleString() },
          { key: 'notes', label: 'Notes', render: (r) => <span className="block truncate max-w-md" title={r.notes || ''}>{r.notes || '—'}</span> },
        ]}
      />
      {filing && (
        <ActionModal
          title="Log ancillary award event"
          submitLabel="Log"
          fields={[
            { key: 'award_id', label: 'Award ID', required: true },
            { key: 'event_type', label: 'Event type', type: 'select', required: true, options: [
              { value: 'awarded', label: 'Awarded' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'declined', label: 'Declined' },
              { value: 'delivered', label: 'Delivered' },
              { value: 'failed', label: 'Failed' },
              { value: 'settled', label: 'Settled' },
            ] },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ] as FieldSpec[]}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/grid-operator/ancillary-events', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
    </div>
  );
}

const SMA_STATUS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  operational: 'good', decommissioned: 'bad', fault_detected: 'bad',
  replacement_pending: 'warn', commissioning: 'info', data_quality_pass: 'info',
};
const METER_CLASS_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good'> = {
  hv_bulk: 'bad', bulk: 'warn', prepaid: 'info', post_paid: 'good',
};
const SMA_ACTIONS = [
  { value: 'confirm_fat', label: 'Confirm FAT' },
  { value: 'confirm_delivery', label: 'Confirm delivery' },
  { value: 'schedule_installation', label: 'Schedule installation' },
  { value: 'confirm_installed', label: 'Confirm installed' },
  { value: 'start_commissioning', label: 'Start commissioning' },
  { value: 'confirm_communication', label: 'Confirm communication' },
  { value: 'pass_data_quality', label: 'Pass data quality' },
  { value: 'go_live', label: 'Go live' },
  { value: 'report_fault', label: 'Report fault' },
  { value: 'schedule_replacement', label: 'Schedule replacement' },
  { value: 'decommission', label: 'Decommission' },
  { value: 'return_to_service', label: 'Return to service' },
];

function SmartMeterAssetsTab({ onRefresh }: { onRefresh: () => void }) {
  const [filing, setFiling] = useState(false);
  const [actionRow, setActionRow] = useState<Record<string, unknown> | null>(null);

  const createFields: FieldSpec[] = [
    { key: 'meter_serial', label: 'Meter serial', required: true },
    { key: 'meter_class', label: 'Meter class', type: 'select', options: [
      { value: 'hv_bulk', label: 'HV Bulk (7d SLA)' },
      { value: 'bulk', label: 'Bulk (14d SLA)' },
      { value: 'prepaid', label: 'Prepaid (21d SLA)' },
      { value: 'post_paid', label: 'Post-paid (30d SLA)' },
    ]},
    { key: 'site_id', label: 'Site', required: true, type: 'lookup', lookupEndpoint: '/api/lookup/sites' },
    { key: 'owner_id', label: 'Owner participant', type: 'lookup', lookupEndpoint: '/api/lookup/participants' },
    { key: 'make_model', label: 'Make / model' },
    { key: 'communication_tech', label: 'Comms technology', type: 'select', options: [
      { value: 'gprs', label: 'GPRS' }, { value: 'plc', label: 'PLC' },
      { value: 'rf_mesh', label: 'RF Mesh' }, { value: 'fibre', label: 'Fibre' },
      { value: 'nb_iot', label: 'NB-IoT' },
    ]},
  ];

  return (
    <div>
      <Header onCreate={() => setFiling(true)} label="Register meter" />
      {filing && (
        <ActionModal
          title="Register smart meter asset"
          fields={createFields}
          onClose={() => setFiling(false)}
          onSubmit={async (v) => {
            await api.post('/smart-meter-assets', v);
            setFiling(false); onRefresh();
          }}
        />
      )}
      {actionRow && (
        <ActionModal
          title={`Meter action: ${String(actionRow.meter_serial || '')}`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: SMA_ACTIONS },
            { key: 'reason', label: 'Reason', type: 'textarea' },
            { key: 'fault_code', label: 'Fault code' },
            { key: 'data_quality_score', label: 'Data quality score (0-100)', type: 'number' },
          ] as FieldSpec[]}
          onClose={() => setActionRow(null)}
          onSubmit={async (v) => {
            await api.post(`/smart-meter-assets/${String(actionRow.id)}/action`, v);
            setActionRow(null); onRefresh();
          }}
        />
      )}
      <ListingTable
        endpoint="/smart-meter-assets"
        rowKey={(r) => r.id}
        columns={[
          { key: 'meter_serial', label: 'Serial', render: (r) => <span className="font-mono text-[11px]">{String(r.meter_serial || '')}</span> },
          { key: 'meter_class', label: 'Class', render: (r) => <Pill tone={METER_CLASS_TONE[String(r.meter_class)] ?? 'info'}>{String(r.meter_class || '').replace(/_/g, ' ')}</Pill> },
          { key: 'site_id', label: 'Site', render: (r) => <span className="font-mono text-[11px]">{String(r.site_id || '').slice(0, 16)}…</span> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={SMA_STATUS_TONE[String(r.chain_status)] ?? 'info'}>{String(r.chain_status || '').replace(/_/g, ' ')}</Pill> },
          { key: 'sla_deadline', label: 'SLA', render: (r) => r.sla_deadline ? String(r.sla_deadline) : '—' },
          { key: 'sla_breached', label: 'Breach', render: (r) => r.sla_breached ? <Pill tone="bad">BREACH</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'data_quality_score', label: 'DQ score', render: (r) => r.data_quality_score != null ? String(r.data_quality_score) : '—' },
          { key: 'actions', label: '', render: (r) => (
            <button type="button" onClick={() => setActionRow(r)} className="text-[11px] text-[#1a3a5c] underline">Action</button>
          )},
        ]}
      />
    </div>
  );
}

// ─── W205: Demand-Response Programme ─────────────────────────────────────────
type DrModalMode = 'create' | { type: 'action'; id: string; currentStatus: string } | null;

function DemandResponseTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<DrModalMode>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  const statusTone = (s: string) => {
    if (s === 'settled') return 'good' as const;
    if (['non_performance', 'cancelled'].includes(s)) return 'bad' as const;
    if (['settlement_disputed', 'load_shed'].includes(s)) return 'warn' as const;
    return 'neutral' as const;
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button type="button"
          className="px-3 py-1.5 rounded bg-[#1a3a5c] text-white text-sm font-medium hover:bg-[#1f4a78]"
          onClick={() => setModal('create')}
        >
          + Register DR event
        </button>
      </div>

      <ListingTable
        key={refreshKey}
        endpoint="/demand-response-events"
        rowKey={(r) => r.id}
        empty={{ title: 'No demand-response events', description: 'Register a DR programme activation event.' }}
        columns={[
          { key: 'event_date', label: 'Date', render: (r) => r.event_date },
          { key: 'dr_programme', label: 'Programme', render: (r) => <Pill tone="info">{String(r.dr_programme).replace(/_/g, ' ')}</Pill> },
          { key: 'requested_mw', label: 'Requested MW', align: 'right', render: (r) => r.requested_mw != null ? `${r.requested_mw} MW` : '—' },
          { key: 'actual_mw_shed', label: 'Actual MW', align: 'right', render: (r) => r.actual_mw_shed != null ? `${r.actual_mw_shed} MW` : '—' },
          { key: 'incentive_amount_zar', label: 'Incentive', align: 'right', render: (r) => r.incentive_amount_zar != null ? Number(r.incentive_amount_zar).toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }) : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={statusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Register demand-response event"
          submitLabel="Register"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/demand-response-events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                dr_programme: v.dr_programme,
                event_date: v.event_date,
                requested_mw: v.requested_mw ? parseFloat(v.requested_mw) : undefined,
                notification_type: v.notification_type || undefined,
                incentive_rate_per_mw: v.incentive_rate_per_mw ? parseFloat(v.incentive_rate_per_mw) : undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            { key: 'event_date', label: 'Event date', type: 'date', required: true },
            {
              key: 'dr_programme', label: 'DR programme', type: 'select', required: true, defaultValue: 'day_ahead',
              options: [
                { value: 'frequency_response', label: 'Frequency response (2h SLA)' },
                { value: 'real_time', label: 'Real-time (4h SLA)' },
                { value: 'day_ahead', label: 'Day-ahead (24h SLA)' },
                { value: 'interruptible_tariff', label: 'Interruptible tariff (48h SLA)' },
              ],
            },
            { key: 'requested_mw', label: 'Requested MW curtailment', type: 'number', required: false },
            {
              key: 'notification_type', label: 'Notification type', type: 'select', required: false,
              options: [
                { value: 'day_ahead', label: 'Day-ahead' },
                { value: 'real_time', label: 'Real-time' },
                { value: 'test', label: 'Test activation' },
              ],
            },
            { key: 'incentive_rate_per_mw', label: 'Incentive rate (ZAR/MW)', type: 'number', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`Advance DR event — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/demand-response-events/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                reason: v.reason || undefined,
                actual_mw_shed: v.actual_mw_shed ? parseFloat(v.actual_mw_shed) : undefined,
                performance_pct: v.performance_pct ? parseFloat(v.performance_pct) : undefined,
                incentive_amount_zar: v.incentive_amount_zar ? parseFloat(v.incentive_amount_zar) : undefined,
                settlement_ref: v.settlement_ref || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null);
            refresh();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'send_notification', label: 'Send notification to participant' },
                { value: 'acknowledge', label: 'Participant acknowledges' },
                { value: 'activate', label: 'Issue activation instruction' },
                { value: 'confirm_load_shed', label: 'Confirm load shed started' },
                { value: 'close_metering', label: 'Close metering window' },
                { value: 'verify_performance', label: 'Verify performance (independent)' },
                { value: 'calculate_settlement', label: 'Calculate incentive settlement' },
                { value: 'agree_settlement', label: 'Agree settlement amount' },
                { value: 'dispute_settlement', label: 'Raise settlement dispute' },
                { value: 'resolve_dispute', label: 'Resolve dispute' },
                { value: 'post_settlement', label: 'Post incentive payment' },
                { value: 'record_non_performance', label: 'Record non-performance' },
                { value: 'cancel', label: 'Cancel activation' },
              ],
            },
            { key: 'actual_mw_shed', label: 'Actual MW shed (metered)', type: 'number', required: false },
            { key: 'performance_pct', label: 'Performance % (actual/requested)', type: 'number', required: false },
            { key: 'incentive_amount_zar', label: 'Incentive amount (ZAR)', type: 'number', required: false },
            { key: 'settlement_ref', label: 'Settlement reference', required: false },
            { key: 'reason', label: 'Notes / reason', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ─── W211: Substation Asset Lifecycle Tab ─────────────────────────────────────
const SAS_TIER_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'info'> = {
  critical_node: 'bad', transmission: 'warn', subtransmission: 'info', distribution: 'neutral',
};

function SubstationAssetsTab({ onRefresh }: { onRefresh?: () => void }) {
  const [modal, setModal] = useState<null | { type: 'create' } | { type: 'action'; id: string; currentStatus: string; tier: string; name: string }>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setModal({ type: 'create' })} className="h-9 px-3 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold">
          + Register asset
        </button>
      </div>

      <ListingTable
        endpoint="/substation-assets"
        rowKey={(r) => r.id}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status, tier: r.asset_tier, name: r.name })}
        empty={{ title: 'No substation assets', description: 'Grid transformer and substation asset records will appear here.' }}
        columns={[
          { key: 'asset_number', label: 'Asset #', render: (r) => <span className="font-mono text-[11px]">{r.asset_number as string}</span> },
          { key: 'name', label: 'Name', render: (r) => <span className="font-medium text-[12px]">{r.name as string}</span> },
          { key: 'asset_type', label: 'Type', render: (r) => <span className="text-[11px]">{String(r.asset_type).replace(/_/g, ' ')}</span> },
          { key: 'asset_tier', label: 'Tier', render: (r) => <Pill tone={SAS_TIER_TONE[r.asset_tier as string] ?? 'neutral'}>{String(r.asset_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'voltage_kv', label: 'kV', render: (r) => r.voltage_kv != null ? <span>{r.voltage_kv as number} kV</span> : <span className="text-[#8fa3bd]">—</span> },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={['energised', 'returned_to_service'].includes(r.chain_status as string) ? 'good' : ['failed'].includes(r.chain_status as string) ? 'bad' : ['out_of_service', 'refurbishment'].includes(r.chain_status as string) ? 'warn' : 'neutral'}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'condition_score', label: 'Score', render: (r) => r.condition_score != null ? <span className={`font-semibold ${Number(r.condition_score) >= 7 ? 'text-green-700' : Number(r.condition_score) >= 4 ? 'text-amber-600' : 'text-red-600'}`}>{r.condition_score}/10</span> : <span className="text-[#8fa3bd]">—</span> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
        ]}
      />

      {modal?.type === 'create' && (
        <ActionModal
          title="Register substation asset"
          submitLabel="Register"
          fields={[
            { key: 'asset_number', label: 'Asset number / tag', required: true },
            { key: 'name', label: 'Asset name', required: true },
            { key: 'asset_type', label: 'Asset type', type: 'select', required: true, options: [
              { value: 'power_transformer', label: 'Power transformer' },
              { value: 'auto_transformer', label: 'Auto-transformer' },
              { value: 'circuit_breaker', label: 'Circuit breaker' },
              { value: 'disconnector', label: 'Disconnector' },
              { value: 'busbar', label: 'Busbar' },
              { value: 'cable', label: 'Cable' },
              { value: 'overhead_line', label: 'Overhead line' },
              { value: 'reactor', label: 'Reactor' },
              { value: 'capacitor_bank', label: 'Capacitor bank' },
              { value: 'protection_relay', label: 'Protection relay' },
            ]} as FieldSpec,
            { key: 'asset_tier', label: 'Tier', type: 'select', required: true, options: [
              { value: 'distribution', label: 'Distribution (11kV–66kV, 30d SLA)' },
              { value: 'subtransmission', label: 'Subtransmission (88kV–132kV, 45d SLA)' },
              { value: 'transmission', label: 'Transmission (220kV–765kV, 60d SLA)' },
              { value: 'critical_node', label: 'Critical node (N-1, 90d SLA)' },
            ]} as FieldSpec,
            { key: 'location_name', label: 'Substation / location name' },
            { key: 'voltage_kv', label: 'Rated voltage (kV)', type: 'number' },
            { key: 'rated_mva', label: 'Rated MVA', type: 'number' },
            { key: 'manufacturer', label: 'Manufacturer' },
            { key: 'year_manufactured', label: 'Year manufactured', type: 'number' },
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/substation-assets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, voltage_kv: v.voltage_kv ? Number(v.voltage_kv) : undefined, rated_mva: v.rated_mva ? Number(v.rated_mva) : undefined, year_manufactured: v.year_manufactured ? Number(v.year_manufactured) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); onRefresh?.();
          }}
        />
      )}

      {modal?.type === 'action' && (
        <ActionModal
          title={`${modal.name} — ${modal.tier} — ${String(modal.currentStatus).replace(/_/g, ' ')}`}
          submitLabel="Submit action"
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true, options: [
              { value: 'start_commissioning', label: 'Start commissioning' },
              { value: 'energise', label: 'Energise (put in service)' },
              { value: 'schedule_assessment', label: 'Schedule condition assessment' },
              { value: 'complete_assessment', label: 'Complete assessment' },
              { value: 'plan_refurbishment', label: 'Plan refurbishment' },
              { value: 'take_out_of_service', label: 'Take out of service' },
              { value: 'start_refurbishment', label: 'Start refurbishment works' },
              { value: 'return_to_service', label: 'Return to service' },
              { value: 'initiate_decommission', label: 'Initiate decommission' },
              { value: 'decommission', label: 'Decommission (final)' },
              { value: 'record_failure', label: 'Record failure event' },
            ]} as FieldSpec,
            { key: 'condition_score', label: 'Condition score (0–10)', type: 'number' },
            { key: 'remaining_life_years', label: 'Remaining life (years)', type: 'number' },
            { key: 'refurbishment_type', label: 'Refurbishment type', type: 'select', options: [
              { value: 'minor', label: 'Minor' },
              { value: 'major', label: 'Major' },
              { value: 'rewind', label: 'Rewind' },
            ]} as FieldSpec,
            { key: 'refurbishment_cost_zar', label: 'Refurbishment cost (ZAR)', type: 'number' },
            { key: 'decommission_reason', label: 'Decommission reason', type: 'select', options: [
              { value: 'end_of_life', label: 'End of life' },
              { value: 'failure', label: 'Failure' },
              { value: 'replacement', label: 'Replacement' },
              { value: 'stranded_asset', label: 'Stranded asset' },
            ]} as FieldSpec,
            { key: 'failure_mode', label: 'Failure mode', type: 'select', options: [
              { value: 'insulation_breakdown', label: 'Insulation breakdown' },
              { value: 'thermal_overload', label: 'Thermal overload' },
              { value: 'mechanical_failure', label: 'Mechanical failure' },
              { value: 'protection_misoperation', label: 'Protection mis-operation' },
              { value: 'corrosion', label: 'Corrosion' },
              { value: 'lightning_strike', label: 'Lightning strike' },
              { value: 'external_interference', label: 'External interference' },
              { value: 'end_of_life', label: 'End of life' },
              { value: 'other', label: 'Other' },
            ]} as FieldSpec,
            { key: 'reason', label: 'Notes' },
          ] as FieldSpec[]}
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/substation-assets/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, condition_score: v.condition_score ? Number(v.condition_score) : undefined, remaining_life_years: v.remaining_life_years ? Number(v.remaining_life_years) : undefined, refurbishment_cost_zar: v.refurbishment_cost_zar ? Number(v.refurbishment_cost_zar) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); onRefresh?.();
          }}
        />
      )}
    </div>
  );
}

// ─── W215: Grid EOP Activation ────────────────────────────────────────────────
const EOP_TIER_TONE: Record<string, 'info' | 'warn' | 'bad' | 'good' | 'neutral'> = {
  n1_minor: 'info',
  n1_significant: 'warn',
  n2_double: 'bad',
  black_start: 'bad',
};

function eopStatusTone(s: string): 'info' | 'warn' | 'bad' | 'good' | 'neutral' {
  if (s === 'per_completed') return 'good';
  if (s === 'per_outstanding' || s === 'escalated_to_regulator') return 'bad';
  if (s === 'restoration_in_progress' || s === 'load_shedding_assessed') return 'warn';
  return 'info';
}

type EopModal = null | 'create' | { type: 'action'; id: string; currentStatus: string };

function EopActivationTab({ onRefresh }: { onRefresh: () => void }) {
  const [modal, setModal] = useState<EopModal>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => { setRefreshKey(k => k + 1); onRefresh(); };

  return (
    <div>
      <button type="button"
        onClick={() => setModal('create')}
        className="mb-4 px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
      >
        Log contingency event
      </button>
      <ListingTable
        endpoint="/eop-activations"
        key={refreshKey}
        rowKey={(r) => r.id}
        empty={{ title: 'No EOP activations', description: 'Emergency Operations Plan activations will appear here.' }}
        columns={[
          { key: 'eop_tier', label: 'Severity', render: (r) => <Pill tone={EOP_TIER_TONE[r.eop_tier] ?? 'neutral'}>{String(r.eop_tier).replace(/_/g, ' ')}</Pill> },
          { key: 'contingency_type', label: 'Type', render: (r) => r.contingency_type ? String(r.contingency_type).replace(/_/g, ' ') : '—' },
          { key: 'affected_mw', label: 'MW affected', align: 'right', render: (r) => r.affected_mw ? `${Number(r.affected_mw).toFixed(0)} MW` : '—' },
          { key: 'chain_status', label: 'Status', render: (r) => <Pill tone={eopStatusTone(r.chain_status)}>{String(r.chain_status).replace(/_/g, ' ')}</Pill> },
          { key: 'sla_breached', label: 'SLA', render: (r) => r.sla_breached ? <Pill tone="bad">Breached</Pill> : <Pill tone="good">OK</Pill> },
          { key: 'contingency_at', label: 'Event time', render: (r) => r.contingency_at ? new Date(r.contingency_at as string).toLocaleString() : '—' },
        ]}
        rowOnClick={(r) => setModal({ type: 'action', id: r.id, currentStatus: r.chain_status })}
      />

      {modal === 'create' && (
        <ActionModal
          title="Log contingency / EOP event"
          submitLabel="Log event"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch('/api/eop-activations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                eop_tier: v.eop_tier,
                contingency_type: v.contingency_type || undefined,
                contingency_description: v.contingency_description,
                affected_mw: v.affected_mw ? parseFloat(v.affected_mw) : undefined,
                affected_region: v.affected_region || undefined,
                load_shedding_stage: v.load_shedding_stage || undefined,
                ntcsa_incident_ref: v.ntcsa_incident_ref || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            {
              key: 'eop_tier', label: 'Severity tier', type: 'select', required: true, defaultValue: 'n1_significant',
              options: [
                { value: 'n1_minor', label: 'N-1 Minor — <100MW (24h PER SLA)' },
                { value: 'n1_significant', label: 'N-1 Significant — 100–500MW (12h SLA)' },
                { value: 'n2_double', label: 'N-2 Double contingency — 500–1000MW (6h SLA)' },
                { value: 'black_start', label: 'Black start — system collapse (2h SLA)' },
              ],
            },
            {
              key: 'contingency_type', label: 'Contingency type', type: 'select', required: false,
              options: [
                { value: 'line_trip', label: 'Line trip' },
                { value: 'generator_trip', label: 'Generator trip' },
                { value: 'transformer_fault', label: 'Transformer fault' },
                { value: 'busbar_fault', label: 'Busbar fault' },
                { value: 'under_frequency', label: 'Under-frequency event' },
                { value: 'voltage_collapse', label: 'Voltage collapse' },
                { value: 'protection_failure', label: 'Protection failure' },
                { value: 'external', label: 'External cause' },
                { value: 'other', label: 'Other' },
              ],
            },
            { key: 'contingency_description', label: 'Description', type: 'textarea', required: true },
            { key: 'affected_mw', label: 'Affected MW', type: 'number', required: false },
            { key: 'affected_region', label: 'Affected region', required: false },
            { key: 'load_shedding_stage', label: 'Load shedding stage', type: 'select', required: false, options: [
              { value: 'stage_1', label: 'Stage 1' },
              { value: 'stage_2', label: 'Stage 2' },
              { value: 'stage_3', label: 'Stage 3' },
              { value: 'stage_4', label: 'Stage 4' },
              { value: 'stage_5', label: 'Stage 5' },
              { value: 'stage_6', label: 'Stage 6' },
              { value: 'stage_7', label: 'Stage 7' },
              { value: 'stage_8', label: 'Stage 8' },
            ] },
            { key: 'ntcsa_incident_ref', label: 'NTCSA incident reference', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}

      {modal !== null && modal !== 'create' && (
        <ActionModal
          title={`EOP action — ${modal.currentStatus.replace(/_/g, ' ')}`}
          submitLabel="Submit"
          onClose={() => setModal(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/eop-activations/${modal.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({
                action: v.action,
                load_shedding_stage: v.load_shedding_stage || undefined,
                affected_mw: v.affected_mw ? parseFloat(v.affected_mw) : undefined,
                total_outage_duration_min: v.total_outage_duration_min ? parseInt(v.total_outage_duration_min, 10) : undefined,
                per_lead_name: v.per_lead_name || undefined,
                root_cause: v.root_cause || undefined,
                contributing_factors: v.contributing_factors || undefined,
                lessons_learned: v.lessons_learned || undefined,
                action_items: v.action_items || undefined,
                nersa_notification_ref: v.nersa_notification_ref || undefined,
                escalation_reason: v.escalation_reason || undefined,
                reason: v.reason || undefined,
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            setModal(null); bump();
          }}
          fields={[
            {
              key: 'action', label: 'Action', type: 'select', required: true,
              options: [
                { value: 'activate_eop', label: 'Activate EOP' },
                { value: 'alert_operations_centre', label: 'Alert operations centre' },
                { value: 'assess_load_shedding', label: 'Assess load shedding requirement' },
                { value: 'commence_restoration', label: 'Commence network restoration' },
                { value: 'restore_normal_operations', label: 'Restore normal operations' },
                { value: 'initiate_per', label: 'Initiate post-event review' },
                { value: 'complete_per', label: 'Complete PER — record lessons' },
                { value: 'escalate_to_regulator', label: 'Escalate to NERSA' },
                { value: 'withdraw', label: 'Withdraw (false alarm / test)' },
              ],
            },
            { key: 'load_shedding_stage', label: 'Load shedding stage', type: 'select', required: false, options: [
              { value: 'stage_1', label: 'Stage 1' },
              { value: 'stage_2', label: 'Stage 2' },
              { value: 'stage_3', label: 'Stage 3' },
              { value: 'stage_4', label: 'Stage 4' },
              { value: 'stage_5', label: 'Stage 5' },
              { value: 'stage_6', label: 'Stage 6' },
              { value: 'stage_7', label: 'Stage 7' },
              { value: 'stage_8', label: 'Stage 8' },
            ] },
            { key: 'affected_mw', label: 'Affected MW', type: 'number', required: false },
            { key: 'total_outage_duration_min', label: 'Total outage duration (min)', type: 'number', required: false },
            { key: 'per_lead_name', label: 'PER lead name', required: false },
            { key: 'root_cause', label: 'Root cause', type: 'textarea', required: false },
            { key: 'contributing_factors', label: 'Contributing factors', type: 'textarea', required: false },
            { key: 'lessons_learned', label: 'Lessons learned', type: 'textarea', required: false },
            { key: 'action_items', label: 'Action items (JSON array)', type: 'textarea', required: false },
            { key: 'nersa_notification_ref', label: 'NERSA notification reference', required: false },
            { key: 'escalation_reason', label: 'Escalation reason', type: 'textarea', required: false },
            { key: 'reason', label: 'Notes', type: 'textarea', required: false },
          ]}
        />
      )}
    </div>
  );
}

// ── W234: SAPP Interconnector Schedule Tab ───────────────────────────────────

type IcsRow = {
  id: string;
  interconnector_name: string;
  neighbour_utility: string;
  neighbour_country: string;
  direction: string;
  capacity_tier: string;
  scheduled_mw: number;
  delivery_start: string;
  delivery_end: string;
  product_type: string;
  chain_status: string;
  sla_deadline: string | null;
  nersa_notified: number;
};

type IcsStats = {
  total: number;
  active: number;
  completed: number;
  in_dispute: number;
  overdue: number;
};

const ICS_TRANSITIONS: Record<string, string[]> = {
  schedule_draft: ['submit_to_sapp', 'cancel'],
  submitted_to_sapp: ['sapp_acknowledge', 'cancel'],
  sapp_review: ['receive_counter_schedule', 'agree_schedule', 'cancel'],
  counter_schedule_received: ['open_negotiation', 'cancel'],
  negotiation: ['agree_schedule', 'cancel'],
  agreed: ['commence_delivery', 'cancel'],
  operating: ['flag_deviation', 'complete_delivery'],
  deviated: ['resolve_deviation', 'raise_dispute'],
  deviation_resolved: ['complete_delivery', 'flag_deviation'],
  completed: [],
  dispute: ['complete_delivery', 'cancel'],
  cancelled: [],
};

const ICS_ACTION_LABELS: Record<string, string> = {
  submit_to_sapp: 'Submit to SAPP',
  sapp_acknowledge: 'SAPP acknowledged',
  receive_counter_schedule: 'Receive counter schedule',
  open_negotiation: 'Open negotiation',
  agree_schedule: 'Agree schedule',
  commence_delivery: 'Commence delivery',
  flag_deviation: 'Flag deviation',
  resolve_deviation: 'Resolve deviation',
  complete_delivery: 'Complete delivery',
  raise_dispute: 'Raise dispute',
  cancel: 'Cancel',
};

const ICS_DESTRUCTIVE = new Set(['cancel', 'raise_dispute']);

function icsStatusTone(s: string): 'good' | 'bad' | 'warn' | 'info' | 'neutral' {
  if (s === 'completed' || s === 'agreed') return 'good';
  if (s === 'cancelled' || s === 'dispute') return 'bad';
  if (s === 'deviated') return 'warn';
  if (s === 'operating') return 'info';
  return 'neutral';
}

function InterconnectorScheduleTab({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = React.useState<{ schedules: IcsRow[]; stats: IcsStats } | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [actionTarget, setActionTarget] = React.useState<IcsRow | null>(null);

  const bump = () => { setRefreshKey(k => k + 1); onRefresh?.(); };

  React.useEffect(() => {
    fetch('/api/grid/interconnector-schedule', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then(r => r.json())
      .then((j: { data: { schedules: IcsRow[]; stats: IcsStats } }) => setData(j.data))
      .catch(() => null);
  }, [refreshKey]);

  if (!data) return <div className="p-6 text-[13px] text-[var(--oe-outline)]">Loading…</div>;

  const { schedules, stats } = data;

  const statCards = [
    { label: 'Total', value: stats.total },
    { label: 'Active', value: stats.active },
    { label: 'Completed', value: stats.completed },
    { label: 'In dispute', value: stats.in_dispute },
    { label: 'Overdue', value: stats.overdue },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        {statCards.map(s => (
          <div key={s.label} className="flex-1 min-w-[100px] rounded-xl border border-[var(--oe-surface-container)] bg-[var(--oe-surface-container-lowest)] px-4 py-3">
            <div className="text-[11px] text-[var(--oe-outline)] uppercase tracking-wide">{s.label}</div>
            <div className={`text-[22px] font-semibold ${(s.label === 'In dispute' || s.label === 'Overdue') && s.value > 0 ? 'text-red-600' : 'text-[var(--oe-on-surface)]'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-lg bg-[var(--oe-primary)] text-white text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]"
        >
          + New schedule
        </button>
      </div>

      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--oe-surface-container)]">
            {['Interconnector', 'Utility', 'Dir', 'MW', 'Product', 'Delivery start', 'Status', 'NERSA', ''].map(h => (
              <th key={h} className="text-left py-2 px-2 text-[var(--oe-outline)] font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedules.map(row => (
            <tr key={row.id} className="border-b border-[var(--oe-surface-container-low)] hover:bg-[var(--oe-surface-container-lowest)]">
              <td className="py-2 px-2 font-medium text-[var(--oe-on-surface)]">{row.interconnector_name}</td>
              <td className="py-2 px-2 text-[var(--oe-on-surface-variant)]">{row.neighbour_utility} ({row.neighbour_country})</td>
              <td className="py-2 px-2"><Pill tone={row.direction === 'export' ? 'info' : 'neutral'}>{row.direction}</Pill></td>
              <td className="py-2 px-2 text-right text-[var(--oe-on-surface)]">{row.scheduled_mw.toFixed(0)} MW</td>
              <td className="py-2 px-2 text-[var(--oe-on-surface-variant)]">{row.product_type.replace(/_/g, ' ')}</td>
              <td className="py-2 px-2 text-[var(--oe-on-surface-variant)]">{new Date(row.delivery_start).toLocaleDateString()}</td>
              <td className="py-2 px-2"><Pill tone={icsStatusTone(row.chain_status)}>{row.chain_status.replace(/_/g, ' ')}</Pill></td>
              <td className="py-2 px-2">{row.nersa_notified ? <Pill tone="warn">Yes</Pill> : <span className="text-[var(--oe-outline)]">—</span>}</td>
              <td className="py-2 px-2">
                {(ICS_TRANSITIONS[row.chain_status] ?? []).length > 0 && (
                  <button
                    onClick={() => setActionTarget(row)}
                    className="text-[var(--oe-primary)] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--oe-primary)] rounded"
                  >
                    Action
                  </button>
                )}
              </td>
            </tr>
          ))}
          {schedules.length === 0 && (
            <tr><td colSpan={9} className="py-8 text-center text-[var(--oe-outline)]">No interconnector schedules</td></tr>
          )}
        </tbody>
      </table>

      {creating && (
        <ActionModal
          title="New SAPP Interconnector Schedule"
          fields={[
            { key: 'interconnector_id', label: 'Interconnector ID (e.g. SA-ZIM-275kV)', required: true },
            { key: 'interconnector_name', label: 'Interconnector name', required: true },
            { key: 'neighbour_utility', label: 'Neighbour utility', required: true },
            { key: 'neighbour_country', label: 'Country', type: 'select', required: true,
              options: ['ZW','MZ','BW','NA','LS','SZ','ZM'].map(v => ({ value: v, label: v })) },
            { key: 'direction', label: 'Direction', type: 'select', required: true,
              options: [{ value: 'export', label: 'Export' }, { value: 'import', label: 'Import' }, { value: 'wheeling', label: 'Wheeling' }] },
            { key: 'scheduled_mw', label: 'Scheduled MW', type: 'number', required: true },
            { key: 'delivery_start', label: 'Delivery start (ISO)', required: true },
            { key: 'delivery_end', label: 'Delivery end (ISO)', required: true },
            { key: 'product_type', label: 'Product type', type: 'select', required: true,
              options: ['day_ahead','intraday','week_ahead','bilateral'].map(v => ({ value: v, label: v.replace(/_/g, ' ') })) },
            { key: 'price_per_mwh', label: 'Price (USD/MWh)', type: 'number' },
            { key: 'counterparty_ref', label: 'Counterparty reference' },
          ]}
          submitLabel="Create schedule"
          onClose={() => setCreating(false)}
          onSubmit={async (v) => {
            const res = await fetch('/api/grid/interconnector-schedule', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...v, scheduled_mw: Number(v.scheduled_mw), price_per_mwh: v.price_per_mwh ? Number(v.price_per_mwh) : undefined }),
            });
            if (!res.ok) throw new Error(await res.text());
            setCreating(false); bump();
          }}
        />
      )}

      {actionTarget && (
        <ActionModal
          title={`Action — ${actionTarget.interconnector_name}`}
          fields={[
            { key: 'action', label: 'Action', type: 'select', required: true,
              options: (ICS_TRANSITIONS[actionTarget.chain_status] ?? []).map(a => ({ value: a, label: ICS_ACTION_LABELS[a] ?? a })) },
            { key: 'reason_code', label: 'Reason code' },
            { key: 'reason_detail', label: 'Notes', type: 'textarea' },
          ]}
          submitLabel="Submit"
          cta={ICS_DESTRUCTIVE.has(actionTarget.chain_status) ? 'danger' : 'primary'}
          onClose={() => setActionTarget(null)}
          onSubmit={async (v) => {
            const res = await fetch(`/api/grid/interconnector-schedule/${actionTarget.id}/action`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify(v),
            });
            if (!res.ok) throw new Error(await res.text());
            setActionTarget(null); bump();
          }}
        />
      )}
    </div>
  );
}
