// pages/src/meridian/FieldForm.tsx — Meridian shared schema-driven action form.
// Renders a LedgerActionField[] schema (.composer classes), validates required fields
// client-side, coerces values to declared types, and calls onSubmit with a plain values
// object. Used by the Thread action drawer and the Ledger "+ New" drawer.
import React from 'react';
import type { LedgerActionField, LookupOption } from './lib';
import { fetchLookup, humanizeKey } from './lib';
import { cleanLabel } from './labels';

export function FieldForm({ fields, prefill, submitLabel, cascadeHint, ariaLabel, onSubmit, onCancel }: {
  fields: LedgerActionField[];
  prefill?: Record<string, unknown>;
  submitLabel: string;
  cascadeHint?: string;
  ariaLabel?: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = React.useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of fields) {
      // explicit defaultFrom alias wins; else autofill by the field's own key
      const v = (f.defaultFrom && prefill?.[f.defaultFrom] != null) ? prefill[f.defaultFrom]
              : (prefill?.[f.key] != null ? prefill[f.key] : undefined);
      if (v !== undefined) init[f.key] = v;
    }
    return init;
  });
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Lookup-field options keyed by field key; '' value while loading, [] on error.
  const [lookups, setLookups] = React.useState<Record<string, LookupOption[] | undefined>>({});
  const [lookupErr, setLookupErr] = React.useState<Record<string, string>>({});

  const set = (key: string, v: unknown) => setValues(prev => ({ ...prev, [key]: v }));

  // ponytail: move focus into the dialog on open by focusing the first control.
  // Covers the a11y "focus enters modal" rule; full Tab-trap is the upgrade path.
  const formRef = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
  }, []);

  // Populate lookup pickers on mount from each field's source endpoint.
  React.useEffect(() => {
    let live = true;
    for (const f of fields) {
      if (f.type !== 'lookup' || !f.source) continue;
      fetchLookup(f.source)
        .then(opts => { if (live) setLookups(prev => ({ ...prev, [f.key]: opts })); })
        .catch(() => { if (live) { setLookups(prev => ({ ...prev, [f.key]: [] })); setLookupErr(prev => ({ ...prev, [f.key]: 'Could not load options' })); } });
    }
    return () => { live = false; };
    // fields is a stable per-render schema; key off its keys to avoid re-fetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.map(f => `${f.key}:${f.source ?? ''}`).join('|')]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss = new Set<string>();
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.key];
      // Booleans are always "supplied" (checked or not); other types must be non-empty.
      if (f.type !== 'boolean' && (v == null || v === '')) miss.add(f.key);
    }
    if (miss.size) { setMissing(miss); return; }
    setMissing(new Set());
    setErr(null);
    setSubmitting(true);
    try {
      // Coerce to declared types before handing off to parent.
      const out: Record<string, unknown> = {};
      for (const f of fields) {
        const v = values[f.key];
        if (f.type === 'number') out[f.key] = v === '' || v == null ? null : Number(v);
        else if (f.type === 'boolean') out[f.key] = Boolean(v);
        else if (f.type === 'enum') out[f.key] = v ?? (f.options?.[0] ?? '');
        else out[f.key] = v != null ? String(v) : '';
      }
      await onSubmit(out);
    } catch (e: unknown) {
      const r = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(r?.response?.data?.error ?? r?.message ?? 'Action failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form ref={formRef} className="composer" onSubmit={submit} aria-label={ariaLabel ?? submitLabel}>
      {fields.map(f => {
        const id = `ff-${f.key}`;
        const errId = `${id}-err`;
        const flag = missing.has(f.key);
        const errProps = flag ? { 'aria-invalid': true as const, 'aria-describedby': errId } : undefined;
        return (
          <div className={flag ? 'field flag' : 'field'} key={f.key}>
            <label htmlFor={id}>
              {cleanLabel(f.label)}{f.required && ' *'}
              {f.unit && <span className="mono"> · {f.unit}</span>}
            </label>
            {f.type === 'number' && (
              <input id={id} type="number" inputMode="decimal"
                     value={(values[f.key] as string) ?? ''}
                     placeholder={f.placeholder}
                     onChange={e => set(f.key, e.target.value)} {...errProps} />
            )}
            {f.type === 'string' && (
              <input id={id} type="text"
                     value={(values[f.key] as string) ?? ''}
                     placeholder={f.placeholder}
                     onChange={e => set(f.key, e.target.value)} {...errProps} />
            )}
            {f.type === 'date' && (
              <input id={id} type="date"
                     value={(values[f.key] as string) ?? ''}
                     onChange={e => set(f.key, e.target.value)} {...errProps} />
            )}
            {f.type === 'enum' && (
              <select id={id} value={(values[f.key] as string) ?? ''}
                      onChange={e => set(f.key, e.target.value)} {...errProps}>
                <option value="" disabled>Select…</option>
                {(f.options ?? []).map(o => <option key={o} value={o}>{humanizeKey(o, true)}</option>)}
              </select>
            )}
            {f.type === 'boolean' && (
              <input id={id} type="checkbox"
                     checked={Boolean(values[f.key])}
                     onChange={e => set(f.key, e.target.checked)} {...errProps} />
            )}
            {f.type === 'evidence' && (
              <textarea id={id} rows={3}
                        value={(values[f.key] as string) ?? ''}
                        placeholder={f.placeholder}
                        onChange={e => set(f.key, e.target.value)} {...errProps} />
            )}
            {f.type === 'lookup' && (
              <select id={id} value={(values[f.key] as string) ?? ''}
                      onChange={e => set(f.key, e.target.value)}
                      disabled={lookups[f.key] === undefined} {...errProps}>
                <option value="" disabled>
                  {lookups[f.key] === undefined ? 'Loading…' : 'Select…'}
                </option>
                {(lookups[f.key] ?? []).map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            )}
            {f.type === 'lookup' && lookupErr[f.key] && (
              <span className="mono field-required">{lookupErr[f.key]}</span>
            )}
            {flag && <span id={errId} className="mono field-required">required</span>}
          </div>
        );
      })}

      {cascadeHint && <div className="cascade-hint">{cascadeHint}</div>}

      {err && (
        <div className="act-error" role="alert">
          <span>{err}</span>
        </div>
      )}

      <div className="actbar-btns">
        <button type="submit" className="btn pri" disabled={submitting}>
          {submitting ? `${submitLabel}…` : submitLabel}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
    </form>
  );
}
