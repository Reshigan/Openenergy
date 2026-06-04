'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tech = 'solar' | 'wind' | 'hydro' | 'waste';

interface Credential {
  id: string;
  manufacturer: string;
  auth_type: string;
  base_url: string | null;
  site_id: string | null;
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

// ─── Status pill ──────────────────────────────────────────────────────────────

function Pill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active:   'bg-emerald-100 text-emerald-800',
    inactive: 'bg-gray-100 text-gray-600',
    error:    'bg-red-100 text-red-700',
    online:   'bg-emerald-100 text-emerald-800',
    offline:  'bg-gray-100 text-gray-500',
    pending:  'bg-amber-100 text-amber-700',
    stub:     'bg-violet-100 text-violet-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
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
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-gray-900 truncate">
              {MFR_LABEL[cred.manufacturer] ?? cred.manufacturer}
            </span>
            <Pill status={cred.status} />
            {!isLive && <Pill status="stub" />}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{cred.auth_type}</div>
          {cred.base_url && (
            <div className="text-xs text-gray-400 truncate mt-0.5">{cred.base_url}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onTest(cred.id)}
            disabled={testing || !isLive}
            title={isLive ? 'Test connection' : 'Adapter not yet implemented'}
            className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {testing ? '…' : 'Test'}
          </button>
          <button
            onClick={() => onEdit(cred)}
            className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:border-gray-400 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(cred.id)}
            className="px-2.5 py-1 text-xs rounded border border-red-100 text-red-500 hover:border-red-300 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
        <span>{stationCount} station{stationCount !== 1 ? 's' : ''}</span>
        {cred.last_tested_at && <span>Tested {fmtTs(cred.last_tested_at)}</span>}
        {!cred.last_tested_at && <span className="text-gray-400">Never tested</span>}
      </div>

      {cred.last_error && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2.5 py-1.5 break-all">
          {cred.last_error}
        </div>
      )}

      {!isLive && (
        <div className="mt-2 text-xs text-violet-600 bg-violet-50 border border-violet-100 rounded px-2.5 py-1.5">
          Live API adapter coming soon. Credentials stored — polling will activate when the adapter lands.
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
    manufacturer:  initial?.manufacturer ?? prefillManufacturer ?? '',
    auth_type:     initial?.auth_type ?? 'oauth2_client_creds',
    base_url:      initial?.base_url ?? '',
    site_id:       initial?.site_id ?? '',
    client_id:     '',
    client_secret: '',
    api_key:       '',
    token:         '',
    username:      '',
    password:      '',
    // Custom adapter fields
    adapter_notes: '',
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">
            {initial ? 'Edit integration' : 'Add integration'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">

          {/* Manufacturer picker */}
          {!initial && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">Technology &amp; manufacturer</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustom(false)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${!isCustom ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                >
                  Known manufacturer
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustom(true)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${isCustom ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                >
                  Other / custom
                </button>
              </div>

              {!isCustom ? (
                <select
                  value={form.manufacturer}
                  onChange={e => set('manufacturer', e.target.value)}
                  required={!isCustom}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400">
                    Credentials will be stored. A live polling adapter must be built before data flows —
                    contact your platform administrator or open a feature request with the manufacturer's
                    API documentation.
                  </p>
                  <textarea
                    value={form.adapter_notes}
                    onChange={e => set('adapter_notes', e.target.value)}
                    placeholder="API docs URL, auth method, endpoint pattern, any notes for the adapter builder…"
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Auth type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Auth type</label>
            <select
              value={form.auth_type}
              onChange={e => set('auth_type', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}
        </form>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

// ─── Station row ──────────────────────────────────────────────────────────────

function StationRow({ s }: { s: Station }) {
  const online = s.snapshot_online === 1 || s.online_status === 1;
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50/50">
      <td className="px-3 py-2 text-xs font-mono text-gray-700">{s.device_sn}</td>
      <td className="px-3 py-2 text-xs text-gray-600">{MFR_LABEL[s.manufacturer] ?? s.manufacturer}</td>
      <td className="px-3 py-2 text-xs text-gray-600">{s.plant_name ?? s.plant_id}</td>
      <td className="px-3 py-2 text-xs text-gray-600">{s.site_name ?? <span className="text-gray-400">unlinked</span>}</td>
      <td className="px-3 py-2 text-xs text-right tabular-nums font-medium text-gray-900">
        {s.ac_kw !== null ? kw(s.ac_kw) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-right tabular-nums text-gray-600">
        {s.daily_kwh !== null ? kwh(s.daily_kwh) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-right tabular-nums text-gray-500">
        {s.temperature_c !== null ? `${Number(s.temperature_c).toFixed(0)} °C` : '—'}
      </td>
      <td className="px-3 py-2">
        <Pill status={online ? 'online' : 'offline'} />
      </td>
      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">
        {fmtTs(s.snapshot_ts ?? s.last_sync_at)}
      </td>
    </tr>
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
      <div className="flex items-center justify-center py-16 text-sm text-gray-400">Loading integrations…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Inverter &amp; device integrations</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Connect generation assets across solar, wind, hydro and waste-to-energy technologies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePollAll}
            disabled={polling}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {polling ? 'Polling…' : 'Poll all now'}
          </button>
          <button
            onClick={() => { setEditCred(null); setPrefillMfr(undefined); setShowModal(true); }}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:border-gray-400 transition-colors"
          >
            + Add integration
          </button>
        </div>
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-4 py-2">{error}</div>}
      {pollResult && (
        <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-4 py-2">
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
                <p className="text-xs text-gray-400">No manufacturers registered for this technology.</p>
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
                      <button
                        key={m}
                        onClick={() => {
                          setEditCred(null);
                          setPrefillMfr(m);
                          setShowModal(true);
                        }}
                        className="border border-dashed border-gray-200 rounded-lg p-4 text-left hover:border-blue-300 hover:bg-blue-50/30 transition-colors group"
                      >
                        <div className="text-sm font-medium text-gray-400 group-hover:text-blue-600">
                          {MFR_LABEL[m] ?? m}
                        </div>
                        <div className="text-xs text-gray-300 mt-0.5 group-hover:text-blue-400">
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
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg border border-gray-200 bg-gray-50">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Other / custom</span>
              <span className="text-xs text-gray-400">{customCreds.length} configured</span>
            </div>
            <div className="border-x border-b border-gray-200 rounded-b-lg p-3">
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
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Stations &amp; live snapshots
            <span className="ml-2 font-normal normal-case text-gray-400">({filteredStations.length})</span>
          </h4>
          <select
            value={mfrFilter}
            onChange={e => setMfrFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All manufacturers</option>
            {Array.from(new Set(stations.map(s => s.manufacturer))).sort().map(m => (
              <option key={m} value={m}>{MFR_LABEL[m] ?? m}</option>
            ))}
          </select>
        </div>

        {filteredStations.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg py-10 text-center">
            <p className="text-sm text-gray-400">No stations yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Add an integration above, then use <strong>Poll all now</strong> or the SolaX sync to discover devices.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Serial number', 'Manufacturer', 'Plant', 'Site', 'AC output', 'Daily yield', 'Temp', 'Status', 'Last data'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
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
