import React from 'react';
import { SuitePage, StatusPill, TabSpec } from '../SuitePage';
import { platformTabs } from '../platformTabs';
import { offtakerCompletionTabs } from '../roleCompletionTabs';
import { OfftakerInsights } from '../widgets/OfftakerInsights';
import { ObligationsTab } from '../offtaker/ObligationsTab';
import { PpaChangeInLawChainTab } from '../offtaker/PpaChangeInLawChainTab';
import { PpaNominationChainTab } from '../offtaker/PpaNominationChainTab';

export function OfftakerSuitePage() {
  const tabs: TabSpec[] = [
    {
      key: 'change-in-law',
      label: 'Change in law',
      endpoint: '',
      description: 'PPA change-in-law relief chain (NERSA ERA s4 regulated-tariff pass-through + PPA change-in-law / tax-change clauses + IFRS treatment) · 12-state P6 lifecycle of a relief claim arising from a tax, regulatory, statutory or discriminatory change in law: an event is logged, eligibility is reviewed, the financial impact is assessed, the seller submits a relief claim, the counterparty reviews and negotiates, and — failing agreement — the matter goes to arbitration or determination, ending in relief granted + implemented or rejected. INVERTED SLA (larger claim quantum = more analysis time); offtaker drives, the claimant / counterparty / arbitrator party is derived from the action. Referring a claim to arbitration crosses to the regulator inbox for every tier (the change-in-law hard line); a governmental relief grant crosses for material + major + critical, and SLA breaches cross for major + critical.',
      columns: [],
      customContent: <PpaChangeInLawChainTab />,
    },
    {
      key: 'ppa-nominations',
      label: 'PPA nominations',
      endpoint: '',
      description: 'PPA scheduled-energy nomination & deviation settlement chain (NERSA Metering Code + NTCSA System Operator + PPA forecast / nomination / deviation clauses + IFRS 15 variable-consideration revenue recognition) · 12-state P6 daily lifecycle of a scheduled-energy nomination: window opens, day-ahead nomination is submitted and confirmed, intraday revisions are accepted up to gate closure, delivery runs, the meter delivers settled volumes, reconciliation classifies any deviation, optionally a dispute is raised, and the deviation is settled (compensation seller↔offtaker per the deviation ladder) or excused (force majeure / curtailment / grid outage). Tier is RE-DERIVED on every transition from absolute deviation %: minor < 5% / standard 5–10% / material 10–20% / major ≥ 20%. URGENT SLA (larger deviation = tighter window); offtaker drives, the seller / system operator / independent meter party is derived from the action. Raising a dispute crosses to the regulator inbox for every tier (the nomination-integrity hard line — sister of regulator complaints); excusing a period, settling a major / material deviation and SLA breaches cross for material + major.',
      columns: [],
      customContent: <PpaNominationChainTab />,
    },
    {
      key: 'obligations',
      label: 'PPA obligations',
      endpoint: '',
      description: 'Monthly contracted-vs-delivered tracking with cure windows + take-or-pay automation.',
      columns: [],
      customContent: <ObligationsTab />,
    },
    {
      key: 'insights',
      label: 'Insights',
      endpoint: '',
      description: 'Tariff optimiser, load shape, carbon-offset ROI, NERSA revenue requirement.',
      columns: [],
      customContent: <OfftakerInsights />,
    },
    {
      key: 'groups',
      label: 'Site groups',
      endpoint: '/offtaker-suite/groups',
      description: 'Group delivery points by company / division / region for consolidated billing.',
      columns: [
        { key: 'group_name', label: 'Group' },
        { key: 'group_type', label: 'Type' },
        { key: 'billing_entity', label: 'Billing entity' },
        { key: 'vat_number', label: 'VAT #' },
        { key: 'cost_centre', label: 'Cost centre' },
        { key: 'member_count', label: 'Sites', align: 'right', number: true },
      ],
      create: {
        title: 'New site group',
        endpoint: '/offtaker-suite/groups',
        fields: [
          { name: 'group_name', label: 'Group name', type: 'text', required: true },
          { name: 'group_type', label: 'Type', type: 'select', options: [
            { value: 'company', label: 'Company' },
            { value: 'division', label: 'Division' },
            { value: 'brand', label: 'Brand' },
            { value: 'region', label: 'Region' },
            { value: 'other', label: 'Other' },
          ] },
          { name: 'billing_entity', label: 'Billing entity', type: 'text' },
          { name: 'vat_number', label: 'VAT #', type: 'text' },
          { name: 'consolidated_invoice', label: 'Consolidated invoice?', type: 'checkbox', default: true },
          { name: 'cost_centre', label: 'Cost centre', type: 'text' },
        ],
      },
      rowActions: [
        { label: '+ Site', endpoint: '/offtaker-suite/groups/{id}/members',
          form: { title: 'Add delivery point to group', endpoint: '', fields: [
            { name: 'delivery_point_id', label: 'Delivery point ID', type: 'text', required: true },
            { name: 'allocation_percentage', label: 'Allocation %', type: 'number', default: 100 },
          ] },
        },
      ],
    },
    {
      key: 'tariffs',
      label: 'Tariffs',
      endpoint: '/offtaker-suite/tariffs',
      description:
        'Registry of utility and municipal tariffs. Admins add new tariffs.',
      columns: [
        { key: 'tariff_code', label: 'Code' },
        { key: 'tariff_name', label: 'Name' },
        { key: 'utility', label: 'Utility' },
        { key: 'category', label: 'Category' },
        { key: 'structure_type', label: 'Structure' },
        { key: 'effective_from', label: 'From', date: true },
        { key: 'effective_to', label: 'To', date: true },
      ],
      create: {
        title: 'Add tariff (admin only)',
        endpoint: '/offtaker-suite/tariffs',
        fields: [
          { name: 'tariff_code', label: 'Code', type: 'text', required: true },
          { name: 'tariff_name', label: 'Name', type: 'text', required: true },
          { name: 'utility', label: 'Utility', type: 'text', required: true, placeholder: 'Eskom / CCT / CoJ' },
          { name: 'category', label: 'Category', type: 'select', required: true, options: [
            { value: 'commercial', label: 'Commercial' },
            { value: 'industrial', label: 'Industrial' },
            { value: 'residential', label: 'Residential' },
            { value: 'agricultural', label: 'Agricultural' },
            { value: 'public_sector', label: 'Public sector' },
            { value: 'wheeling', label: 'Wheeling' },
          ] },
          { name: 'structure_type', label: 'Structure', type: 'select', required: true, options: [
            { value: 'flat', label: 'Flat' },
            { value: 'tou', label: 'TOU' },
            { value: 'stepped_block', label: 'Stepped block' },
            { value: 'demand_based', label: 'Demand based' },
            { value: 'fixed_plus_energy', label: 'Fixed + energy' },
            { value: 'hybrid', label: 'Hybrid' },
          ] },
          { name: 'tou_schedule', label: 'TOU schedule (JSON)', type: 'json', help: 'Only for TOU structures.' },
          { name: 'effective_from', label: 'Effective from', type: 'date', required: true },
          { name: 'effective_to', label: 'Effective to', type: 'date' },
        ],
      },
    },
    {
      key: 'profiles',
      label: 'Consumption profiles',
      endpoint: '/offtaker-suite/profiles',   // requires delivery_point_id; set via params
      description: 'Upload a 48-half-hour profile to enable tariff comparison and budgeting.',
      columns: [
        { key: 'profile_date', label: 'Date', date: true },
        { key: 'total_kwh', label: 'Total kWh', align: 'right', number: true },
        { key: 'peak_kw', label: 'Peak kW', align: 'right', number: true },
        { key: 'peak_time', label: 'Peak time' },
        { key: 'load_factor', label: 'Load factor', align: 'right', number: true },
        { key: 'source', label: 'Source' },
      ],
      create: {
        title: 'Upload half-hour profile',
        endpoint: '/offtaker-suite/profiles',
        fields: [
          { name: 'delivery_point_id', label: 'Delivery point ID', type: 'text', required: true },
          { name: 'profile_date', label: 'Profile date', type: 'date', required: true },
          { name: 'half_hour_kwh', label: 'Half-hour kWh (JSON array of 48)', type: 'json', required: true },
          { name: 'source', label: 'Source', type: 'select', options: [
            { value: 'meter', label: 'Meter' },
            { value: 'estimated', label: 'Estimated' },
            { value: 'aggregated', label: 'Aggregated' },
          ], default: 'meter' },
        ],
      },
    },
    {
      key: 'budget',
      label: 'Budget vs actual',
      endpoint: '/offtaker-suite/budget-vs-actual',
      params: { period: new Date().toISOString().slice(0, 7) },
      description: 'Current-month budget vs actual per site. Use New to file a budget line.',
      columns: [
        { key: 'delivery_point_id', label: 'Site' },
        { key: 'cost_centre', label: 'Cost centre' },
        { key: 'budgeted_kwh', label: 'Budget kWh', align: 'right', number: true },
        { key: 'budgeted_zar', label: 'Budget ZAR', align: 'right', currency: true },
        { key: 'actual_kwh', label: 'Actual kWh', align: 'right', number: true },
        { key: 'variance_pct', label: 'Variance %', align: 'right', number: true },
      ],
      create: {
        title: 'Set budget line',
        endpoint: '/offtaker-suite/budgets',
        fields: [
          { name: 'period', label: 'Period', type: 'text', required: true, placeholder: '2026-04' },
          { name: 'site_group_id', label: 'Site group ID', type: 'text' },
          { name: 'delivery_point_id', label: 'Delivery point ID', type: 'text' },
          { name: 'budgeted_kwh', label: 'Budget kWh', type: 'number' },
          { name: 'budgeted_zar', label: 'Budget ZAR', type: 'number' },
          { name: 'cost_centre', label: 'Cost centre', type: 'text' },
        ],
      },
    },
    {
      key: 'recs',
      label: 'RECs',
      endpoint: '/offtaker-suite/recs/portfolio',
      description: 'Renewable energy certificate portfolio. IPPs issue; offtakers retire for Scope 2.',
      columns: [
        { key: 'participant_id', label: 'Participant' },
        { key: 'active_certificates', label: 'Active certs', align: 'right', number: true },
        { key: 'active_mwh', label: 'Active MWh', align: 'right', number: true },
        { key: 'retirements', label: 'Retirements', align: 'right', number: true },
        { key: 'retired_mwh', label: 'Retired MWh', align: 'right', number: true },
      ],
      create: {
        title: 'Issue REC certificate (IPP / admin)',
        endpoint: '/offtaker-suite/recs/certificates',
        fields: [
          { name: 'certificate_serial', label: 'Serial', type: 'text', required: true },
          { name: 'generator_participant_id', label: 'Generator participant ID', type: 'text' },
          { name: 'project_id', label: 'Project ID', type: 'text' },
          { name: 'generation_period_start', label: 'Generation from', type: 'date', required: true },
          { name: 'generation_period_end', label: 'Generation to', type: 'date', required: true },
          { name: 'mwh_represented', label: 'MWh represented', type: 'number', required: true },
          { name: 'technology', label: 'Technology', type: 'select', options: [
            { value: 'solar_pv', label: 'Solar PV' }, { value: 'wind', label: 'Wind' },
            { value: 'hydro', label: 'Hydro' }, { value: 'biomass', label: 'Biomass' },
            { value: 'geothermal', label: 'Geothermal' },
          ] },
          { name: 'registry', label: 'Registry', type: 'select', options: [
            { value: 'I-REC', label: 'I-REC' },
            { value: 'SAREC', label: 'SAREC' },
            { value: 'TIGRs', label: 'TIGRs' },
            { value: 'custom', label: 'Custom' },
          ], default: 'I-REC' },
          { name: 'issuance_date', label: 'Issuance date', type: 'date', required: true },
        ],
      },
    },
    {
      key: 'scope2',
      label: 'Scope 2',
      endpoint: '/offtaker-suite/scope2',
      description:
        'Annual Scope 2 (GHG Protocol 2015). Both location-based and market-based are computed when you enter the year, consumption and RECs claimed.',
      columns: [
        { key: 'reporting_year', label: 'Year', align: 'right', number: true },
        { key: 'total_consumption_mwh', label: 'Total MWh', align: 'right', number: true },
        { key: 'location_based_emissions_tco2e', label: 'Location-based', align: 'right', number: true },
        { key: 'market_based_emissions_tco2e', label: 'Market-based', align: 'right', number: true },
        { key: 'renewable_percentage', label: 'Renewable %', align: 'right', number: true },
        { key: 'status', label: 'Status', render: (r) => <StatusPill status={String(r.status)} /> },
      ],
      create: {
        title: 'File Scope 2 disclosure',
        endpoint: '/offtaker-suite/scope2',
        fields: [
          { name: 'reporting_year', label: 'Year', type: 'number', required: true, default: new Date().getFullYear() },
          { name: 'total_consumption_mwh', label: 'Total consumption (MWh)', type: 'number', required: true },
          { name: 'renewable_mwh_claimed', label: 'Renewable claimed (MWh)', type: 'number' },
          { name: 'grid_factor_tco2e_per_mwh', label: 'Grid factor (tCO2e/MWh)', type: 'number', required: true, default: 0.93, help: 'NERSA-published SA grid factor.' },
          { name: 'audit_reference', label: 'Audit reference', type: 'text' },
        ],
      },
    },
    ...offtakerCompletionTabs(),
    ...platformTabs('offtaker_demand'),
  ];
  return (
    <SuitePage
      eyebrow="Offtaker · Suite"
      title="Offtaker workbench"
      subtitle="Multi-site groups, tariff comparison, consumption profiles, REC retirement and Scope 2 disclosures."
      tabs={tabs}
      heroRole="offtaker"
      heroEyebrow="Offtaker · portfolio overview"
      heroTitle="Offtaker workbench"
      heroSubtitle="Multi-site groups, tariff comparison, RECs and Scope 2 disclosures."
      aiBriefRole="offtaker"
      aiBriefAccent={{ from: '#1a8a5b', to: '#1f9b95' }}
    />
  );
}
