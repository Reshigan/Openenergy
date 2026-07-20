// ════════════════════════════════════════════════════════════════════════
// BulkOpsPage — /admin/bulk-ops
//
// Pick an entity from the whitelist, then export to CSV, import from CSV,
// or apply a bulk patch by id list.
// ════════════════════════════════════════════════════════════════════════

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Database, Download, Upload, Edit3, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../../lib/api';
import { StitchPage } from '../StitchPage';

type Entity = {
  key: string; table: string;
  select_columns: string[]; writable_columns: string[]; import_columns: string[];
};

export function BulkOpsPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [active, setActive] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/bulk/registry').then((r) => {
      if (r.data?.success) {
        setEntities(r.data.data || []);
        if (r.data.data?.[0]) setActive(r.data.data[0].key);
      }
    }).catch((e) => setErr(e?.response?.data?.error || e?.message || 'load failed'));
  }, []);

  const def = useMemo(() => entities.find((e) => e.key === active), [entities, active]);

  return (
    <StitchPage
      eyebrowIcon={Database}
      eyebrowLabel="Admin · bulk operations"
      title="Bulk operations"
      subtitle="CSV import / export and bulk update across whitelisted entities."
    >
      {err && <div className="text-[12px] mb-3" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
      <div className="flex flex-wrap gap-2 mb-4">
        {entities.map((e) => (
          <button type="button" key={e.key} onClick={() => setActive(e.key)}
            className="h-8 px-3 rounded text-[12px] font-semibold"
            style={active === e.key
              ? { background: 'var(--accent, oklch(0.46 0.16 55))', color: '#fff' }
              : { border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))', color: 'var(--ink, oklch(0.17 0.010 250))', background: 'var(--s1, oklch(0.99 0.002 80))' }
            }>{e.key}</button>
        ))}
        {entities.length === 0 && <div className="text-[12px]" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>No entities visible to your role.</div>}
      </div>
      {def && <EntityPanel def={def}/>}
    </StitchPage>
  );
}

function EntityPanel({ def }: { def: Entity }) {
  return (
    <div className="space-y-4">
      <div className="widget-card p-4">
        <div className="text-[13px] font-semibold mb-1" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>Schema</div>
        <dl className="text-[12px] grid grid-cols-1 md:grid-cols-3 gap-2">
          <div><dt style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>Table</dt><dd className="font-mono">{def.table}</dd></div>
          <div><dt style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>Exportable</dt><dd className="font-mono">{def.select_columns.join(', ')}</dd></div>
          <div><dt style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>Writable</dt><dd className="font-mono">{def.writable_columns.join(', ') || '—'}</dd></div>
        </dl>
      </div>
      <ExportPanel def={def}/>
      <ImportPanel def={def}/>
      <UpdatePanel def={def}/>
    </div>
  );
}

