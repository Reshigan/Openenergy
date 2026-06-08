import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

interface Capability {
  id: string; label: string; description: string; href: string; group: string; depth: 'core' | 'advanced';
}

export function CapabilityPalette({ role, open, onClose }: { role: string; open: boolean; onClose: () => void }) {
  const [caps, setCaps] = useState<Capability[]>([]);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    void api.get(`/launch/${role}/capabilities`)
      .then((r) => setCaps(r.data?.data?.capabilities || []))
      .catch(() => setCaps([]));
    return undefined;
  }, [open, role]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return caps;
    return caps.filter((c) => `${c.label} ${c.description} ${c.group}`.toLowerCase().includes(needle));
  }, [caps, q]);

  if (!open) return null;

  const go = (href: string) => { onClose(); navigate(href); };

  return (
    <div role="dialog" aria-label="What can I do here" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,28,46,0.35)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid #eef1f5' }}>
          <Search size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you want to do?"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14 }} />
          <button aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && <div style={{ padding: 20, color: '#7a8a9a', fontSize: 13 }}>No matching actions.</div>}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => go(c.href)}
              style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, padding: '10px 12px', border: 'none', background: 'none', borderRadius: 8, cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1c2e' }}>{c.label}
                  {c.depth === 'advanced' && <span style={{ marginLeft: 8, fontSize: 10, color: '#6b7685', textTransform: 'uppercase', letterSpacing: 0.5 }}>advanced</span>}
                </div>
                <div style={{ fontSize: 12, color: '#557', marginTop: 2 }}>{c.description}</div>
              </div>
              <ArrowRight size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
