'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DataSource {
  id: string;
  label: string;
  source_type: string;
  host: string | null;
  port: number | null;
  polling_interval_sec: number;
  last_read_at: string | null;
  last_error: string | null;
  status: string;
  site_id: string | null;
}

interface TelemetryPoint {
  ts: string;
  device_id?: string;
  ac_kw?: number | null;
  dc_kw?: number | null;
  interval_kwh?: number | null;
  temperature_c?: number | null;
  quality?: string;
}

interface LiveData {
  data: TelemetryPoint[];
  polling_interval_sec: number;
  label: string;
  site_id: string | null;
  window_minutes: number;
  note?: string;
}

// ─── Sparkline (pure SVG, no chart dep) ───────────────────────────────────────

function Sparkline({ points, field, colour }: {
  points: TelemetryPoint[];
  field: 'ac_kw' | 'dc_kw' | 'temperature_c';
  colour: string;
}) {
  const W = 480; const H = 80;
  const vals = points.map(p => (p[field] as number | null | undefined) ?? null).filter((v): v is number => v !== null);
  if (vals.length < 2) {
    return <div className="flex items-center justify-center h-20 text-xs text-gray-400">No {field} data in window</div>;
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const px = (i: number) => (i / (points.length - 1)) * W;
  const py = (v: number) => H - ((v - min) / range) * (H - 8) - 4;

  const filtered = points.map((p, i) => ({ i, v: (p[field] as number | null | undefined) }))
    .filter(({ v }) => v !== null && v !== undefined) as { i: number; v: number }[];
  if (filtered.length < 2) return null;

  const pathD = filtered.map(({ i, v }, idx) => `${idx === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

  const latest = filtered[filtered.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <path d={pathD} fill="none" stroke={colour} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={px(latest.i)} cy={py(latest.v)} r="3" fill={colour} />
      <text x={px(latest.i) + 6} y={py(latest.v) + 4} fontSize="10" fill={colour}>
        {latest.v.toFixed(2)}
      </text>
      <text x="2" y={H - 2} fontSize="9" fill="#9ca3af">{min.toFixed(1)}</text>
      <text x="2" y="10" fontSize="9" fill="#9ca3af">{max.toFixed(1)}</text>
    </svg>
  );
}

// ─── Live modal ───────────────────────────────────────────────────────────────

function LiveModal({ source, onClose }: { source: DataSource; onClose: () => void }) {
  const [live, setLive] = useState<LiveData | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await api.get(`/esums/data-sources/${source.id}/live?minutes=${minutes}`);
      setLive(res.data ?? res);
      setError(null);
    } catch (e: unknown) {
      setError((e as Error).message ?? 'fetch failed');
    }
  }, [source.id, minutes]);

  // Initial fetch + polling loop
  useEffect(() => {
    fetch_();
    const interval = Math.max(5, source.polling_interval_sec) * 1000;
    timerRef.current = setInterval(fetch_, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetch_, source.polling_interval_sec]);

  const points = live?.data ?? [];
  const lastTs = points.length > 0 ? new Date(points[points.length - 1].ts).toLocaleTimeString() : '—';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{source.label} — Live data</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {source.source_type} · polling every {source.polling_interval_sec}s · last point {lastTs}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Window selector */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-50 bg-gray-50/60">
          <span className="text-xs text-gray-500 mr-1">Window:</span>
          {[15, 30, 60, 180, 360, 1440].map(m => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                minutes === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-400'
              }`}
            >
              {m < 60 ? `${m}m` : m < 1440 ? `${m / 60}h` : '24h'}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">{points.length} points</span>
        </div>

        {/* Charts */}
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-3">{error}</div>
          )}
          {live?.note && !error && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-3">{live.note}</div>
          )}
          {!error && points.length === 0 && !live?.note && (
            <div className="text-xs text-gray-400 text-center py-6">No readings in the selected window. Waiting for next poll…</div>
          )}
          {points.length > 0 && (
            <>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">AC output (kW)</div>
                <Sparkline points={points} field="ac_kw" colour="#2563eb" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">DC input (kW)</div>
                <Sparkline points={points} field="dc_kw" colour="#16a34a" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Temperature (°C)</div>
                <Sparkline points={points} field="temperature_c" colour="#d97706" />
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Interval editor ──────────────────────────────────────────────────────────

function IntervalEditor({ source, onSaved }: { source: DataSource; onSaved: () => void }) {
  const [value, setValue] = useState(String(source.polling_interval_sec));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const sec = Number(value);
    if (!Number.isInteger(sec) || sec < 5) { setError('Min 5 seconds'); return; }
    setSaving(true);
    try {
      await api.put(`/esums/data-sources/${source.id}`, { polling_interval_sec: sec });
      onSaved();
    } catch (e: unknown) {
      setError((e as Error).message ?? 'save failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" min={5} value={value}
        onChange={e => { setValue(e.target.value); setError(null); }}
        className="w-20 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-blue-400"
      />
      <span className="text-xs text-gray-400">s</span>
      <button
        onClick={save} disabled={saving}
        className="px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? '…' : 'Save'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  error:    'bg-red-100 text-red-600',
  testing:  'bg-yellow-100 text-yellow-700',
};

function Pill({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOURS[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DataSourcesTab() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveSource, setLiveSource] = useState<DataSource | null>(null);
  const [editingInterval, setEditingInterval] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ id: string; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/esums/data-sources');
      setSources(res.data ?? res ?? []);
    } catch { /* swallow */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runAction(id: string, path: string, label: string) {
    try {
      await api.post(`/esums/data-sources/${id}/${path}`, {});
      setActionResult({ id, msg: `${label} — done` });
      await load();
    } catch (e: unknown) {
      setActionResult({ id, msg: `${label} failed: ${(e as Error).message}` });
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading data sources…</div>;
  if (sources.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-gray-500">No data sources yet.</p>
        <p className="text-xs text-gray-400 mt-1">Add a Modbus TCP, MQTT, REST API or other source from the onboarding wizard.</p>
      </div>
    );
  }

  return (
    <>
      {liveSource && <LiveModal source={liveSource} onClose={() => setLiveSource(null)} />}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-2.5 text-left font-medium">Label</th>
              <th className="px-4 py-2.5 text-left font-medium">Protocol</th>
              <th className="px-4 py-2.5 text-left font-medium">Host / Broker</th>
              <th className="px-4 py-2.5 text-right font-medium">Port</th>
              <th className="px-4 py-2.5 text-left font-medium">Interval</th>
              <th className="px-4 py-2.5 text-left font-medium">Last read</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sources.map(src => (
              <tr key={src.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{src.label}</td>
                <td className="px-4 py-3 text-gray-600">{src.source_type}</td>
                <td className="px-4 py-3 text-gray-600 text-xs font-mono">{src.host ?? '—'}</td>
                <td className="px-4 py-3 text-right text-gray-600">{src.port ?? '—'}</td>
                <td className="px-4 py-3">
                  {editingInterval === src.id
                    ? <IntervalEditor source={src} onSaved={() => { setEditingInterval(null); load(); }} />
                    : (
                      <button
                        onClick={() => setEditingInterval(src.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline"
                        title="Click to edit"
                      >
                        {src.polling_interval_sec}s
                      </button>
                    )
                  }
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {src.last_read_at ? new Date(src.last_read_at).toLocaleTimeString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <Pill status={src.status} />
                  {src.last_error && (
                    <p className="text-[10px] text-red-500 mt-0.5 max-w-[120px] truncate" title={src.last_error}>
                      {src.last_error}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setLiveSource(src)}
                      className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                      title="Open live graph for this data source"
                    >
                      Live
                    </button>
                    <button
                      onClick={() => runAction(src.id, 'test', 'Test')}
                      className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                    >
                      Test
                    </button>
                    {src.status !== 'active'
                      ? <button onClick={() => runAction(src.id, 'activate', 'Activate')}
                          className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100 transition-colors">
                          Activate
                        </button>
                      : <button onClick={() => runAction(src.id, 'deactivate', 'Deactivate')}
                          className="px-2.5 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded hover:bg-gray-200 transition-colors">
                          Deactivate
                        </button>
                    }
                  </div>
                  {actionResult?.id === src.id && (
                    <p className="text-[10px] text-gray-400 text-right mt-1">{actionResult.msg}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
