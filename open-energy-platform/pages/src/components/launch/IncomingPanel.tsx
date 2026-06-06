import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Inbox } from 'lucide-react';
import { listRoleActions, actOnRoleAction, type RoleAction } from '../../lib/roleActions';

const PRIORITY_STYLE: Record<RoleAction['priority'], string> = {
  urgent: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
  high:   'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30',
  normal: 'bg-sky-500/15 text-sky-100 ring-1 ring-sky-400/30',
  low:    'bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/30',
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
  /** Called when the user acts on a card; host decides how to handle it (open WizardShell / navigate). */
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
    <section className={`rounded-xl bg-slate-900/60 ring-1 ring-slate-100/10 ${className ?? ''}`}>
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100/10">
        <div className="flex items-center gap-2 text-slate-100">
          <Inbox className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-semibold">Incoming</h2>
          {items.length > 0 && (
            <span className="text-xs rounded-full bg-slate-100/10 px-2 py-0.5 text-slate-300">{items.length}</span>
          )}
        </div>
        <button
          type="button" onClick={() => void load()}
          className="rounded-md p-1.5 text-slate-300 hover:text-slate-100 hover:bg-slate-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
          aria-label="Refresh incoming actions"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </header>

      <div className="p-3 space-y-2">
        {error && <p className="text-xs text-rose-300 px-1">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-slate-400 px-1 py-6 text-center">No incoming actions. You're all caught up.</p>
        )}
        {items.map((a) => (
          <article key={a.id} className="rounded-lg bg-slate-950/40 ring-1 ring-slate-100/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-100 font-medium leading-snug">{a.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
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
                  className="rounded-md bg-sky-500/90 hover:bg-sky-400 text-slate-950 text-xs font-semibold px-3 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  {a.cross_option.action_label}
                </button>
              )}
              <button
                type="button" onClick={() => void resolve(a, 'acknowledge')} disabled={busyId === a.id}
                className="rounded-md text-xs text-slate-200 hover:bg-slate-100/10 px-2.5 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              >
                Acknowledge
              </button>
              <button
                type="button" onClick={() => void resolve(a, 'dismiss')} disabled={busyId === a.id}
                className="rounded-md text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-100/10 px-2.5 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
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
