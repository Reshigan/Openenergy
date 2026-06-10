'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tech = 'solar' | 'wind' | 'hydro' | 'waste';

interface Credential {
  id: string;
  manufacturer: string;
  auth_type: string;
  base_url: string | null;
  site_id: string | null;
  tariff_rate_zar_per_kwh: number | null;
  customer_tariff_rate_zar_per_kwh: number | null;
  carbon_intensity_gco2_per_kwh: number | null;
  status: 'active' | 'inactive' | 'error';
  has_secret: boolean;
  has_password: boolean;
  has_token: boolean;
  last_tested_at: string | null;
  last_error: string | null;
  updated_at: string;
}

interface Station {
  id: string;
  manufacturer: string;
  device_sn: string;
  plant_id: string;
  plant_name: string | null;
  site_id: string | null;
  site_name: string | null;
  rated_power_kw: number | null;
  online_status: number;
  last_sync_at: string | null;
  status: string;
  // snapshot
  ac_kw: number | null;
  dc_kw: number | null;
  daily_kwh: number | null;
  total_kwh: number | null;
  battery_soc: number | null;
  temperature_c: number | null;
  snapshot_online: number | null;
  snapshot_ts: string | null;
  tariff_rate_zar_per_kwh: number | null;
}

interface CredListResponse { data: Credential[]; supported: string[]; tech_map: Record<string, string> }
interface StationListResponse { data: Station[] }

// ─── Constants ────────────────────────────────────────────────────────────────

const MFR_TECH: Record<string, Tech> = {
  solax: 'solar', solaredge: 'solar', huawei: 'solar', fronius: 'solar',
  sungrow: 'solar', victron: 'solar', growatt: 'solar', sma: 'solar',
  vestas: 'wind', siemens_gamesa: 'wind', goldwind: 'wind', envision: 'wind',
  andritz: 'hydro', voith: 'hydro', hydro_scada: 'hydro',
  babcock: 'waste', covanta: 'waste', waste_scada: 'waste',
};

const ADAPTER_LIVE: Record<string, boolean> = {
  solax: true, solaredge: true, huawei: true, fronius: true,
  sungrow: true, victron: true,
};

const MFR_LABEL: Record<string, string> = {
  solax: 'SolaX', solaredge: 'SolarEdge', huawei: 'Huawei FusionSolar',
  fronius: 'Fronius Solarweb', sungrow: 'Sungrow iSolarCloud',
  victron: 'Victron VRM', growatt: 'Growatt', sma: 'SMA Sunny Portal',
  vestas: 'Vestas (SCADA)', siemens_gamesa: 'Siemens Gamesa', goldwind: 'Goldwind', envision: 'Envision',
  andritz: 'Andritz', voith: 'Voith', hydro_scada: 'Hydro SCADA (generic)',
  babcock: 'Babcock', covanta: 'Covanta', waste_scada: 'Waste/Biomass SCADA (generic)',
};

