// pages/src/meridian/ThreadPage.tsx — Meridian Thread: two-sided case view.
// Markup follows mockups/meridian/02-thread.html (header / case body + state rail / actbar);
// styling from meridian.css (scoped under .mer). Data from GET /api/thread/:chainKey/:id —
// any role with a lane sees the same facts; write actions are role-filtered server-side,
// so the counterparty gets no .actbar at all.
import React from 'react';
import './meridian.css';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtZar, humanizeKey, type LedgerActionField } from '../shared/lib';
import { statusLabel, STATUS_TONE_CLASS } from './ease/statusLabel';
import { FieldForm } from './FieldForm';
import { FuseBar } from './components';
import { cleanLabel } from './labels';
import { MeridianHeader } from './MeridianHeader';
import { GuidedTour } from './GuidedTour';
import { getLegacyCoverage } from '../v2/api';

// Format a raw case-record value for the L5 audit surface. Conservative on money:
// ZAR only when the key clearly names it (this domain uses a consistent `_zar`
// suffix — quantum_zar, settlement_paid_zar, …), so a field named `value` is never
// wrongly stamped with R (the trap the old Ledger column-name regex fell into).
// ISO timestamps → readable, booleans → Yes/No, snake_case enums → humanized.
// ponytail: heuristic display-only; the real fix is a server-provided `unit` per
// field (as the Ledger/KPI shape now carries) — swap to that when raw ships units.
function fmtRawValue(k: string, v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return /zar/i.test(k) ? fmtZar(v) : v.toLocaleString('en-ZA');
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:/.test(v)) return v.slice(0, 16).replace('T', ' ');       // ISO datetime
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;                                             // ISO date
    if (/zar/i.test(k) && /^-?\d+(\.\d+)?$/.test(v)) return fmtZar(Number(v));               // money-as-string
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v)) return humanizeKey(v);                       // snake_case enum
    return v;
  }
  return String(v);
}

interface ThreadData {
  chain: { key: string; wave: number; title: string };
  case: { id: string; ref: string; title: string; status: string; deadline_at: string | null;
          quantum_zar: number | null; counterparty: string | null; raw: Record<string, unknown> };
  events: { event_type?: string; created_at?: string; actor_role?: string; note?: string }[];
  actions: { action: string; label: string; path: string; cascadeHint: string; tone?: string; fields?: LedgerActionField[];
             method?: string; body?: Record<string, unknown> }[];
  viewer_role: string;
  signatories?: { id: string; participant_id: string; signatory_name: string | null;
                  signatory_designation: string | null; signed: number; signed_at: string | null }[];
  can_manage_signatories?: boolean;
}

