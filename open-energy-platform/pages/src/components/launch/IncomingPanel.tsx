import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Inbox } from 'lucide-react';
import { listRoleActions, actOnRoleAction, type RoleAction } from '../../lib/roleActions';

const PRIORITY_STYLE: Record<RoleAction['priority'], string> = {
  urgent: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  high:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  normal: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  low:    'bg-[#f1f5f9] text-[#6b7685] ring-1 ring-[#e5ebf2]',
};

function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export interface IncomingPanelProps {
  /** Called when the user acts on a card; host decides how to handle it (opens the CrossOptionModal next-step sheet). */
  onAct?: (action: RoleAction) => void;
  className?: string;
}

export default function IncomingPanel({ onAct, className }: IncomingPanelProps) {
  const [items, setItems] = useState<RoleAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listRoleActions('pending')); }
    catch { setError('Could not load incoming actions.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resolve = useCallback(async (a: RoleAction, kind: 'acknowledge' | 'dismiss') => {
    setBusyId(a.id);
    try { await actOnRoleAction(a.id, kind); setItems((xs) => xs.filter((x) => x.id !== a.id)); }
    catch { setError('Action failed. Try again.'); }
    finally { setBusyId(null); }
  }, []);

  return (
    <section className={`rounded-xl bg-white border border-[#dde4ec] ${className ?? ''}`}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#eef2f7]">
        <div className="flex items-center gap-2 text-[#0f1c2e]">
          <Inbox className="h-4 w-4 text-[#1a3a5c]" aria-hidden />
          <h2 className="text-[13px] font-display font-semibold">Incoming</h2>
          {items.length > 0 && (
            <span className="text-[11px] rounded-full bg-[#eef2f7] px-2 py-0.5 text-[#3d4756]">{items.length}</span>
          )}
        </div>
        <button
          type="button" onClick={() => void load()}
          className="rounded-md p-1.5 text-[#6b7685] hover:text-[#0f1c2e] hover:bg-[#eef2f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]"
          aria-label="Refresh incoming actions"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </header>

      <div className="p-3 space-y-2">
        {error && <p className="text-[11px] text-rose-600 px-1">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-[11px] text-[#6b7685] px-1 py-6 text-center">No incoming actions. You're all caught up.</p>
        )}
        {items.map((a) => (
          <article key={a.id} className="rounded-lg bg-[#f8fafc] border border-[#e5ebf2] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-[#0f1c2e] font-medium leading-snug">{a.title}</p>
                <p className="mt-0.5 text-[11px] text-[#6b7685]">
                  {a.source_chain_key ?? a.source_entity_type} · {ago(a.created_at)}
                </p>
              </div>
              <span className={`shrink-0 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${PRIORITY_STYLE[a.priority]}`}>
                {a.priority}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {a.cross_option && (
                <button
                  type="button" onClick={() => onAct?.(a)} disabled={busyId === a.id}
                  className="rounded-md bg-[#c2873a] hover:bg-[#a3702f] text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a] focus-visible:ring-offset-1"
                >
                  {a.cross_option.action_label}
                </button>
              )}
              <button
                type="button" onClick={() => void resolve(a, 'acknowledge')} disabled={busyId === a.id}
                className="rounded-md text-[11px] text-[#3d4756] hover:bg-[#eef2f7] px-2.5 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]"
              >
                Acknowledge
              </button>
              <button
                type="button" onClick={() => void resolve(a, 'dismiss')} disabled={busyId === a.id}
                className="rounded-md text-[11px] text-[#6b7685] hover:text-[#0f1c2e] hover:bg-[#eef2f7] px-2.5 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2873a]"
              >
                Dismiss
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