function ExportPanel({ def }: { def: Entity }) {
  const [limit, setLimit] = useState(1000);
  const download = () => {
    const url = `/api/bulk/${encodeURIComponent(def.key)}/export?limit=${limit}`;
    // Auth header is required — fetch with token, then trigger a download.
    const token = window.localStorage.getItem('token');
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const blob = await r.blob();
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u; a.download = `${def.key}-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(u);
      })
      .catch((e) => window.alert(e?.message || 'download failed'));
  };
  return (
    <div className="widget-card p-4">
      <div className="text-[13px] font-semibold mb-2 inline-flex items-center gap-1" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}><Download size={13}/> Export CSV</div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[11px] font-semibold" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>Row limit
          <input type="number" min={1} max={10000} className="ml-2 h-8 px-2 rounded text-[12px] w-24 font-mono"
                 style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}
                 value={limit} onChange={(e) => setLimit(Number(e.target.value))}/>
        </label>
        <button type="button" onClick={download} className="h-8 px-3 rounded text-white text-[12px] font-semibold"
                style={{ background: 'var(--accent, oklch(0.46 0.16 55))' }}>Download</button>
      </div>
    </div>
  );
}

function ImportPanel({ def }: { def: Entity }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ received: number; inserted: number; failed: number; errors: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null); setResult(null);
    try {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('select a file');
      const text = await file.text();
      const r = await api.post(`/bulk/${encodeURIComponent(def.key)}/import`, text, {
        headers: { 'Content-Type': 'text/csv' },
        transformRequest: [(d) => d],
      });
      if (!r.data?.success) throw new Error(r.data?.error || 'import failed');
      setResult(r.data.data);
    } catch (e: any) { setErr(e?.response?.data?.error || e?.message || 'import failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="widget-card p-4">
      <div className="text-[13px] font-semibold mb-2 inline-flex items-center gap-1" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}><Upload size={13}/> Import CSV</div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>Required header columns: {def.import_columns.join(', ')}</div>
      <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="text-[12px]"/>
      <button type="button" disabled={busy} onClick={submit} className="ml-2 h-8 px-3 rounded text-white text-[12px] font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent, oklch(0.46 0.16 55))' }}>
        {busy ? 'Importing…' : 'Import'}
      </button>
      {err && <div className="text-[12px] mt-2" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
      {result && (
        <div className="text-[12px] mt-2" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}>
          <CheckCircle2 size={13} className="inline mr-1" style={{ color: 'var(--good, oklch(0.45 0.15 150))' }}/>
          Received {result.received}, inserted {result.inserted}, failed {result.failed}.
          {result.errors.length > 0 && <ul className="mt-1 list-disc list-inside" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}>{result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}

function UpdatePanel({ def }: { def: Entity }) {
  const [ids, setIds] = useState('');
  const [patch, setPatch] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null); setAck(null);
    try {
      const idList = ids.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const cleanPatch: Record<string, any> = {};
      for (const [k, v] of Object.entries(patch)) if (v !== '') cleanPatch[k] = v;
      const r = await api.post(`/bulk/${encodeURIComponent(def.key)}/update`, { ids: idList, patch: cleanPatch });
      if (!r.data.success) throw new Error(r.data.error || 'failed');
      setAck(`Updated ${r.data.data?.affected || 0} rows`);
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.step_up_required) setErr('Step-up auth required to bulk-update.');
      else setErr(data?.error || e?.message || 'failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="widget-card p-4">
      <div className="text-[13px] font-semibold mb-2 inline-flex items-center gap-1" style={{ color: 'var(--ink, oklch(0.17 0.010 250))' }}><Edit3 size={13}/> Bulk update</div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>Apply the same patch to every listed id. Writable columns only.</div>
      <label className="block text-[11px] font-semibold" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>IDs (comma or newline separated)
        <textarea rows={3} className="mt-1 w-full p-2 rounded text-[12px] font-mono"
               style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}
               value={ids} onChange={(e) => setIds(e.target.value)}/>
      </label>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
        {def.writable_columns.map((c) => (
          <label key={c} className="text-[11px] font-semibold" style={{ color: 'var(--ink-2, oklch(0.40 0.009 250))' }}>
            {c}
            <input className="mt-1 w-full h-8 px-2 rounded text-[12px]"
                   style={{ border: '1px solid var(--border-subtle, oklch(0.87 0.006 250))' }}
                   value={patch[c] || ''} onChange={(e) => setPatch({ ...patch, [c]: e.target.value })}/>
          </label>
        ))}
      </div>
      {err && <div className="text-[12px] mt-2" style={{ color: 'var(--bad, oklch(0.48 0.20 20))' }}><AlertCircle size={13} className="inline mr-1"/>{err}</div>}
      {ack && <div className="text-[12px] mt-2" style={{ color: 'var(--good, oklch(0.45 0.15 150))' }}><CheckCircle2 size={13} className="inline mr-1"/>{ack}</div>}
      <button type="button" disabled={busy} onClick={submit} className="mt-2 h-8 px-3 rounded text-white text-[12px] font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent, oklch(0.46 0.16 55))' }}>
        {busy ? 'Updating…' : 'Apply'}
      </button>
    </div>
  );
}
