// ════════════════════════════════════════════════════════════════════════
// VaultPanel — embeddable file list + upload for any entity.
//
// Drop into a detail page with:
//   <VaultPanel entityType="contracts" entityId={contract.id} />
// to surface every uploaded document for that record, plus a button to
// upload more. Backend: /api/vault/files?entity_type&entity_id list,
// /api/vault/upload-direct multipart, /api/vault/files/:id/download.
// ════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, FileText, Download, Trash2, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

type VaultFile = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  uploaded_by_name?: string;
  created_at: string;
  r2_key: string;
};

function bytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function VaultPanel({
  entityType,
  entityId,
  title = 'Documents',
}: {
  entityType: string;
  entityId: string;
  title?: string;
}) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await api.get(`/vault/files?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`);
      setFiles((r.data?.data || []) as VaultFile[]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'load failed');
    } finally { setLoading(false); }
  }, [entityType, entityId]);
  useEffect(() => { void load(); }, [load]);

  const onPick = () => fileRef.current?.click();
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('entity_type', entityType);
      fd.append('entity_id', entityId);
      await api.post('/vault/upload-direct', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await load();
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : 'upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const download = async (f: VaultFile) => {
    try {
      const r = await api.get(`/vault/files/${f.id}/download`, { responseType: 'blob' });
      const blob = r.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.file_name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : 'download failed');
    }
  };

  const del = async (f: VaultFile) => {
    if (!confirm(`Delete ${f.file_name}?`)) return;
    try {
      await api.delete(`/vault/files/${f.id}`);
      await load();
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : 'delete failed');
    }
  };

  return (
    <section className="rounded-xl border border-[#dde4ec] bg-white">
      <header className="px-5 py-3 border-b border-[#eef2f7] flex items-center justify-between">
        <div className="font-display font-semibold text-[14px] text-[#0f1c2e] inline-flex items-center gap-2">
          <FileText size={14} /> {title}
          <span className="text-[11px] text-[#6b7685] font-normal">{files.length}</span>
        </div>
        <button type="button" onClick={onPick} disabled={uploading}
          className="h-8 px-3 rounded-md bg-[#c2873a] text-white text-[12px] font-semibold inline-flex items-center gap-2 disabled:opacity-50">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={fileRef} type="file" onChange={onChange} className="hidden" />
      </header>
      <div className="p-3">
        {err && <div className="text-[12px] text-red-700 mb-2">{err}</div>}
        {loading ? (
          <div className="text-[12px] text-[#6b7685] px-2 py-2">Loading…</div>
        ) : files.length === 0 ? (
          <div className="text-[12px] text-[#6b7685] px-2 py-4 text-center">
            No documents yet. Drop in evidence, signed contracts, certifications.
          </div>
        ) : (
          <ul className="divide-y divide-[#eef2f7]">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-2 py-2 text-[12px]">
                <FileText size={14} className="text-[#6b7685]" />
                <div className="flex-1 min-w-0">
                  <div className="text-[#0f1c2e] truncate">{f.file_name}</div>
                  <div className="text-[10px] text-[#6b7685]">
                    {bytes(f.size_bytes)} · uploaded {new Date(f.created_at).toLocaleString()}
                    {f.uploaded_by_name ? ` by ${f.uploaded_by_name}` : ''}
                  </div>
                </div>
                <button type="button" onClick={() => download(f)} title="Download" className="p-1.5 text-[#3b82c4] hover:bg-[#eef2f7] rounded"><Download size={14} /></button>
                <button type="button" onClick={() => del(f)} title="Delete" className="p-1.5 text-[#c0392b] hover:bg-[#fde7e9] rounded"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
