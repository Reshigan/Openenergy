import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useHelpDismissal } from '../../lib/uxState';

interface Item { id: string; label: string; description: string; href: string; done: boolean; }

export function SetupChecklist({ role }: { role: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();
  const dismissalKey = `setup-checklist.${role}`;
  const { dismissed, dismiss } = useHelpDismissal(dismissalKey);

  useEffect(() => {
    void api.get(`/launch/${role}/checklist`)
      .then((r) => setItems(r.data?.data?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, [role]);

  if (!loaded || dismissed) return null;
  if (items.length === 0) return null;
  const remaining = items.filter((i) => !i.done);
  if (remaining.length === 0) return null;

  const next = remaining[0];

  return (
    <div style={{ background: 'var(--s1, #fff)', border: '1px solid var(--border-subtle, #e3e7ec)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink, #0f1c2e)' }}>Finish setting up</div>
        <button type="button" onClick={() => void dismiss()} style={{ fontSize: 11, color: 'var(--ink-2, #6b7685)', background: 'none', border: 'none', cursor: 'pointer' }}>Hide</button>
      </div>
      <button type="button" onClick={() => navigate(next.href)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', marginTop: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #cfe0f0', background: '#eaf3fb', cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#0f3a5c', fontWeight: 600 }}>Recommended next: {next.label}</div>
          <div style={{ fontSize: 11, color: '#3a4658', marginTop: 2 }}>{next.description}</div>
        </div>
        <ArrowRight size={14} style={{ flexShrink: 0 }} />
      </button>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((i) => (
          <button type="button" key={i.id} onClick={() => !i.done && navigate(i.href)} disabled={i.done}
            style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '6px 4px', border: 'none', background: 'none', cursor: i.done ? 'default' : 'pointer' }}>
            {i.done ? <CheckCircle2 size={16} style={{ color: 'var(--good, #1f6b3a)', flexShrink: 0 }} /> : <Circle size={16} style={{ color: '#9aa6b4', flexShrink: 0 }} />}
            <span style={{ fontSize: 13, color: i.done ? 'var(--ink-2, #7a8a9a)' : 'var(--ink, #0f1c2e)', textDecoration: i.done ? 'line-through' : 'none' }}>{i.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