export default function ThreadPage() {
  const { chainKey = '', id = '' } = useParams();
  const nav = useNavigate();
  const [t, setT] = React.useState<ThreadData | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);          // load failure — replaces the page
  const [actErr, setActErr] = React.useState<string | null>(null);    // action failure — thread stays rendered
  const [formAction, setFormAction] = React.useState<ThreadData['actions'][number] | null>(null); // open action-form drawer

  // v2 cutover check (CUTOVER_COVERAGE.md §6): v2-covered chains redirect to
  // /v2/t/:id — v2 txn_id is the verbatim v1 row id, so no id translation needed.
  const [covered, setCovered] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let live = true;
    getLegacyCoverage().then((m) => {
      if (!live) return;
      if (chainKey in m) nav(`/v2/t/${id}`, { replace: true });
      else setCovered(false);
    });
    return () => { live = false; };
  }, [chainKey, id, nav]);

  const load = React.useCallback(() =>
    api.get(`/thread/${chainKey}/${id}`).then(r => setT(r.data.data)).catch(e => setErr(String(e))),
  [chainKey, id]);
  React.useEffect(() => { if (covered === false) load(); }, [load, covered]);

  // Deep-link from the Horizon board: ?act=<action> opens that action's FieldForm
  // drawer once the thread has loaded. Once-only (ref guard) so firing the action —
  // which reloads `t` — doesn't re-pop the drawer.
  const [sp] = useSearchParams();
  const actOpened = React.useRef(false);
  React.useEffect(() => {
    if (actOpened.current || !t) return;
    const want = sp.get('act');
    if (!want) return;
    const a = t.actions.find(x => x.action === want);
    if (a?.fields?.length) { setFormAction(a); actOpened.current = true; }
  }, [sp, t]);

  // Escape-to-dismiss + focus-restore for the action-form veil (LedgerPage idiom).
  React.useEffect(() => {
    if (!formAction) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFormAction(null); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [formAction]);

  async function fire(a: ThreadData['actions'][number], body: Record<string, unknown>) {
    setBusy(a.action);
    // api has baseURL '/api', so strip the prefix the registry paths carry.
    try {
      const url = a.path.replace('/api', '').replace(':id', id);
      // Verb-in-body chains carry their fixed transition verb in a.body; merge it
      // AFTER user values so it always wins. PUT only when the descriptor says so.
      const payload = { ...body, ...(a.body ?? {}) };
      await (a.method === 'PUT' ? api.put(url, payload) : api.post(url, payload));
      setActErr(null); // success clears any previous action error
      await load();
    } catch (e: any) {
      // State machines return 409 with a reason for invalid transitions —
      // surface the server's {error} text; keep the thread rendered.
      setActErr(e?.response?.data?.error ?? e?.message ?? 'Action failed');
    } finally { setBusy(null); }
  }

  async function sign() {
    setBusy('__sign__');
    try {
      await api.post(`/thread/${chainKey}/${id}/sign`, {});
      setActErr(null);
      await load();
    } catch (e: any) {
      setActErr(e?.response?.data?.error ?? 'Sign failed');
    } finally { setBusy(null); }
  }

  async function addSignatory(form: { participant_id: string; signatory_name: string; signatory_designation: string }) {
    setBusy('__add_sig__');
    try {
      await api.post(`/thread/${chainKey}/${id}/signatories`, form);
      setActErr(null);
      await load();
    } catch (e: any) {
      setActErr(e?.response?.data?.error ?? 'Could not add signatory');
    } finally { setBusy(null); }
  }

  if (err) {
    // Keep the chrome — a chromeless failure reads as a crashed app and strands
    // the operator (no ⌘K, no account menu). Same idiom as the Ledger dead-end.
    return (
      <div className="mer thread">
        <MeridianHeader ctx={<b>Thread</b>} />
        <div className="mer-deadend" role="alert">
          <span className="mer-deadend-glyph" aria-hidden="true">⌁</span>
          <p className="mer-deadend-ttl">This thread failed to load.</p>
          <p className="mer-deadend-sub">Press <kbd>⌘K</kbd> to search everything you can reach.</p>
          <div className="mer-error-acts">
            <button type="button" className="btn pri" onClick={() => { setErr(null); load(); }}>Retry</button>
            <Link to="/cockpit" className="btn ghost">Back to your cockpit</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!t) return (
    <div className="mer thread" aria-busy="true" role="status" aria-label="Loading thread">
      <div style={{ padding: '20px 24px', maxWidth: 880 }}>
        <div className="skel skel-line lg" style={{ width: '42%', marginBottom: 10 }} />
        <div className="skel skel-line sm" style={{ width: '26%', marginBottom: 22 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="skel skel-card" style={{ height: 200 }} />
          <div className="skel skel-card" style={{ height: 200 }} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="mer thread">
      <MeridianHeader ctx={<>
        <Link to={`/ledger/${chainKey}`} className="back crumb" title={`All ${cleanLabel(t.chain.title)} cases`}>
          {cleanLabel(t.chain.title)}
        </Link>
        <span className="mono ref">{t.case.ref}</span>
        <span className="mono zar m3">{fmtZar(t.case.quantum_zar)}</span>
      </>} />

      <GuidedTour surface="thread" />

      <main className="mer-main">
        <section className="case-body">
          <div className="case-head">
            <h1>{t.case.title}</h1>
            <div className="case-sub">
              {(() => {
                const s = statusLabel(t.case.status);
                return <span className={STATUS_TONE_CLASS[s.tone]}>{s.text}</span>;
              })()}
              <span>{cleanLabel(t.chain.title)}</span>
              {t.case.counterparty && <span>↔ {t.case.counterparty}</span>}
            </div>
            <FuseBar deadline={t.case.deadline_at} />
          </div>

          {t.events.length > 0 && (
            <ol className="state-rail">
              {t.events.map((e, i) => (
                <li key={`${e.created_at ?? ''}-${e.event_type ?? ''}-${i}`} className="state done">
                  <span className="mono">{e.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  <b>{humanizeKey(e.event_type ?? '', true)}</b>
                  {e.actor_role && <span className="actor">{humanizeKey(e.actor_role)}</span>}
                </li>
              ))}
              <li className="state now"><b>{statusLabel(t.case.status).text}</b></li>
            </ol>
          )}

          <details className="raw-fields">
            <summary>Case record</summary>
            <dl>
              {Object.entries(t.case.raw)
                .filter(([k, v]) => v != null && !['id'].includes(k))
                .map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{humanizeKey(k, true)}</dt><dd className="mono">{fmtRawValue(k, v)}</dd>
                  </React.Fragment>
                ))}
            </dl>
          </details>

          {(t.signatories?.length || t.can_manage_signatories) ? (
            <SignPanel
              signatories={t.signatories ?? []}
              canManage={!!t.can_manage_signatories}
              busy={busy}
              onSign={sign}
              onAdd={addSignatory}
            />
          ) : null}
        </section>
      </main>

      {t.actions.length > 0 && (
        <footer className="actbar">
          {actErr && (
            <div className="act-error" role="alert">
              <span>{actErr}</span>
              <button type="button" className="btn ghost" onClick={() => setActErr(null)}>Dismiss</button>
            </div>
          )}
          {/* ponytail: single action shows its own hint; with rival actions a generic prompt avoids mislabelling */}
          <div className="cascade-preview">{t.actions.length === 1 ? t.actions[0].cascadeHint : 'Pick an action below. Hover any button to preview its effect.'}</div>
          <div className="actbar-btns">
            {/* Actions arrive ranked — only the top one is filled so a chain with
               a dozen legal transitions reads as a next step + alternatives, not
               a wall of identical primary buttons. Destructive stays oxide. */}
            {t.actions.map((a, ai) => (
              <button key={a.action} type="button" disabled={busy !== null}
                      className={`btn ${a.tone === 'oxide' ? 'ox' : ai === 0 ? 'pri' : 'quiet'}`}
                      title={a.cascadeHint} onClick={() => {
                        if (a.fields?.length) { setFormAction(a); return; }
                        // Destructive (oxide) transitions confirm before firing — matches the
                        // Horizon board idiom; a fieldless reject/terminate is otherwise one click.
                        if (a.tone === 'oxide' && !window.confirm(`${a.label} — ${t.case.ref}?\nThis transition may be hard to reverse.`)) return;
                        fire(a, {});
                      }}>
                {busy === a.action ? '…' : a.label}
              </button>
            ))}
          </div>
        </footer>
      )}

      {/* Action-form veil drawer — schema-driven for actions carrying a fields schema. */}
      {formAction && (
        <div className="mer veil" onClick={() => setFormAction(null)}>
          <div className="veil-body" role="dialog" aria-modal="true" aria-label={formAction.label}
               onClick={e => e.stopPropagation()}>
            <FieldForm
              fields={formAction.fields ?? []}
              submitLabel={formAction.label}
              ariaLabel={formAction.label}
              cascadeHint={formAction.cascadeHint}
              onSubmit={async (values) => {
                const url = formAction.path.replace('/api', '').replace(':id', id);
                const payload = { ...values, ...(formAction.body ?? {}) };
                await (formAction.method === 'PUT' ? api.put(url, payload) : api.post(url, payload));
                setFormAction(null);
                await load();
              }}
              onCancel={() => setFormAction(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Signature ceremony panel — hash-bound, vault-backed roster for the chain entity.
// Lists each signatory's state; one "Sign" button signs as the current user
// (server 403s if they're not on the roster). Writer roles get a minimal add form.
type Sigs = NonNullable<ThreadData['signatories']>;
function SignPanel(props: {
  signatories: Sigs;
  canManage: boolean;
  busy: string | null;
  onSign: () => void;
  onAdd: (f: { participant_id: string; signatory_name: string; signatory_designation: string }) => void;
}) {
  const { signatories, canManage, busy, onSign, onAdd } = props;
  const [open, setOpen] = React.useState(false);
  const [pid, setPid] = React.useState('');
  const [name, setName] = React.useState('');
  const [desig, setDesig] = React.useState('');
  const pending = signatories.filter(s => !s.signed).length;

  return (
    <section className="sign-panel">
      <div className="sign-head">
        <b>Signatures</b>
        <span className="chip">{pending === 0 && signatories.length > 0 ? 'All signed' : `${signatories.length - pending}/${signatories.length} signed`}</span>
      </div>
      {signatories.length > 0 && (
        <ul className="sign-list">
          {signatories.map(s => (
            <li key={s.id} className={s.signed ? 'signed' : 'pending'}>
              <span>{s.signatory_name || s.participant_id}{s.signatory_designation ? ` · ${s.signatory_designation}` : ''}</span>
              <span className="mono">{s.signed ? `signed ${s.signed_at?.slice(0, 16).replace('T', ' ') ?? ''}` : 'pending'}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="sign-acts">
        <button type="button" className="btn pri" disabled={busy !== null || pending === 0} onClick={onSign}>
          {busy === '__sign__' ? '…' : 'Sign'}
        </button>
        {canManage && (
          <button type="button" className="btn ghost" disabled={busy !== null} onClick={() => setOpen(o => !o)}>
            {open ? 'Cancel' : 'Add signatory'}
          </button>
        )}
      </div>
      {canManage && open && (
        <form
          className="sign-add"
          onSubmit={e => {
            e.preventDefault();
            if (!pid.trim()) return;
            onAdd({ participant_id: pid.trim(), signatory_name: name.trim(), signatory_designation: desig.trim() });
            setPid(''); setName(''); setDesig(''); setOpen(false);
          }}
        >
          <input value={pid} onChange={e => setPid(e.target.value)} placeholder="Participant ID" aria-label="Participant ID" />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" aria-label="Signatory name" />
          <input value={desig} onChange={e => setDesig(e.target.value)} placeholder="Designation" aria-label="Designation" />
          <button type="submit" className="btn pri" disabled={busy !== null || !pid.trim()}>Add</button>
        </form>
      )}
    </section>
  );
}