const TECH_GROUPS: { tech: Tech; label: string; colour: string; bg: string; border: string }[] = [
  { tech: 'solar', label: 'Solar',         colour: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  { tech: 'wind',  label: 'Wind',          colour: 'text-sky-700',    bg: 'bg-sky-50',    border: 'border-sky-200' },
  { tech: 'hydro', label: 'Hydro / Water', colour: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  { tech: 'waste', label: 'Waste / Biomass', colour: 'text-green-700', bg: 'bg-green-50',  border: 'border-green-200' },
];

const AUTH_TYPE_OPTIONS = [
  { value: 'oauth2_client_creds', label: 'OAuth2 client credentials' },
  { value: 'api_key',             label: 'API key' },
  { value: 'basic',               label: 'Username / password' },
  { value: 'token',               label: 'Bearer token' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(ts: string | null): string {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

function kw(v: number | null, decimals = 1): string {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toFixed(decimals)} kW`;
}

function kwh(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toFixed(1)} kWh`;
}

function zarFromKwh(kwhVal: number | null, rate: number | null): string {
  if (kwhVal === null || kwhVal === undefined || rate === null || rate === undefined) return '—';
  const zar = kwhVal * rate;
  return `R ${zar >= 1000 ? zar.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : zar.toFixed(2)}`;
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function Pill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'bg-emerald-100 text-emerald-800',
    inactive: 'bg-[#eef2f7] text-[#3d4756]',
    error:    'bg-red-100 text-red-700',
    online:   'bg-emerald-100 text-emerald-800',
    offline:  'bg-[#eef2f7] text-[#6b7685]',
    pending:  'bg-amber-100 text-amber-700',
    stub:     'bg-violet-100 text-violet-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-[#eef2f7] text-[#3d4756]'}`}>
      {status}
    </span>
  );
}

// ─── Credential card ──────────────────────────────────────────────────────────

function CredCard({
  cred,
  stationCount,
  onTest,
  onEdit,
  onDelete,
  testing,
}: {
  cred: Credential;
  stationCount: number;
  onTest: (id: string) => void;
  onEdit: (cred: Credential) => void;
  onDelete: (id: string) => void;
  testing: boolean;
}) {
  const isLive = ADAPTER_LIVE[cred.manufacturer] ?? false;

  return (
    <div className="border border-[#dde4ec] rounded-lg p-4 bg-white hover:border-[#dde4ec] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-[#0f1c2e] truncate">
              {MFR_LABEL[cred.manufacturer] ?? cred.manufacturer}
            </span>
            <Pill status={cred.status} />
            {!isLive && <Pill status="stub" />}
          </div>
          <div className="text-xs text-[#6b7685] mt-0.5">{cred.auth_type}</div>
          {cred.base_url && (
            <div className="text-xs text-[#9aa5b4] truncate mt-0.5">{cred.base_url}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button type="button"
            onClick={() => onTest(cred.id)}
            disabled={testing || !isLive}
            title={isLive ? 'Test connection' : 'Adapter not yet implemented'}
            className="px-2.5 py-1 text-xs rounded border border-[#dde4ec] text-[#3d4756] hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? '…' : 'Test'}
          </button>
          <button type="button"
            onClick={() => onEdit(cred)}
            className="px-2.5 py-1 text-xs rounded border border-[#dde4ec] text-[#3d4756] hover:border-gray-400 transition-colors"
          >
            Edit
          </button>
          <button type="button"
            onClick={() => onDelete(cred.id)}
            className="px-2.5 py-1 text-xs rounded border border-red-100 text-red-500 hover:border-red-300 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[#6b7685]">
        <span>{stationCount} station{stationCount !== 1 ? 's' : ''}</span>
        {cred.last_tested_at && <span>Tested {fmtTs(cred.last_tested_at)}</span>}
        {!cred.last_tested_at && <span className="text-[#9aa5b4]">Never tested</span>}
      </div>

      {cred.last_error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2.5 py-1.5 break-all">
          {cred.last_error}
        </div>
      )}

      {!isLive && (
        <div className="mt-2 text-xs text-violet-600 bg-violet-50 border border-violet-100 rounded px-2.5 py-1.5">
          Credentials stored. Live polling activates automatically once the adapter connection is verified.
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

const MFR_BY_TECH: Record<Tech, string[]> = {
  solar: ['solax', 'solaredge', 'huawei', 'fronius', 'sungrow', 'victron', 'growatt', 'sma'],
  wind:  ['vestas', 'siemens_gamesa', 'goldwind', 'envision'],
  hydro: ['andritz', 'voith', 'hydro_scada'],
  waste: ['babcock', 'covanta', 'waste_scada'],
};

function CredModal({
  initial,
  supported,
  prefillManufacturer,
  onSave,
  onClose,
}: {
  initial?: Credential;
  supported: string[];
  prefillManufacturer?: string;
  onSave: (data: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
    manufacturer:            initial?.manufacturer ?? prefillManufacturer ?? '',
    auth_type:               initial?.auth_type ?? 'oauth2_client_creds',
    base_url:                initial?.base_url ?? '',
    site_id:                 initial?.site_id ?? '',
    tariff_rate_zar_per_kwh:          initial?.tariff_rate_zar_per_kwh != null ? String(initial.tariff_rate_zar_per_kwh) : '',
    customer_tariff_rate_zar_per_kwh: initial?.customer_tariff_rate_zar_per_kwh != null ? String(initial.customer_tariff_rate_zar_per_kwh) : '',
    carbon_intensity_gco2_per_kwh:    initial?.carbon_intensity_gco2_per_kwh != null ? String(initial.carbon_intensity_gco2_per_kwh) : '950',
    client_id:               '',
    client_secret:           '',
    api_key:                 '',
    token:                   '',
    username:                '',
    password:                '',
    adapter_notes:           '',
  });
  const [isCustom, setIsCustom] = useState(() => {
    const m = initial?.manufacturer ?? prefillManufacturer ?? '';
    return !supported.includes(m) && m !== '';
  });
  const [customName, setCustomName] = useState(() => {
    const m = initial?.manufacturer ?? prefillManufacturer ?? '';
    return !supported.includes(m) ? m : '';
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const mfr = isCustom
        ? customName.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/__+/g, '_').slice(0, 64)
        : form.manufacturer;
      if (!mfr) { setError('Manufacturer name is required'); setSaving(false); return; }
      const body: Record<string, string> = { ...form, manufacturer: mfr };
      // Strip empty values
      for (const k of Object.keys(body)) { if (body[k] === '') delete body[k]; }
      await onSave(body);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const authType = form.auth_type;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#eef2f7]">
          <h2 className="text-sm font-semibold text-[#0f1c2e]">
            {initial ? 'Edit integration' : 'Add integration'}
          </h2>
          <button type="button" onClick={onClose} className="text-[#9aa5b4] hover:text-[#2d3748] text-lg leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">

          {/* Manufacturer picker */}
          {!initial && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#2d3748]">Technology &amp; manufacturer</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustom(false)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${!isCustom ? 'bg-[#c2873a] text-white border-blue-600' : 'border-[#dde4ec] text-[#3d4756] hover:border-gray-400'}`}
                >
                  Known manufacturer
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustom(true)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${isCustom ? 'bg-[#1e2a38] text-white border-gray-800' : 'border-[#dde4ec] text-[#3d4756] hover:border-gray-400'}`}
                >
                  Other / custom
                </button>
              </div>

              {!isCustom ? (
                <select
                  value={form.manufacturer}
                  onChange={e => set('manufacturer', e.target.value)}
                  required={!isCustom}
                  className="w-full border border-[#dde4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c2873a]"
                >
                  <option value="">— select —</option>
                  {TECH_GROUPS.map(tg => (
                    <optgroup key={tg.tech} label={tg.label}>
                      {(MFR_BY_TECH[tg.tech] || []).filter(m => supported.includes(m)).map(m => (
                        <option key={m} value={m}>{MFR_LABEL[m] ?? m}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="Manufacturer name (e.g. deye, saj, solplanet)"
                    required={isCustom}
                    className="w-full border border-[#dde4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c2873a]"
                  />
                  <p className="text-xs text-[#9aa5b4]">
                    Credentials will be stored. A live polling adapter must be built before data flows —
                    contact your platform administrator or open a feature request with the manufacturer's
                    API documentation.
                  </p>
                  <textarea
                    value={form.adapter_notes}
                    onChange={e => set('adapter_notes', e.target.value)}
                    placeholder="API docs URL, auth method, endpoint pattern, any notes for the adapter builder…"
                    rows={3}
                    className="w-full border border-[#dde4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c2873a] resize-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Auth type */}
          <div>
            <label className="block text-xs font-medium text-[#2d3748] mb-1">Auth type</label>
            <select
              value={form.auth_type}
              onChange={e => set('auth_type', e.target.value)}
              className="w-full border border-[#dde4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c2873a]"
            >
              {AUTH_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Auth fields */}
          {(authType === 'oauth2_client_creds') && (
            <>
              <Field label="Client ID" name="client_id" value={form.client_id} onChange={v => set('client_id', v)} />
              <Field label="Client secret" name="client_secret" value={form.client_secret} onChange={v => set('client_secret', v)} type="password" placeholder={initial?.has_secret ? '(unchanged — leave blank to keep)' : ''} />
            </>
          )}
          {(authType === 'api_key') && (
            <Field label="API key" name="api_key" value={form.api_key} onChange={v => set('api_key', v)} type="password" placeholder={initial?.has_token ? '(unchanged — leave blank to keep)' : ''} />
          )}
          {(authType === 'basic') && (
            <>
              <Field label="Username" name="username" value={form.username} onChange={v => set('username', v)} />
              <Field label="Password" name="password" value={form.password} onChange={v => set('password', v)} type="password" placeholder={initial?.has_password ? '(unchanged — leave blank to keep)' : ''} />
            </>
          )}
          {(authType === 'token') && (
            <Field label="Bearer token" name="token" value={form.token} onChange={v => set('token', v)} type="password" placeholder={initial?.has_token ? '(unchanged — leave blank to keep)' : ''} />
          )}

          <Field label="API base URL (https:// — leave blank to use manufacturer default)" name="base_url" value={form.base_url} onChange={v => set('base_url', v)} placeholder="https://…" />
          <Field label="Site / Plant ID (required by some manufacturers)" name="site_id" value={form.site_id} onChange={v => set('site_id', v)} />

          <div>
            <label className="block text-xs font-medium text-[#2d3748] mb-1">
              Fund tariff (ZAR / kWh)
              <span className="ml-1 text-[#9aa5b4] font-normal">— rate at which the fund sells energy (revenue accrual)</span>
            </label>
            <input
              type="number"
              name="tariff_rate_zar_per_kwh"
              value={form.tariff_rate_zar_per_kwh}
              onChange={e => set('tariff_rate_zar_per_kwh', e.target.value)}
              placeholder="e.g. 1.28"
              min="0"
              step="0.01"
              autoComplete="off"
              className="w-full border border-[#dde4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c2873a]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#2d3748] mb-1">
                Customer grid rate (ZAR / kWh)
                <span className="ml-1 text-[#9aa5b4] font-normal">— what customer pays Eskom (savings accrual)</span>
              </label>
              <input
                type="number"
                name="customer_tariff_rate_zar_per_kwh"
                value={form.customer_tariff_rate_zar_per_kwh}
                onChange={e => set('customer_tariff_rate_zar_per_kwh', e.target.value)}
                placeholder="e.g. 2.50"
                min="0"
                step="0.01"
                autoComplete="off"
                className="w-full border border-[#dde4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c2873a]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#2d3748] mb-1">
                Grid carbon intensity (gCO₂e / kWh)
                <span className="ml-1 text-[#9aa5b4] font-normal">— SA Eskom default 950</span>
              </label>
              <input
                type="number"
                name="carbon_intensity_gco2_per_kwh"
                value={form.carbon_intensity_gco2_per_kwh}
                onChange={e => set('carbon_intensity_gco2_per_kwh', e.target.value)}
                placeholder="950"
                min="0"
                step="1"
                autoComplete="off"
                className="w-full border border-[#dde4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c2873a]"
              />
            </div>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}
        </form>

        <div className="px-6 py-3 border-t border-[#eef2f7] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-1.5 text-sm text-[#3d4756] hover:text-[#0f1c2e]">Cancel</button>
          <button type="button"
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-[#c2873a] text-white rounded-lg hover:bg-[#a3702f] disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : (initial ? 'Update' : 'Add integration')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', placeholder }: {
  label: string; name: string; value: string;
  onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#2d3748] mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-[#dde4ec] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c2873a]"
      />
    </div>
  );
}

// ─── Station row ──────────────────────────────────────────────────────────────

function StationRow({ s }: { s: Station }) {
  const online = s.snapshot_online === 1 || s.online_status === 1;
  const rate = s.tariff_rate_zar_per_kwh;
  return (
    <tr className="border-t border-[#eef2f7] hover:bg-[#eef2f7]/50">
      <td className="px-3 py-2 text-xs font-mono text-[#2d3748]">{s.device_sn}</td>
      <td className="px-3 py-2 text-xs text-[#3d4756]">{MFR_LABEL[s.manufacturer] ?? s.manufacturer}</td>
      <td className="px-3 py-2 text-xs text-[#3d4756]">{s.plant_name ?? s.plant_id}</td>
      <td className="px-3 py-2 text-xs text-[#3d4756]">{s.site_name ?? <span className="text-[#9aa5b4]">unlinked</span>}</td>
      <td className="px-3 py-2 text-xs text-right tabular-nums font-medium text-[#0f1c2e]">
        {s.ac_kw !== null ? kw(s.ac_kw) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-right tabular-nums text-[#3d4756]">
        {s.daily_kwh !== null ? kwh(s.daily_kwh) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-right tabular-nums text-emerald-700 font-medium">
        {zarFromKwh(s.daily_kwh, rate)}
      </td>
      <td className="px-3 py-2 text-xs text-right tabular-nums text-emerald-600">
        {zarFromKwh(s.total_kwh, rate)}
      </td>
      <td className="px-3 py-2 text-xs text-right tabular-nums text-[#6b7685]">
        {s.temperature_c !== null ? `${Number(s.temperature_c).toFixed(0)} °C` : '—'}
      </td>
      <td className="px-3 py-2">
        <Pill status={online ? 'online' : 'offline'} />
      </td>
      <td className="px-3 py-2 text-xs text-[#9aa5b4] whitespace-nowrap">
        {fmtTs(s.snapshot_ts ?? s.last_sync_at)}
      </td>
    </tr>
  );
}

// ─── Accruals panel ───────────────────────────────────────────────────────────

type AccrualPeriod = 'today' | 'week' | 'month' | 'ytd' | '1y' | 'all';

interface AccrualTotals { kwh: number; carbon_tco2e: number; revenue_zar: number; savings_zar: number }
interface AccrualStation {
  station_id: string; plant_name: string | null; device_sn: string;
  total_kwh: number; total_carbon_tco2e: number; total_revenue_zar: number; total_savings_zar: number;
  last_accrual_at: string | null;
}
interface SeriesPoint { bucket: string; kwh: number; revenue_zar: number; savings_zar: number; carbon_tco2e: number }

function fmtTco2e(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)} ktCO₂e`;
  if (v >= 1) return `${v.toFixed(2)} tCO₂e`;
  return `${(v * 1000).toFixed(0)} kgCO₂e`;
}
function fmtZar(v: number): string {
  if (v >= 1_000_000) return `R ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1000) return `R ${(v / 1000).toFixed(1)}k`;
  return `R ${v.toFixed(2)}`;
}

function AccrualsPanel() {
  const [period, setPeriod] = useState<AccrualPeriod>('month');
  const [totals, setTotals] = useState<AccrualTotals | null>(null);
  const [stations, setAccStations] = useState<AccrualStation[]>([]);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const loadAccruals = useCallback(async () => {
    setLoading(true);
    try {
      const [agg, ts] = await Promise.all([
        api.get<{ totals: AccrualTotals; stations: AccrualStation[] }>(`/api/esums/accruals?period=${period}`),
        api.get<{ series: SeriesPoint[] }>(`/api/esums/accruals/time-series?period=${period}&granularity=daily`),
      ]);
      setTotals(agg.data.totals);
      setAccStations(agg.data.stations ?? []);
      setSeries(ts.data.series ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { loadAccruals(); }, [loadAccruals]);

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      const { data: r } = await api.post<{
        stations_processed: number;
        results: Array<{ station_id: string; days_backfilled?: number; kwh_total?: number; error?: string }>;
      }>('/api/esums/accruals/backfill', {});
      const ok = r.results.filter(x => !x.error);
      const totalDays = ok.reduce((s, x) => s + (x.days_backfilled ?? 0), 0);
      const totalKwh = ok.reduce((s, x) => s + (x.kwh_total ?? 0), 0);
      setBackfillMsg(`Imported ${totalDays} days of history (${totalKwh.toFixed(0)} kWh) across ${ok.length} station(s).`);
      await loadAccruals();
    } catch (e) {
      setBackfillMsg(`Backfill failed: ${String(e)}`);
    } finally {
      setBackfilling(false);
    }
  };

  const PERIOD_LABELS: Record<AccrualPeriod, string> = {
    today: 'Today', week: '7 days', month: 'This month', ytd: 'Year to date',
    '1y': 'Last 12 months', all: 'All time',
  };

  const kpiCards = [
    {
      label: 'Carbon avoided', sublabel: 'Fund — UNFCCC tCO₂e',
      value: totals ? fmtTco2e(totals.carbon_tco2e) : '—',
      colour: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200',
    },
    {
      label: 'Revenue accrued', sublabel: 'Fund — ZAR from energy sales',
      value: totals ? fmtZar(totals.revenue_zar) : '—',
      colour: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',
    },
    {
      label: 'Customer savings', sublabel: 'Customer — vs Eskom grid rate',
      value: totals ? fmtZar(totals.savings_zar) : '—',
      colour: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200',
    },
    {
      label: 'Generation', sublabel: 'Fleet total',
      value: totals ? `${totals.kwh >= 1000 ? (totals.kwh / 1000).toFixed(1) + ' MWh' : totals.kwh.toFixed(0) + ' kWh'}` : '—',
      colour: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200',
    },
  ];

  const chartData = series.map(p => ({
    day: p.bucket.slice(5), // MM-DD
    'Revenue (ZAR)': parseFloat(p.revenue_zar.toFixed(2)),
    'Savings (ZAR)': parseFloat(p.savings_zar.toFixed(2)),
    'kWh': parseFloat(p.kwh.toFixed(1)),
  }));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold text-[#0f1c2e] uppercase tracking-wide">Value accruals</h4>
          <p className="text-xs text-[#6b7685] mt-0.5">Carbon · revenue · customer savings from generation</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-lg border border-[#dde4ec] overflow-hidden text-xs">
            {(Object.keys(PERIOD_LABELS) as AccrualPeriod[]).map(p => (
              <button type="button"
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 transition-colors ${period === p ? 'bg-[#c2873a] text-white' : 'text-[#3d4756] hover:bg-[#eef2f7]'}`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {/* One-time historical backfill */}
          <button type="button"
            onClick={handleBackfill}
            disabled={backfilling}
            title="Pull full historical data from SolaX API for all connected stations"
            className="px-3 py-1.5 text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            {backfilling ? 'Importing…' : 'Import historical data'}
          </button>
        </div>
      </div>

      {backfillMsg && (
        <div className={`text-xs px-3 py-2 rounded border ${backfillMsg.includes('failed') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {backfillMsg}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map(card => (
          <div key={card.label} className={`p-3 rounded-lg border ${card.border} ${card.bg}`}>
            <p className="text-xs text-[#6b7685]">{card.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${card.colour}`}>
              {loading ? <span className="animate-pulse text-sm">…</span> : card.value}
            </p>
            <p className="text-xs text-[#9aa5b4] mt-0.5">{card.sublabel}</p>
          </div>
        ))}
      </div>

      {/* Daily chart */}
      {chartData.length > 0 && (
        <div className="border border-[#dde4ec] rounded-lg p-4 bg-white">
          <p className="text-xs font-medium text-[#3d4756] mb-3">Daily revenue vs customer savings (ZAR)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barSize={8} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v: number, name: string) => [`R ${v.toFixed(2)}`, name]}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
              <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="Revenue (ZAR)" fill="#059669" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Savings (ZAR)" fill="#3b82f6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-station breakdown */}
      {stations.length > 0 && (
        <div className="overflow-x-auto border border-[#dde4ec] rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#eef2f7]">
                {['Station', 'Serial', 'kWh', 'Carbon (tCO₂e)', 'Revenue (ZAR)', 'Customer savings', 'Last accrual'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[#6b7685] font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stations.map(st => (
                <tr key={st.station_id} className="hover:bg-[#eef2f7]">
                  <td className="px-3 py-2 text-[#2d3748]">{st.plant_name ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-[#6b7685]">{st.device_sn}</td>
                  <td className="px-3 py-2 tabular-nums text-[#2d3748]">{st.total_kwh?.toFixed(1) ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-green-700 font-medium">{fmtTco2e(st.total_carbon_tco2e ?? 0)}</td>
                  <td className="px-3 py-2 tabular-nums text-emerald-700 font-medium">{fmtZar(st.total_revenue_zar ?? 0)}</td>
                  <td className="px-3 py-2 tabular-nums text-blue-700">{fmtZar(st.total_savings_zar ?? 0)}</td>
                  <td className="px-3 py-2 text-[#9aa5b4]">{st.last_accrual_at ? fmtTs(st.last_accrual_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && stations.length === 0 && (
        <div className="border border-dashed border-[#dde4ec] rounded-lg py-8 text-center">
          <p className="text-sm text-[#9aa5b4]">No accruals yet.</p>
          <p className="text-xs text-[#9aa5b4] mt-1">
            Click <strong>Import historical data</strong> to backfill from SolaX, or wait for the hourly cron.
          </p>
        </div>
      )}
    </section>
  );
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export function InverterIntegrationsTab() {
  const [creds, setCreds] = useState<Credential[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [supported, setSupported] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editCred, setEditCred] = useState<Credential | null>(null);
  const [prefillMfr, setPrefillMfr] = useState<string | undefined>();
  const [mfrFilter, setMfrFilter] = useState<string>('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [credRes, stationRes] = await Promise.all([
        api.get('/esums/manufacturers/credentials') as Promise<CredListResponse>,
        api.get('/esums/manufacturers/stations') as Promise<StationListResponse>,
      ]);
      setCreds(credRes.data ?? []);
      setSupported(credRes.supported ?? []);
      setStations(stationRes.data ?? []);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleTest = async (id: string) => {
    setTesting(t => ({ ...t, [id]: true }));
    try {
      const res = await api.post(`/esums/manufacturers/credentials/${id}/test`, {}) as { ok: boolean; error?: string };
      await loadAll();
      if (!res.ok) setPollResult(`Test failed: ${res.error}`);
      else setPollResult('Connection test passed');
    } catch (e: unknown) {
      setPollResult(`Test error: ${(e as Error).message}`);
    } finally {
      setTesting(t => ({ ...t, [id]: false }));
    }
  };

  const handlePollAll = async () => {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await api.post('/esums/manufacturers/poll-all', {}) as { ok: boolean; summary: Array<{ manufacturer: string; polled: number; errors: number }> };
      const lines = (res.summary ?? []).map(s => `${MFR_LABEL[s.manufacturer] ?? s.manufacturer}: ${s.polled} polled${s.errors ? `, ${s.errors} errors` : ''}`);
      setPollResult(lines.length ? lines.join(' · ') : 'No active integrations to poll');
      await loadAll();
    } catch (e: unknown) {
      setPollResult(`Poll failed: ${(e as Error).message}`);
    } finally {
      setPolling(false);
    }
  };

  const handleSave = async (data: Record<string, string>) => {
    if (editCred) {
      await api.put(`/esums/manufacturers/credentials/${editCred.id}`, data);
    } else {
      await api.post('/esums/manufacturers/credentials', data);
    }
    await loadAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this integration?')) return;
    await api.delete(`/esums/manufacturers/credentials/${id}`);
    await loadAll();
  };

  const credByMfr = Object.fromEntries(creds.map(c => [c.manufacturer, c]));
  const stationCountByMfr = stations.reduce<Record<string, number>>((acc, s) => {
    acc[s.manufacturer] = (acc[s.manufacturer] ?? 0) + 1;
    return acc;
  }, {});

  const filteredStations = mfrFilter ? stations.filter(s => s.manufacturer === mfrFilter) : stations;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-[#9aa5b4]">Loading integrations…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#0f1c2e]">Inverter &amp; device integrations</h3>
          <p className="text-xs text-[#6b7685] mt-0.5">
            Connect generation assets across solar, wind, hydro and waste-to-energy technologies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={handlePollAll}
            disabled={polling}
            className="px-3 py-1.5 text-xs font-medium bg-[#c2873a] text-white rounded-lg hover:bg-[#a3702f] disabled:opacity-50 transition-colors"
          >
            {polling ? 'Polling…' : 'Poll all now'}
          </button>
          <button type="button"
            onClick={() => { setEditCred(null); setPrefillMfr(undefined); setShowModal(true); }}
            className="px-3 py-1.5 text-xs font-medium border border-[#dde4ec] text-[#2d3748] rounded-lg hover:border-gray-400 transition-colors"
          >
            + Add integration
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-4 py-2">{error}</div>}
      {pollResult && (
        <div className="text-xs text-[#2d3748] bg-[#f8fafc] border border-[#dde4ec] rounded px-4 py-2">
          {pollResult}
        </div>
      )}

      {/* ── Credentials by technology ── */}
      {TECH_GROUPS.map(tg => {
        const mfrsInGroup = Object.entries(MFR_TECH)
          .filter(([, tech]) => tech === tg.tech)
          .map(([m]) => m)
          .filter(m => supported.includes(m));

        const configured = mfrsInGroup.filter(m => credByMfr[m]);

        return (
          <section key={tg.tech}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg border ${tg.border} ${tg.bg}`}>
              <span className={`text-xs font-semibold uppercase tracking-wide ${tg.colour}`}>{tg.label}</span>
              <span className={`text-xs ${tg.colour} opacity-70`}>
                {configured.length}/{mfrsInGroup.length} connected
              </span>
            </div>
            <div className={`border-x border-b ${tg.border} rounded-b-lg p-3`}>
              {mfrsInGroup.length === 0 ? (
                <p className="text-xs text-[#9aa5b4]">No manufacturers registered for this technology.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {mfrsInGroup.map(m => {
                    const cred = credByMfr[m];
                    if (cred) {
                      return (
                        <CredCard
                          key={m}
                          cred={cred}
                          stationCount={stationCountByMfr[m] ?? 0}
                          onTest={handleTest}
                          onEdit={c => { setEditCred(c); setShowModal(true); }}
                          onDelete={handleDelete}
                          testing={testing[cred.id] ?? false}
                        />
                      );
                    }
                    // Empty slot
                    return (
                      <button type="button"
                        key={m}
                        onClick={() => {
                          setEditCred(null);
                          setPrefillMfr(m);
                          setShowModal(true);
                        }}
                        className="border border-dashed border-[#dde4ec] rounded-lg p-4 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-colors group"
                      >
                        <div className="text-sm font-medium text-[#9aa5b4] group-hover:text-blue-600">
                          {MFR_LABEL[m] ?? m}
                        </div>
                        <div className="text-xs text-[#9aa5b4] mt-0.5 group-hover:text-blue-400">
                          Click to connect
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {/* ── Custom / other integrations ── */}
      {(() => {
        const knownMfrs = new Set(Object.keys(MFR_TECH));
        const customCreds = creds.filter(c => !knownMfrs.has(c.manufacturer));
        if (customCreds.length === 0) return null;
        return (
          <section>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg border border-[#dde4ec] bg-[#f8fafc]">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#3d4756]">Other / custom</span>
              <span className="text-xs text-[#9aa5b4]">{customCreds.length} configured</span>
            </div>
            <div className="border-x border-b border-[#dde4ec] rounded-b-lg p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {customCreds.map(cred => (
                  <CredCard
                    key={cred.id}
                    cred={cred}
                    stationCount={stationCountByMfr[cred.manufacturer] ?? 0}
                    onTest={handleTest}
                    onEdit={c => { setEditCred(c); setPrefillMfr(undefined); setShowModal(true); }}
                    onDelete={handleDelete}
                    testing={testing[cred.id] ?? false}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })()}

      {/* ── Stations table ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-[#2d3748] uppercase tracking-wide">
            Stations &amp; live snapshots
            <span className="ml-2 font-normal normal-case text-[#9aa5b4]">({filteredStations.length})</span>
          </h4>
          <select
            value={mfrFilter}
            onChange={e => setMfrFilter(e.target.value)}
            className="text-xs border border-[#dde4ec] rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#c2873a]"
          >
            <option value="">All manufacturers</option>
            {Array.from(new Set(stations.map(s => s.manufacturer))).sort().map(m => (
              <option key={m} value={m}>{MFR_LABEL[m] ?? m}</option>
            ))}
          </select>
        </div>

        {filteredStations.length === 0 ? (
          <div className="border border-dashed border-[#dde4ec] rounded-lg py-10 text-center">
            <p className="text-sm text-[#9aa5b4]">No stations yet.</p>
            <p className="text-xs text-[#9aa5b4] mt-1">
              Add an integration above, then use <strong>Poll all now</strong> or the SolaX sync to discover devices.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#dde4ec] rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#eef2f7]">
                  {['Serial number', 'Manufacturer', 'Plant', 'Site', 'AC output', 'Daily yield', 'Daily (ZAR)', 'Total (ZAR)', 'Temp', 'Status', 'Last data'].map(h => (
                    <th key={h} className={`px-3 py-2 text-xs font-medium ${h.includes('ZAR') ? 'text-emerald-600 text-right' : 'text-left text-[#6b7685]'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStations.map(s => <StationRow key={s.id} s={s} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Value accruals ── */}
      <AccrualsPanel />

      {/* ── Modal ── */}
      {showModal && (
        <CredModal
          initial={editCred ?? undefined}
          supported={supported}
          prefillManufacturer={prefillMfr}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditCred(null); setPrefillMfr(undefined); }}
        />
      )}
    </div>
  );
}
