// ═══════════════════════════════════════════════════════════════════════════
// Transaction (/v2/t/:id) — the event log IS the page. Header + custody notice +
// the candidate actions this role can fire (computed client-side from the decl,
// submitted optimistically) + the timeline (past events, projected next states)
// + the terms. `/` focuses a command bar that fires an edge by name.
// ═══════════════════════════════════════════════════════════════════════════

import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { Shell } from './Shell';
import { getChains, getTxn, actTxn } from './api';
import { TransitionForm } from './FieldForm';
import {
  candidatesFor, stateKind, fromStates, fieldLabel, fmtDuration,
  RECORD_ONLY_NOTICE,
  type ChainDecl, type TxnBundle, type Candidate, type Json,
} from './decl';

export default function Transaction() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [chain, setChain] = useState<ChainDecl | null>(null);
  const [bundle, setBundle] = useState<TxnBundle | null | 'missing'>(null);
  const [active, setActive] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const cmdRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const b = await getTxn(id);
    setBundle(b ?? 'missing');
    if (b) {
      const chains = await getChains();
      setChain(chains[b.txn.chain_key] ?? null);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const role = user?.role ?? '';
  const candidates = useMemo(
    () => (chain && bundle !== 'missing' && bundle ? candidatesFor(chain, bundle.txn.state, role) : []),
    [chain, bundle, role],
  );

  // `/` focuses the command bar (unless typing in a field already).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/input|textarea|select/i.test(el.tagName)) {
        e.preventDefault(); cmdRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fire = async (c: Candidate, input: Record<string, Json>, reason?: { code: string; text?: string }) => {
    if (bundle === 'missing' || !bundle || !chain) return;
    setBusy(true); setErr(undefined);
    const res = await actTxn(bundle.txn.id, {
      chain_key: chain.key,
      edge: c.t.id,
      input,
      expected_seq: bundle.txn.seq,
      idempotency_key: `${bundle.txn.id}:${c.t.id}:${bundle.txn.seq}`,
      reason_code: reason?.code,
      reason_text: reason?.text,
    });
    setBusy(false);
    if (res.ok) { setActive(null); await load(); }
    else setErr(res.constraint ? `${res.code} (${res.constraint})` : res.code || res.message || 'rejected');
  };

  if (bundle === null) return <Shell><div className="v2-skeleton" style={{ height: 300 }} /></Shell>;
  if (bundle === 'missing') return <Shell><div className="v2-card v2-empty">Transaction not found, or you’re not a party to it.</div></Shell>;

  const { txn, parties, events } = bundle;
  const live = parties.filter((p) => p.until_event_id === null);
  const kind = chain ? stateKind(chain, txn.state) : 'open';
  const stateLabel = chain?.states[txn.state]?.label ?? txn.state;

  return (
    <Shell>
      <div className="v2-txn-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>{txn.title}</h1>
          <span className={`v2-pill is-${kind}`}>{stateLabel}</span>
        </div>
        <div className="v2-txn-meta">
          <span className="ref" style={{ fontFamily: 'var(--font-mono)' }}>{txn.human_ref}</span>
          <span>·</span><span>{chain?.noun ?? txn.chain_key}</span>
          <span>·</span><span>opened {txn.opened_at.slice(0, 10)}</span>
          {txn.closed_at && <><span>·</span><span>closed {txn.closed_at.slice(0, 10)}</span></>}
        </div>
        {live.length > 0 && (
          <div className="v2-parties">
            {live.map((p, i) => (
              <span key={p.participant_id + i}>
                {i > 0 && ' · '}<b>{p.role_on_txn}</b> {p.participant_id === user?.id ? '(you)' : p.participant_id.slice(0, 8)}
              </span>
            ))}
          </div>
        )}
      </div>

      {chain && chain.settles === false && (
        <div className="v2-notice" role="note">
          <div className="hd">Record only</div>
          <p>{RECORD_ONLY_NOTICE}</p>
        </div>
      )}

      {/* command bar + candidate actions */}
      {!txn.closed_at && candidates.length > 0 && (
        <>
          <CommandBar ref={cmdRef} candidates={candidates} onPick={setActive} />
          <div className="v2-actions">
            {candidates.map((c) => (
              <button
                key={c.t.id}
                className={`v2-btn ${c.t.intent === 'destructive' ? 'v2-btn-destructive' : c.t.intent === 'primary' ? 'v2-btn-primary' : 'v2-btn-secondary'}`}
                disabled={!c.enabled}
                title={c.enabled ? '' : c.reason}
                onClick={() => setActive(c)}
              >
                {c.t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {active && (
        <div className="v2-card" style={{ padding: 'var(--sp-4)', marginBottom: 'var(--sp-6)' }}>
          <div className="v2-label" style={{ marginBottom: 8 }}>{active.t.label}</div>
          <TransitionForm
            t={active.t}
            busy={busy}
            error={err}
            onSubmit={(input, reason) => fire(active, input, reason)}
            onCancel={() => { setActive(null); setErr(undefined); }}
          />
        </div>
      )}

      <div className="v2-cols">
        <div className="v2-col">
          <h4>History</h4>
          <Timeline chain={chain} events={events} currentState={txn.state} />
        </div>
        <div className="v2-col">
          <h4>Terms</h4>
          <Terms chain={chain} fields={txn.fields} />
        </div>
      </div>
    </Shell>
  );
}

const CommandBar = forwardRef<HTMLInputElement, { candidates: Candidate[]; onPick: (c: Candidate) => void }>(
  function CommandBar({ candidates, onPick }, ref) {
    const [q, setQ] = useState('');
    const match = candidates.filter((c) => c.enabled && c.t.label.toLowerCase().includes(q.toLowerCase()));
    return (
      <input
        ref={ref}
        className="v2-input"
        style={{ marginBottom: 'var(--sp-3)', maxWidth: 420 }}
        placeholder="Press / then type an action…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && match[0]) { onPick(match[0]); setQ(''); (e.target as HTMLInputElement).blur(); } }}
      />
    );
  },
);

function Timeline({ chain, events, currentState }: { chain: ChainDecl | null; events: TxnBundle['events']; currentState: string }) {
  // Project the immediate next states (edges out of the current state) as ghost
  // rows — the event log's future, not yet written.
  const nexts = chain
    ? chain.transitions.filter((t) => t.from !== '@new' && fromStates(t).includes(currentState)).map((t) => t.label)
    : [];
  return (
    <ul className="v2-tl">
      {events.map((e) => (
        <li key={e.seq}>
          <span className="dot" />
          <div className="when">{e.occurred_at.replace('T', ' ').slice(0, 16)} UTC</div>
          <div className="what">{chain?.states[e.to_state]?.label ?? e.to_state} <span className="who">· {e.type}</span></div>
          <div className="who">{e.actor_kind === 'user' ? e.actor_id.slice(0, 8) : e.actor_kind}</div>
          {e.reason_code && <div className="cause">reason: {e.reason_code}{e.reason_text ? ` — ${e.reason_text}` : ''}</div>}
        </li>
      ))}
      {nexts.map((label, i) => (
        <li key={`fut-${i}`} className="fut">
          <span className="dot" />
          <div className="what">{label}</div>
          <div className="who">not yet</div>
        </li>
      ))}
    </ul>
  );
}

function Terms({ chain, fields }: { chain: ChainDecl | null; fields: Record<string, Json> }) {
  const entries = Object.entries(fields).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object');
  if (entries.length === 0) return <div className="v2-empty" style={{ padding: 'var(--sp-4)' }}>No terms recorded.</div>;
  return (
    <ul className="v2-terms">
      {entries.map(([k, v]) => {
        const f = chain?.fields[k];
        return (
          <li key={k}>
            <span className="k">{f ? fieldLabel(k, f) : k.replace(/_/g, ' ')}</span>
            <span className="val">{typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)}</span>
          </li>
        );
      })}
      {chain?.timers?.map((t, i) => (
        <li key={`t-${i}`}>
          <span className="k">SLA · {t.fire}</span>
          <span className="val">{fmtDuration(t.after)}</span>
        </li>
      ))}
    </ul>
  );
}
