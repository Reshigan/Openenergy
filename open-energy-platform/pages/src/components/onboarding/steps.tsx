// ═══════════════════════════════════════════════════════════════════════════
// Onboarding Step Components — one component per step, all roles
// ═══════════════════════════════════════════════════════════════════════════

import React from 'react';

export interface StepProps {
  data: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  role?: string;
  userName?: string;
  accentColor?: string;
}

// ─── Shared primitives ──────────────────────────────────────────────────────

const LABEL_CLS = 'block text-[12px] font-medium text-[#3a4760] mb-1';
const INPUT_CLS = 'w-full h-9 px-3 rounded border border-[#dde3ee] text-[13px] text-[#0e1726] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.46_0.16_55)] focus-visible:border-[oklch(0.46_0.16_55)]';
const SELECT_CLS = INPUT_CLS;
const FIELD_CLS = 'space-y-1';
const GRID2 = 'grid grid-cols-2 gap-x-4 gap-y-3';
const CHECK_ROW_CLS = 'flex items-center gap-2 text-[13px] text-[#3a4760] cursor-pointer';

const PROVINCES = ['GP', 'WC', 'KZN', 'EC', 'LP', 'FS', 'NC', 'NW', 'MP'] as const;
const PROVINCE_LABELS: Record<string, string> = {
  GP: 'Gauteng', WC: 'Western Cape', KZN: 'KwaZulu-Natal', EC: 'Eastern Cape',
  LP: 'Limpopo', FS: 'Free State', NC: 'Northern Cape', NW: 'North West', MP: 'Mpumalanga',
};

// ponytail: inject a generated id onto the first input child + htmlFor on the label so
// every Field call site gets a programmatic label/control pair with no per-site edits.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId();
  const [first, ...rest] = React.Children.toArray(children);
  const labelled = React.isValidElement(first)
    ? React.cloneElement(first as React.ReactElement<{ id?: string }>, { id })
    : first;
  return (
    <div className={FIELD_CLS}>
      <label className={LABEL_CLS} htmlFor={id}>{label}</label>
      {labelled}{rest}
    </div>
  );
}

