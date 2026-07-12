// ═══════════════════════════════════════════════════════════════════════════
// TransitionForm — the ONLY form component. Input UI is ALWAYS generated from
// the FieldDecl declaration (REBUILD_FRONTEND §7: "There is no exception for
// input"). Four field types exist server-side: string | number | boolean |
// party. Nothing bespoke.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import type { FieldDecl, TransitionDecl, Json } from './decl';
import { fieldLabel } from './decl';

interface Props {
  t: TransitionDecl;
  busy?: boolean;
  error?: string; // a rejection code/message surfaced in place
  // Counterparties already on THIS txn — typeahead for `party` fields.
  // ponytail: still no global participant directory endpoint; this only surfaces
  // parties already on the current txn. Add a real /v2 lookup for full search.
  knownParties?: { id: string; label: string }[];
  onSubmit: (input: Record<string, Json>, reason?: { code: string; text?: string }) => void;
  onCancel?: () => void;
}

function coerce(f: FieldDecl, raw: string | boolean): Json {
  if (f.type === 'boolean') return Boolean(raw);
  if (f.type === 'number') return raw === '' ? null : Number(raw);
  return String(raw); // string + party (participant id)
}

function validate(fields: [string, FieldDecl][], vals: Record<string, string | boolean>): string | null {
  for (const [name, f] of fields) {
    const v = vals[name];
    const empty = v === '' || v === undefined || v === null;
    if (f.required && f.type !== 'boolean' && empty) return `${fieldLabel(name, f)} is required`;
    if (f.type === 'number' && !empty) {
      const n = Number(v);
      if (Number.isNaN(n)) return `${fieldLabel(name, f)} must be a number`;
      if (f.min !== undefined && n < f.min) return `${fieldLabel(name, f)} must be ≥ ${f.min}`;
      if (f.max !== undefined && n > f.max) return `${fieldLabel(name, f)} must be ≤ ${f.max}`;
    }
  }
  return null;
}

export function TransitionForm({ t, busy, error, knownParties, onSubmit, onCancel }: Props) {
  const fields = useMemo(() => Object.entries(t.input ?? {}), [t]);
  const needsReason = (t.requiresReason?.length ?? 0) > 0;

  const [vals, setVals] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    for (const [name, f] of fields) init[name] = f.type === 'boolean' ? false : '';
    return init;
  });
  const [reasonCode, setReasonCode] = useState<string>(t.requiresReason?.[0] ?? '');
  const [reasonText, setReasonText] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);

  const set = (name: string, v: string | boolean) => setVals((s) => ({ ...s, [name]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate(fields, vals);
    if (err) { setLocalErr(err); return; }
    if (needsReason && !reasonCode) { setLocalErr('A reason code is required'); return; }
    setLocalErr(null);
    const input: Record<string, Json> = {};
    for (const [name, f] of fields) input[name] = coerce(f, vals[name]);
    onSubmit(input, needsReason ? { code: reasonCode, text: reasonText || undefined } : undefined);
  };

  return (
    <form className="v2-form" onSubmit={submit}>
      {fields.map(([name, f]) => (
        <Field key={name} name={name} f={f} value={vals[name]} knownParties={knownParties} onChange={(v) => set(name, v)} />
      ))}

      {needsReason && (
        <div className="v2-field">
          <label htmlFor="v2-reason">Reason <span className="req">*</span></label>
          <select
            id="v2-reason"
            className="v2-select"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
          >
            {t.requiresReason!.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <input
            className="v2-input"
            style={{ marginTop: 8 }}
            placeholder="Add context (optional)"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
          />
        </div>
      )}

      {(localErr || error) && (
        <p className="v2-err">{localErr || error}</p>
      )}

      <div className="v2-actions">
        <button type="submit" className={`v2-btn ${t.intent === 'destructive' ? 'v2-btn-destructive' : 'v2-btn-primary'}`} disabled={busy}>
          {busy ? 'Working…' : t.label}
        </button>
        {onCancel && (
          <button type="button" className="v2-btn v2-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        )}
      </div>
    </form>
  );
}

function Field({ name, f, value, knownParties, onChange }: { name: string; f: FieldDecl; value: string | boolean; knownParties?: { id: string; label: string }[]; onChange: (v: string | boolean) => void }) {
  const label = fieldLabel(name, f);
  const id = `v2-f-${name}`;

  if (f.type === 'boolean') {
    return (
      <div className="v2-field">
        <label className="v2-switch" htmlFor={id}>
          <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {label}
        </label>
      </div>
    );
  }

  if (f.type === 'party') {
    // Identify the counterparty by participant id (still free text — any id is
    // valid). The datalist just offers a typeahead of parties already on this txn.
    // ponytail: no global participant directory endpoint in /v2 — this only
    // surfaces parties already on THIS txn. Swap for a real lookup when exposed.
    const listId = knownParties && knownParties.length ? `${id}-parties` : undefined;
    return (
      <div className="v2-field">
        <label htmlFor={id}>{label} {f.required && <span className="req">*</span>}</label>
        <input
          id={id}
          className="v2-input mono"
          list={listId}
          placeholder={`${f.role || 'counterparty'} participant id`}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
        {listId && (
          <datalist id={listId}>
            {knownParties!.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </datalist>
        )}
      </div>
    );
  }

  return (
    <div className="v2-field">
      <label htmlFor={id}>{label} {f.required && <span className="req">*</span>}</label>
      <input
        id={id}
        className={`v2-input ${f.type === 'number' ? 'mono' : ''}`}
        type={f.type === 'number' ? 'number' : 'text'}
        inputMode={f.type === 'number' ? 'decimal' : undefined}
        min={f.min}
        max={f.max}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