function CheckRow({
  id, label, checked, onChange,
}: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={CHECK_ROW_CLS} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="h-3.5 w-3.5 rounded border-[#dde3ee] accent-[oklch(0.46_0.16_55)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function getArr(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

function toggleArr(data: Record<string, unknown>, key: string, val: string, onChange: (k: string, v: unknown) => void) {
  const arr = getArr(data, key);
  const next = arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  onChange(key, next);
}

// ─── Welcome ────────────────────────────────────────────────────────────────

const ROLE_DESCS: Record<string, string> = {
  esums_owner:   'Monitor and manage your renewable energy sites with real-time data, predictive analytics, and automated O&M workflows.',
  ipp_developer: 'Manage your IPP project lifecycle from procurement through COD, with REIPPPP compliance, lender reporting, and regulatory submissions.',
  trader:        'Access the South African energy exchange to place orders, manage positions, and stay ahead of pre-trade risk controls.',
  lender:        'Track project finance portfolios, monitor covenant health, and manage drawdown approvals across your clean-energy book.',
  offtaker:      'Manage your PPA contracts, track contracted-vs-delivered energy, and handle tariff indexation and payment security.',
  carbon_fund:   'Administer carbon credit registries, MRV verification chains, ITMO transfers, and Article 6 corresponding adjustments.',
  grid_operator: 'Monitor dispatch nominations, ancillary services, connection agreements, and grid-code compliance across your zone.',
  regulator:     'Process licence applications, manage compliance inspections, issue enforcement notices, and run MYPD tariff determinations.',
  support:       'Handle ITIL incident, problem, and change management across OEM brands with SLA tracking and escalation workflows.',
  admin:         'Full platform access across all roles, modules, and administrative functions.',
};

// Roles that can join with existing history (assets, contracts, credits,
// capacity, O&M books). For these the welcome step asks new-vs-historic so the
// activation cascade knows whether to fan out to every counterparty the
// imported history implies. Oversight roles (regulator, grid_operator, support,
// admin) bring no portfolio, so they skip the choice and default to 'new'.
const HISTORIC_ROLES: Record<string, { historicLabel: string; historicDesc: string }> = {
  ipp_developer: { historicLabel: 'I have existing projects', historicDesc: 'Bring operating plants, PPAs, debt and carbon arms into the platform' },
  esums_owner:   { historicLabel: 'I have existing sites / O&M', historicDesc: 'Bring operating sites and live O&M contracts under monitoring' },
  esco:          { historicLabel: 'I have existing O&M', historicDesc: 'Bring live O&M contracts under monitoring' },
  lender:        { historicLabel: 'I have an existing loan book', historicDesc: 'Bring active facilities and borrowers into the portfolio' },
  carbon_fund:   { historicLabel: 'I have existing credits / RECs', historicDesc: 'Bring carbon inventory and RECs in for registry reconciliation and sale' },
  offtaker:      { historicLabel: 'I have existing offtake', historicDesc: 'Bring an existing PPA portfolio under management' },
  trader:        { historicLabel: 'I am bringing trading capacity', historicDesc: 'Activate the desk with imported limits and counterparties' },
};

function TakeOnChoice({ data, onChange, role }: { data: Record<string, unknown>; onChange: (k: string, v: unknown) => void; role: string }) {
  const cfg = HISTORIC_ROLES[role];
  if (!cfg) return null;
  // Default to 'new' so the field is always captured even if the user never clicks.
  const mode = data.take_on_mode === 'historic' ? 'historic' : 'new';
  const Card = ({ value, label, desc }: { value: 'new' | 'historic'; label: string; desc: string }) => {
    const on = mode === value;
    return (
      <button
        type="button"
        onClick={() => onChange('take_on_mode', value)}
        aria-pressed={on}
        className={`flex-1 text-left rounded-lg border p-3 transition ${
          on ? 'border-[oklch(0.46_0.16_55)] bg-[oklch(0.46_0.16_55)]/[0.04] ring-2 ring-[oklch(0.46_0.16_55)]/30'
             : 'border-[#dde3ee] hover:border-[#c4cedb]'}`}
      >
        <div className="text-[13px] font-semibold text-[#0e1726]">{label}</div>
        <div className="mt-1 text-[12px] text-[#6b7891] leading-snug">{desc}</div>
      </button>
    );
  };
  return (
    <div className="relative mt-6 text-left">
      <p className="text-[12px] font-medium text-[#3a4760] mb-2 text-center">How are you joining?</p>
      <div className="flex gap-3 max-w-md mx-auto">
        <Card value="new" label="Starting fresh" desc="Set up from scratch — no existing portfolio to import" />
        <Card value="historic" label={cfg.historicLabel} desc={cfg.historicDesc} />
      </div>
    </div>
  );
}

export function WelcomeStep({ data, onChange, role = 'admin', userName = '' }: StepProps) {
  const desc = ROLE_DESCS[role] || ROLE_DESCS['admin'];
  const firstName = userName ? userName.split(' ')[0] : 'there';
  return (
    <div className="text-center space-y-4 py-2">
      {/* Decorative grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03] rounded-xl"
        style={{
          backgroundImage: 'linear-gradient(oklch(0.88 0.006 250) 1px, transparent 1px), linear-gradient(90deg, oklch(0.88 0.006 250) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      <div className="relative">
        <h2 className="text-[22px] font-semibold text-[#0e1726] leading-snug">
          Welcome to Meridian, {firstName}
        </h2>
        <p className="mt-3 text-[14px] text-[#6b7891] leading-relaxed max-w-sm mx-auto">{desc}</p>
        <p className="mt-4 text-[12px] text-[#6b7891] font-medium uppercase tracking-wider">
          This will take about 2 minutes
        </p>
      </div>
      <TakeOnChoice data={data} onChange={onChange} role={role} />
    </div>
  );
}

// ─── esums_owner ─────────────────────────────────────────────────────────────

export function EsumsSiteSetupStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <div className="col-span-2">
          <Field label="Site name">
            <input
              className={INPUT_CLS}
              type="text"
              placeholder="e.g. Stellenbosch Solar Farm"
              value={(data.site_name as string) || ''}
              onChange={(e) => onChange('site_name', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Site type">
          <select className={SELECT_CLS} value={(data.site_type as string) || ''} onChange={(e) => onChange('site_type', e.target.value)}>
            <option value="">Select…</option>
            <option value="solar_pv">Solar PV</option>
            <option value="wind">Wind</option>
            <option value="bess">Battery Storage (BESS)</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </Field>
        <Field label="Installed capacity (kW)">
          <input
            className={INPUT_CLS}
            type="number"
            placeholder="e.g. 5000"
            value={(data.installed_capacity_kw as string) || ''}
            onChange={(e) => onChange('installed_capacity_kw', e.target.value)}
          />
        </Field>
        <Field label="Province">
          <select className={SELECT_CLS} value={(data.location_province as string) || ''} onChange={(e) => onChange('location_province', e.target.value)}>
            <option value="">Select…</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{PROVINCE_LABELS[p]}</option>)}
          </select>
        </Field>
        <Field label="Grid connection type">
          <select className={SELECT_CLS} value={(data.grid_connection_type as string) || ''} onChange={(e) => onChange('grid_connection_type', e.target.value)}>
            <option value="">Select…</option>
            <option value="embedded_generation">Embedded Generation</option>
            <option value="wheeling">Wheeling</option>
            <option value="off_grid">Off-Grid</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

export function EsumsDeviceConfigStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <Field label="Number of inverters">
          <input className={INPUT_CLS} type="number" placeholder="e.g. 4" value={(data.inverter_count as string) || ''} onChange={(e) => onChange('inverter_count', e.target.value)} />
        </Field>
        <Field label="Number of meters">
          <input className={INPUT_CLS} type="number" placeholder="e.g. 2" value={(data.meter_count as string) || ''} onChange={(e) => onChange('meter_count', e.target.value)} />
        </Field>
        <Field label="Communications protocol">
          <select className={SELECT_CLS} value={(data.comms_protocol as string) || ''} onChange={(e) => onChange('comms_protocol', e.target.value)}>
            <option value="">Select…</option>
            <option value="modbus_rs485">Modbus RS-485</option>
            <option value="modbus_tcp">Modbus TCP</option>
            <option value="sunspec">SunSpec</option>
            <option value="mqtt">MQTT</option>
            <option value="proprietary">Proprietary</option>
          </select>
        </Field>
        <Field label="Data interval">
          <select className={SELECT_CLS} value={(data.data_interval_min as string) || ''} onChange={(e) => onChange('data_interval_min', e.target.value)}>
            <option value="">Select…</option>
            <option value="1">1 minute</option>
            <option value="5">5 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

// ─── Data source entry form (used inside EsumsDataSourcesStep) ───────────────

const SOURCE_TYPE_LABELS: Record<string, string> = {
  modbus_tcp:     'Modbus TCP',
  sunspec:        'SunSpec (Modbus)',
  modbus_rtu_ip:  'Modbus RTU over IP',
  mqtt:           'MQTT Broker',
  rest_api:       'REST API',
  opc_ua:         'OPC-UA',
  push_ingest:    'Push Ingest (device sends data)',
};

interface DataSourceEntry {
  id: string;
  label: string;
  source_type: string;
  host?: string;
  port?: string;
  unit_id?: string;
  topic_prefix?: string;
  broker_url?: string;
  api_url?: string;
  api_auth_type?: string;
  api_key_value?: string;
}

function newEntry(): DataSourceEntry {
  return { id: String(Date.now()), label: '', source_type: '' };
}

function DataSourceForm({
  entry,
  accentColor,
  onChange,
  onRemove,
}: {
  entry: DataSourceEntry;
  accentColor: string;
  onChange: (updated: DataSourceEntry) => void;
  onRemove: () => void;
}) {
  const set = (k: keyof DataSourceEntry, v: string) => onChange({ ...entry, [k]: v });
  const isTcp = ['modbus_tcp', 'sunspec', 'modbus_rtu_ip', 'opc_ua'].includes(entry.source_type);
  const isMqtt = entry.source_type === 'mqtt';
  const isRest = entry.source_type === 'rest_api';

  return (
    <div className="rounded-lg border border-[#dde3ee] bg-[#f9fafb] p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 grid grid-cols-2 gap-3">
          <Field label="Label">
            <input className={INPUT_CLS} placeholder="e.g. Roof inverter bank" value={entry.label}
              onChange={(e) => set('label', e.target.value)} />
          </Field>
          <Field label="Connection type">
            <select className={SELECT_CLS} value={entry.source_type}
              onChange={(e) => set('source_type', e.target.value)}>
              <option value="">Select…</option>
              {Object.entries(SOURCE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        <button type="button" onClick={onRemove}
          className="mt-6 text-[#6b7891] hover:text-[#dc2626] text-[11px] flex-none">✕</button>
      </div>

      {isTcp && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="IP Address / Hostname">
            <input className={INPUT_CLS} placeholder="192.168.1.100" value={entry.host || ''}
              onChange={(e) => set('host', e.target.value)} />
          </Field>
          <Field label="Port">
            <input className={INPUT_CLS} type="number" placeholder="502" value={entry.port || ''}
              onChange={(e) => set('port', e.target.value)} />
          </Field>
          <Field label="Unit ID">
            <input className={INPUT_CLS} type="number" placeholder="1" value={entry.unit_id || ''}
              onChange={(e) => set('unit_id', e.target.value)} />
          </Field>
        </div>
      )}

      {isMqtt && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Broker URL">
            <input className={INPUT_CLS} placeholder="mqtt://192.168.1.50:1883" value={entry.broker_url || ''}
              onChange={(e) => set('broker_url', e.target.value)} />
          </Field>
          <Field label="Topic prefix">
            <input className={INPUT_CLS} placeholder="site/inverter/#" value={entry.topic_prefix || ''}
              onChange={(e) => set('topic_prefix', e.target.value)} />
          </Field>
        </div>
      )}

      {isRest && (
        <div className="space-y-3">
          <Field label="API endpoint URL">
            <input className={INPUT_CLS} placeholder="https://api.myinverter.com/v1/readings" value={entry.api_url || ''}
              onChange={(e) => set('api_url', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Authentication">
              <select className={SELECT_CLS} value={entry.api_auth_type || 'none'}
                onChange={(e) => set('api_auth_type', e.target.value)}>
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="api_key">API key header</option>
                <option value="basic">Basic auth</option>
              </select>
            </Field>
            {(entry.api_auth_type === 'bearer' || entry.api_auth_type === 'api_key') && (
              <Field label="Token / API key">
                <input className={INPUT_CLS} type="password" autoComplete="off" placeholder="sk-…" value={entry.api_key_value || ''}
                  onChange={(e) => set('api_key_value', e.target.value)} />
              </Field>
            )}
          </div>
        </div>
      )}

      {entry.source_type === 'push_ingest' && (
        <p className="text-[12px] text-[#6b7891] bg-white rounded border border-[#dde3ee] px-3 py-2">
          Your device will POST readings to <code className="font-mono">/api/esums-ingest/:site_key</code>.
          An ingest key is generated automatically for your site.
        </p>
      )}

      {entry.source_type && (
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
          <span className="text-[11px] text-[#6b7891]">
            {isTcp ? 'Polling via edge agent — TCP devices require on-site connectivity'
              : isMqtt ? 'Edge agent subscribes to broker — requires LAN access'
              : isRest ? 'Cloud-polled — URL must be publicly reachable'
              : 'Ready to receive data'}
          </span>
        </div>
      )}
    </div>
  );
}

export function EsumsDataSourcesStep({ data, onChange, accentColor = '#16a34a' }: StepProps) {
  const sources: DataSourceEntry[] = (data.sources as DataSourceEntry[]) || [];

  const update = (updated: DataSourceEntry[]) => onChange('sources', updated);

  const addEntry = () => update([...sources, newEntry()]);
  const removeEntry = (idx: number) => update(sources.filter((_, i) => i !== idx));
  const changeEntry = (idx: number, updated: DataSourceEntry) =>
    update(sources.map((s, i) => (i === idx ? updated : s)));

  return (
    <div className="space-y-4">
      {sources.length === 0 && (
        <div className="rounded-lg border border-dashed border-[#dde3ee] bg-[#f9fafb] p-6 text-center">
          <div className="text-[13px] text-[#6b7891] mb-1">No data sources added yet</div>
          <div className="text-[11px] text-[#9ca3af]">Add your inverters, meters, MQTT brokers or REST APIs</div>
        </div>
      )}

      {sources.map((entry, idx) => (
        <DataSourceForm
          key={entry.id}
          entry={entry}
          accentColor={accentColor}
          onChange={(u) => changeEntry(idx, u)}
          onRemove={() => removeEntry(idx)}
        />
      ))}

      <button
        type="button"
        onClick={addEntry}
        className="w-full h-9 rounded border border-dashed border-[#dde3ee] text-[12px] font-medium hover:border-[oklch(0.46_0.16_55)] hover:text-[oklch(0.46_0.16_55)] transition-colors"
        style={{ color: '#6b7891' }}
      >
        + Add data source
      </button>

      <p className="text-[11px] text-[#9ca3af]">
        You can skip this and add data sources later from the Esums dashboard.
      </p>
    </div>
  );
}

export function EsumsAlertsStep({ data, onChange }: StepProps) {
  const notify = getArr(data, 'notify_on');
  const notifyOpts = [
    { key: 'overtemp', label: 'Over-temperature' },
    { key: 'low_irradiance', label: 'Low irradiance' },
    { key: 'inverter_fault', label: 'Inverter fault' },
    { key: 'comms_loss', label: 'Comms loss' },
    { key: 'pr_degradation', label: 'PR degradation' },
  ];
  return (
    <div className="space-y-5">
      <div className="flex gap-6">
        <CheckRow id="email_alerts" label="Email alerts" checked={Boolean(data.email_alerts)} onChange={(v) => onChange('email_alerts', v)} />
        <CheckRow id="sms_alerts" label="SMS alerts" checked={Boolean(data.sms_alerts)} onChange={(v) => onChange('sms_alerts', v)} />
      </div>
      <Field label={`Alert threshold: ${data.alert_threshold_pct ?? 90}%`}>
        <input
          type="range" min="80" max="100" step="1"
          className="w-full accent-[oklch(0.46_0.16_55)]"
          value={(data.alert_threshold_pct as number) ?? 90}
          onChange={(e) => onChange('alert_threshold_pct', Number(e.target.value))}
        />
        <div className="flex justify-between text-[11px] text-[#6b7891] mt-1"><span>80%</span><span>100%</span></div>
      </Field>
      <div>
        <p className={LABEL_CLS}>Notify on</p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {notifyOpts.map((o) => (
            <CheckRow key={o.key} id={`notify_${o.key}`} label={o.label} checked={notify.includes(o.key)} onChange={() => toggleArr(data, 'notify_on', o.key, onChange)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ipp_developer ───────────────────────────────────────────────────────────

export function IppCompanyProfileStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <Field label="Company registration number">
          <input className={INPUT_CLS} type="text" placeholder="e.g. 2010/012345/07" value={(data.company_reg_no as string) || ''} onChange={(e) => onChange('company_reg_no', e.target.value)} />
        </Field>
        <Field label="B-BBEE level">
          <select className={SELECT_CLS} value={(data.bee_level as string) || ''} onChange={(e) => onChange('bee_level', e.target.value)}>
            <option value="">Select…</option>
            {[1,2,3,4,5,6,7,8].map((l) => <option key={l} value={l}>Level {l}</option>)}
            <option value="exempt">Exempt (EME/QSE)</option>
          </select>
        </Field>
        <Field label="REIPPPP bidder number (optional)">
          <input className={INPUT_CLS} type="text" placeholder="e.g. REIPPPP-R6-0001" value={(data.reipppp_bidder_no as string) || ''} onChange={(e) => onChange('reipppp_bidder_no', e.target.value)} />
        </Field>
        <Field label="Primary province">
          <select className={SELECT_CLS} value={(data.primary_province as string) || ''} onChange={(e) => onChange('primary_province', e.target.value)}>
            <option value="">Select…</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{PROVINCE_LABELS[p]}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

export function IppFirstProjectStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <div className="col-span-2">
          <Field label="Project name">
            <input className={INPUT_CLS} type="text" placeholder="e.g. Karoo Wind Farm Phase 1" value={(data.project_name as string) || ''} onChange={(e) => onChange('project_name', e.target.value)} />
          </Field>
        </div>
        <Field label="Technology">
          <select className={SELECT_CLS} value={(data.technology as string) || ''} onChange={(e) => onChange('technology', e.target.value)}>
            <option value="">Select…</option>
            <option value="solar_pv">Solar PV</option>
            <option value="wind">Wind</option>
            <option value="bess">BESS</option>
            <option value="hydro">Hydro</option>
            <option value="biomass">Biomass</option>
            <option value="csg">Concentrated Solar (CSG)</option>
          </select>
        </Field>
        <Field label="Installed capacity (MW)">
          <input className={INPUT_CLS} type="number" placeholder="e.g. 100" value={(data.installed_capacity_mw as string) || ''} onChange={(e) => onChange('installed_capacity_mw', e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Expected commercial operation date">
            <input className={INPUT_CLS} type="date" value={(data.expected_cod as string) || ''} onChange={(e) => onChange('expected_cod', e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  );
}

export function IppComplianceStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <Field label="NERSA licence number (optional)">
        <input className={INPUT_CLS} type="text" placeholder="e.g. G/G/G/…" value={(data.nersa_licence_no as string) || ''} onChange={(e) => onChange('nersa_licence_no', e.target.value)} />
      </Field>
      <Field label="Independent Engineer firm (optional)">
        <input className={INPUT_CLS} type="text" placeholder="e.g. Turner & Townsend, WSP" value={(data.ie_firm as string) || ''} onChange={(e) => onChange('ie_firm', e.target.value)} />
      </Field>
    </div>
  );
}

// ─── trader ──────────────────────────────────────────────────────────────────

export function TraderEntityStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <Field label="Trading desk name">
        <input className={INPUT_CLS} type="text" placeholder="e.g. ZA Power Desk" value={(data.trading_desk_name as string) || ''} onChange={(e) => onChange('trading_desk_name', e.target.value)} />
      </Field>
      <Field label="FSCA FSP number">
        <input className={INPUT_CLS} type="text" placeholder="FSP number" value={(data.fsp_number as string) || ''} onChange={(e) => onChange('fsp_number', e.target.value)} />
      </Field>
      <Field label="LEI code">
        <input className={INPUT_CLS} type="text" placeholder="20-character LEI" maxLength={20} value={(data.lei_code as string) || ''} onChange={(e) => onChange('lei_code', e.target.value)} />
      </Field>
    </div>
  );
}

export function TraderRiskLimitsStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <Field label="Daily VaR limit (ZAR)">
        <input className={INPUT_CLS} type="number" placeholder="e.g. 500000" value={(data.daily_var_limit_zar as string) || ''} onChange={(e) => onChange('daily_var_limit_zar', e.target.value)} />
      </Field>
      <Field label="Max open position (MWh)">
        <input className={INPUT_CLS} type="number" placeholder="e.g. 1000" value={(data.max_open_position_mwh as string) || ''} onChange={(e) => onChange('max_open_position_mwh', e.target.value)} />
      </Field>
      <Field label="Preferred delivery horizon">
        <select className={SELECT_CLS} value={(data.preferred_delivery_horizon as string) || ''} onChange={(e) => onChange('preferred_delivery_horizon', e.target.value)}>
          <option value="">Select…</option>
          <option value="day_ahead">Day-ahead</option>
          <option value="week_ahead">Week-ahead</option>
          <option value="month_ahead">Month-ahead</option>
        </select>
      </Field>
    </div>
  );
}

// ─── lender ──────────────────────────────────────────────────────────────────

export function LenderFundSetupStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <Field label="Fund name">
        <input className={INPUT_CLS} type="text" placeholder="e.g. Meridian Clean Energy Fund II" value={(data.fund_name as string) || ''} onChange={(e) => onChange('fund_name', e.target.value)} />
      </Field>
      <div className={GRID2}>
        <Field label="AUM (ZAR millions)">
          <input className={INPUT_CLS} type="number" placeholder="e.g. 2500" value={(data.aum_zar_m as string) || ''} onChange={(e) => onChange('aum_zar_m', e.target.value)} />
        </Field>
        <Field label="Target IRR %">
          <input className={INPUT_CLS} type="number" placeholder="e.g. 14" value={(data.target_irr_pct as string) || ''} onChange={(e) => onChange('target_irr_pct', e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Fund strategy">
            <select className={SELECT_CLS} value={(data.fund_strategy as string) || ''} onChange={(e) => onChange('fund_strategy', e.target.value)}>
              <option value="">Select…</option>
              <option value="senior_debt">Senior Debt</option>
              <option value="mezzanine">Mezzanine</option>
              <option value="equity">Equity</option>
              <option value="blended">Blended Finance</option>
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

export function LenderCoverageStep({ data, onChange }: StepProps) {
  const techs = getArr(data, 'preferred_technologies');
  const techOpts = [
    { key: 'solar_pv', label: 'Solar PV' },
    { key: 'wind', label: 'Wind' },
    { key: 'bess', label: 'BESS' },
    { key: 'hydro', label: 'Hydro' },
  ];
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <Field label="Min project size (MW)">
          <input className={INPUT_CLS} type="number" placeholder="10" value={(data.min_project_mw as string) || ''} onChange={(e) => onChange('min_project_mw', e.target.value)} />
        </Field>
        <Field label="Max project size (MW)">
          <input className={INPUT_CLS} type="number" placeholder="500" value={(data.max_project_mw as string) || ''} onChange={(e) => onChange('max_project_mw', e.target.value)} />
        </Field>
      </div>
      <div>
        <p className={LABEL_CLS}>Preferred technologies</p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {techOpts.map((o) => (
            <CheckRow key={o.key} id={`tech_${o.key}`} label={o.label} checked={techs.includes(o.key)} onChange={() => toggleArr(data, 'preferred_technologies', o.key, onChange)} />
          ))}
        </div>
      </div>
      <div>
        <p className={LABEL_CLS}>Preferred provinces</p>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {PROVINCES.map((p) => (
            <CheckRow key={p} id={`prov_${p}`} label={PROVINCE_LABELS[p]} checked={getArr(data, 'preferred_provinces').includes(p)} onChange={() => toggleArr(data, 'preferred_provinces', p, onChange)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── offtaker ────────────────────────────────────────────────────────────────

export function OfftakerEntityStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <div className="col-span-2">
          <Field label="Entity type">
            <select className={SELECT_CLS} value={(data.entity_type as string) || ''} onChange={(e) => onChange('entity_type', e.target.value)}>
              <option value="">Select…</option>
              <option value="municipality">Municipality</option>
              <option value="c_and_i">Commercial &amp; Industrial</option>
              <option value="soe">State-Owned Enterprise</option>
              <option value="mining">Mining</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Annual consumption (MWh)">
          <input className={INPUT_CLS} type="number" placeholder="e.g. 50000" value={(data.annual_consumption_mwh as string) || ''} onChange={(e) => onChange('annual_consumption_mwh', e.target.value)} />
        </Field>
        <Field label="Peak demand (MW)">
          <input className={INPUT_CLS} type="number" placeholder="e.g. 12" value={(data.peak_demand_mw as string) || ''} onChange={(e) => onChange('peak_demand_mw', e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Current tariff classification">
            <input className={INPUT_CLS} type="text" placeholder="e.g. Megaflex, Homeflex" value={(data.current_tariff_classification as string) || ''} onChange={(e) => onChange('current_tariff_classification', e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  );
}

export function OfftakerPpaPrefsStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <Field label="Preferred PPA tenor">
          <select className={SELECT_CLS} value={(data.preferred_tenor_years as string) || ''} onChange={(e) => onChange('preferred_tenor_years', e.target.value)}>
            <option value="">Select…</option>
            {[5, 10, 15, 20, 25].map((y) => <option key={y} value={y}>{y} years</option>)}
          </select>
        </Field>
        <Field label="Preferred technology">
          <select className={SELECT_CLS} value={(data.preferred_technology as string) || ''} onChange={(e) => onChange('preferred_technology', e.target.value)}>
            <option value="">Select…</option>
            <option value="solar_pv">Solar PV</option>
            <option value="wind">Wind</option>
            <option value="any">Any / Agnostic</option>
          </select>
        </Field>
      </div>
      <Field label={`Green sourcing target: ${data.green_commitment_pct ?? 0}% of consumption`}>
        <input
          type="range" min="0" max="100" step="5"
          className="w-full accent-[oklch(0.46_0.16_55)]"
          value={(data.green_commitment_pct as number) ?? 0}
          onChange={(e) => onChange('green_commitment_pct', Number(e.target.value))}
        />
        <div className="flex justify-between text-[11px] text-[#6b7891] mt-1"><span>0%</span><span>100%</span></div>
      </Field>
      <Field label={`Required availability: ${data.required_availability_pct ?? 95}%`}>
        <input
          type="range" min="80" max="100" step="1"
          className="w-full accent-[oklch(0.46_0.16_55)]"
          value={(data.required_availability_pct as number) ?? 95}
          onChange={(e) => onChange('required_availability_pct', Number(e.target.value))}
        />
        <div className="flex justify-between text-[11px] text-[#6b7891] mt-1"><span>80%</span><span>100%</span></div>
      </Field>
    </div>
  );
}

// ─── carbon_fund ─────────────────────────────────────────────────────────────

export function CarbonRegistryStep({ data, onChange }: StepProps) {
  const REGS = [
    { key: 'vcs_verified', label: 'Verra VCS' },
    { key: 'gold_standard', label: 'Gold Standard' },
    { key: 'article_6_4', label: 'Article 6.4 (UN)' },
    { key: 'cdm_poa', label: 'CDM PoA' },
    { key: 'pure_earth', label: 'Pure Earth' },
    { key: 'i_rec', label: 'I-REC' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <p className={LABEL_CLS}>Registry memberships</p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {REGS.map((r) => (
            <CheckRow key={r.key} id={`reg_${r.key}`} label={r.label} checked={Boolean(data[r.key])} onChange={(v) => onChange(r.key, v)} />
          ))}
        </div>
      </div>
      {data.vcs_verified && (
        <Field label="Verra VCS account number">
          <input className={INPUT_CLS} type="text" placeholder="VCS account #" value={(data.vcs_account_no as string) || ''} onChange={(e) => onChange('vcs_account_no', e.target.value)} />
        </Field>
      )}
      {data.gold_standard && (
        <Field label="Gold Standard account number">
          <input className={INPUT_CLS} type="text" placeholder="GS account #" value={(data.gs_account_no as string) || ''} onChange={(e) => onChange('gs_account_no', e.target.value)} />
        </Field>
      )}
    </div>
  );
}

export function CarbonMethodologyStep({ data, onChange }: StepProps) {
  const techs = getArr(data, 'methodology_technologies');
  const TECH_OPTS = [
    { key: 'solar_pv', label: 'Solar PV' },
    { key: 'wind', label: 'Wind' },
    { key: 'bess', label: 'BESS' },
    { key: 'biogas', label: 'Biogas' },
    { key: 'cookstoves', label: 'Cookstoves' },
    { key: 'forestry_redd', label: 'Forestry / REDD+' },
  ];
  const currentYear = 2025;
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  return (
    <div className="space-y-4">
      <div>
        <p className={LABEL_CLS}>Technology focus</p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {TECH_OPTS.map((o) => (
            <CheckRow key={o.key} id={`mtech_${o.key}`} label={o.label} checked={techs.includes(o.key)} onChange={() => toggleArr(data, 'methodology_technologies', o.key, onChange)} />
          ))}
        </div>
      </div>
      <div className={GRID2}>
        <Field label="Preferred vintage from">
          <select className={SELECT_CLS} value={(data.vintage_from_year as string) || ''} onChange={(e) => onChange('vintage_from_year', e.target.value)}>
            <option value="">Any</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Preferred vintage to">
          <select className={SELECT_CLS} value={(data.vintage_to_year as string) || ''} onChange={(e) => onChange('vintage_to_year', e.target.value)}>
            <option value="">Any</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

// ─── grid_operator ────────────────────────────────────────────────────────────

export function GridAuthorityStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <Field label="Authority type">
          <select className={SELECT_CLS} value={(data.authority_type as string) || ''} onChange={(e) => onChange('authority_type', e.target.value)}>
            <option value="">Select…</option>
            <option value="ntcsa">NTCSA (National)</option>
            <option value="mts">Municipal Transmission System</option>
            <option value="redt">Regional Electricity Distributor</option>
            <option value="municipal">Municipal Distributor</option>
          </select>
        </Field>
        <Field label="Grid zone">
          <input className={INPUT_CLS} type="text" placeholder="e.g. Cape Peninsula" value={(data.grid_zone as string) || ''} onChange={(e) => onChange('grid_zone', e.target.value)} />
        </Field>
        <Field label="Managed capacity (MW)">
          <input className={INPUT_CLS} type="number" placeholder="e.g. 5000" value={(data.installed_capacity_managed_mw as string) || ''} onChange={(e) => onChange('installed_capacity_managed_mw', e.target.value)} />
        </Field>
        <div className="flex items-end pb-1">
          <CheckRow id="eskom_interface" label="Interface with Eskom Transmission" checked={Boolean(data.eskom_interface)} onChange={(v) => onChange('eskom_interface', v)} />
        </div>
      </div>
    </div>
  );
}

export function GridServicesStep({ data, onChange }: StepProps) {
  const services = getArr(data, 'ancillary_services');
  const SERVICE_OPTS = [
    { key: 'frequency_response', label: 'Frequency Response' },
    { key: 'spinning_reserve', label: 'Spinning Reserve' },
    { key: 'non_spinning_reserve', label: 'Non-Spinning Reserve' },
    { key: 'voltage_support', label: 'Voltage Support' },
    { key: 'black_start', label: 'Black Start' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <p className={LABEL_CLS}>Ancillary services managed</p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {SERVICE_OPTS.map((o) => (
            <CheckRow key={o.key} id={`svc_${o.key}`} label={o.label} checked={services.includes(o.key)} onChange={() => toggleArr(data, 'ancillary_services', o.key, onChange)} />
          ))}
        </div>
      </div>
      <Field label="Reserve procurement capacity (MW)">
        <input className={INPUT_CLS} type="number" placeholder="e.g. 200" value={(data.reserve_procurement_mw as string) || ''} onChange={(e) => onChange('reserve_procurement_mw', e.target.value)} />
      </Field>
    </div>
  );
}

// ─── regulator ───────────────────────────────────────────────────────────────

export function RegulatorBodyStep({ data, onChange }: StepProps) {
  const jur = getArr(data, 'jurisdiction_provinces');
  const classes = getArr(data, 'licence_classes_handled');
  const CLASS_OPTS = [
    { key: 'generation', label: 'Generation' },
    { key: 'transmission', label: 'Transmission' },
    { key: 'distribution', label: 'Distribution' },
    { key: 'trading', label: 'Trading' },
    { key: 'gas', label: 'Gas' },
  ];
  return (
    <div className="space-y-4">
      <Field label="Regulatory body">
        <select className={SELECT_CLS} value={(data.regulatory_body as string) || ''} onChange={(e) => onChange('regulatory_body', e.target.value)}>
          <option value="">Select…</option>
          <option value="nersa">NERSA</option>
          <option value="fsca">FSCA</option>
          <option value="dmre">DMRE</option>
          <option value="del">DEL (Department of Electricity)</option>
          <option value="dti">DTI</option>
        </select>
      </Field>
      <div>
        <p className={LABEL_CLS}>Jurisdiction (provinces)</p>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {PROVINCES.map((p) => (
            <CheckRow key={p} id={`jur_${p}`} label={PROVINCE_LABELS[p]} checked={jur.includes(p)} onChange={() => toggleArr(data, 'jurisdiction_provinces', p, onChange)} />
          ))}
        </div>
      </div>
      <div>
        <p className={LABEL_CLS}>Licence classes handled</p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {CLASS_OPTS.map((o) => (
            <CheckRow key={o.key} id={`cls_${o.key}`} label={o.label} checked={classes.includes(o.key)} onChange={() => toggleArr(data, 'licence_classes_handled', o.key, onChange)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function RegulatorJurisdictionStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <Field label="Average case volume per month">
        <input className={INPUT_CLS} type="number" placeholder="e.g. 30" value={(data.avg_case_volume_per_month as string) || ''} onChange={(e) => onChange('avg_case_volume_per_month', e.target.value)} />
      </Field>
      <Field label="Escalation email">
        <input className={INPUT_CLS} type="email" placeholder="escalations@nersa.org.za" value={(data.escalation_email as string) || ''} onChange={(e) => onChange('escalation_email', e.target.value)} />
      </Field>
      <div className="flex items-center gap-2">
        <CheckRow id="auto_assign" label="Auto-assign inspections" checked={data.auto_assign_inspections !== false} onChange={(v) => onChange('auto_assign_inspections', v)} />
      </div>
    </div>
  );
}

// ─── support ─────────────────────────────────────────────────────────────────

export function SupportOrgStep({ data, onChange }: StepProps) {
  const brands = getArr(data, 'oem_brands');
  const coverage = getArr(data, 'coverage_provinces');
  const BRAND_OPTS = [
    { key: 'sungrow', label: 'Sungrow' },
    { key: 'huawei', label: 'Huawei' },
    { key: 'sma', label: 'SMA' },
    { key: 'fronius', label: 'Fronius' },
    { key: 'abb', label: 'ABB' },
    { key: 'other', label: 'Other' },
  ];
  return (
    <div className="space-y-4">
      <Field label="Organisation name">
        <input className={INPUT_CLS} type="text" placeholder="e.g. SolarServ (Pty) Ltd" value={(data.org_name as string) || ''} onChange={(e) => onChange('org_name', e.target.value)} />
      </Field>
      <div>
        <p className={LABEL_CLS}>OEM brands supported</p>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {BRAND_OPTS.map((o) => (
            <CheckRow key={o.key} id={`brand_${o.key}`} label={o.label} checked={brands.includes(o.key)} onChange={() => toggleArr(data, 'oem_brands', o.key, onChange)} />
          ))}
        </div>
      </div>
      <div>
        <p className={LABEL_CLS}>Coverage provinces</p>
        <div className="grid grid-cols-3 gap-2 mt-1">
          {PROVINCES.map((p) => (
            <CheckRow key={p} id={`cov_${p}`} label={PROVINCE_LABELS[p]} checked={coverage.includes(p)} onChange={() => toggleArr(data, 'coverage_provinces', p, onChange)} />
          ))}
        </div>
      </div>
      <Field label="Target first response (hours)">
        <input className={INPUT_CLS} type="number" placeholder="e.g. 4" value={(data.response_time_commitment_h as string) || ''} onChange={(e) => onChange('response_time_commitment_h', e.target.value)} />
      </Field>
    </div>
  );
}

export function SupportSlaStep({ data, onChange }: StepProps) {
  return (
    <div className="space-y-4">
      <div className={GRID2}>
        <Field label="P1 resolution (hours)">
          <input className={INPUT_CLS} type="number" placeholder="4" value={(data.p1_resolution_h as string) || ''} onChange={(e) => onChange('p1_resolution_h', e.target.value)} />
        </Field>
        <Field label="P2 resolution (hours)">
          <input className={INPUT_CLS} type="number" placeholder="24" value={(data.p2_resolution_h as string) || ''} onChange={(e) => onChange('p2_resolution_h', e.target.value)} />
        </Field>
        <Field label="P3 resolution (hours)">
          <input className={INPUT_CLS} type="number" placeholder="72" value={(data.p3_resolution_h as string) || ''} onChange={(e) => onChange('p3_resolution_h', e.target.value)} />
        </Field>
      </div>
      <Field label="Escalation contact">
        <input className={INPUT_CLS} type="text" placeholder="Name or email" value={(data.escalation_contact as string) || ''} onChange={(e) => onChange('escalation_contact', e.target.value)} />
      </Field>
    </div>
  );
}
