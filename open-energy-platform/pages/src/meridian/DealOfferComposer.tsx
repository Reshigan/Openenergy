// pages/src/meridian/DealOfferComposer.tsx — Meridian Deal Desk publish composer.
// Renders a schema-driven form (.composer) with a live ZAR-equivalent preview and a
// cascade-hint stating what publishing fires. Markup matches meridian.css (.composer
// .field/label/input/select, .preview, .cascade-hint; .btn .pri/.ghost). Pure form
// state; the parent owns publishing via onPublish.
import React from 'react';
import { fmtZar, type DealKind, type DealFieldSpec } from './lib';

// A unit reads as monetary if it mentions ZAR or rands ('R…', 'R/MWh' etc.).
function isMonetary(unit?: string): boolean {
  if (!unit) return false;
  const u = unit.toLowerCase();
  return u.includes('zar') || u.includes('r/') || /(^|[^a-z])r([^a-z]|$)/.test(u);
}

export function DealOfferComposer({ dealType, kind, schema, mode, onPublish, onCancel }:
  { dealType: string; kind: DealKind; schema: DealFieldSpec[]; mode: 'offer' | 'request';
    onPublish: (values: Record<string, unknown>, meta: Record<string, unknown>) => Promise<void>;
    onCancel: () => void }) {
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const set = (key: string, v: unknown) => setValues(prev => ({ ...prev, [key]: v }));

  // Live ZAR preview: sum numeric fields carrying a monetary unit.
  const zarTotal = schema.reduce((sum, s) => {
    if (s.type !== 'number' || !isMonetary(s.unit)) return sum;
    const n = Number(values[s.key]);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
  const hasMonetary = schema.some(s => s.type === 'number' && isMonetary(s.unit));

  const cascadeHint = mode === 'offer'
    ? 'Publishing fires deal.offer.published → notifies matching demand parties.'
    : 'Publishing fires deal.request.published → opens this to providers.';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const miss = new Set<string>();
    for (const s of schema) {
      if (!s.required) continue;
      const v = values[s.key];
      // Booleans are always "supplied" (checked or not); other types must be non-empty.
      if (s.type !== 'boolean' && (v == null || v === '')) miss.add(s.key);
    }
    if (miss.size) { setMissing(miss); return; }
    setMissing(new Set());
    setErr(null);
    setSubmitting(true);
    try {
      // Coerce to declared types before handing off to the parent's publisher.
      const out: Record<string, unknown> = {};
      for (const s of schema) {
        const v = values[s.key];
        if (s.type === 'number') out[s.key] = v === '' || v == null ? null : Number(v);
        else if (s.type === 'boolean') out[s.key] = Boolean(v);
        else out[s.key] = v ?? (s.type === 'enum' ? (s.options?.[0] ?? '') : '');
      }
      await onPublish(out, {});
    } catch (e: unknown) {
      const r = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(r?.response?.data?.error ?? r?.message ?? 'Publish failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="composer" onSubmit={submit} aria-label={`Publish ${mode} — ${dealType} (${kind})`}>
      {schema.map(s => {
        const id = `deal-${s.key}`;
        const errId = `${id}-err`;
        const flag = missing.has(s.key);
        // Error is conveyed programmatically (aria-invalid + aria-describedby), not by border colour alone.
        const errProps = flag ? { 'aria-invalid': true, 'aria-describedby': errId } : undefined;
        return (
          <div className={flag ? 'field flag' : 'field'} key={s.key}>
            <label htmlFor={id}>
              {s.label}{s.required && ' *'}
              {s.unit && <span className="mono"> · {s.unit}</span>}
            </label>
            {s.type === 'number' && (
              <input id={id} type="number" inputMode="decimal"
                     value={(values[s.key] as string) ?? ''}
                     onChange={e => set(s.key, e.target.value)} {...errProps} />
            )}
            {s.type === 'string' && (
              <input id={id} type="text"
                     value={(values[s.key] as string) ?? ''}
                     onChange={e => set(s.key, e.target.value)} {...errProps} />
            )}
            {s.type === 'date' && (
              <input id={id} type="date"
                     value={(values[s.key] as string) ?? ''}
                     onChange={e => set(s.key, e.target.value)} {...errProps} />
            )}
            {s.type === 'enum' && (
              <select id={id} value={(values[s.key] as string) ?? ''}
                      onChange={e => set(s.key, e.target.value)} {...errProps}>
                <option value="" disabled>Select…</option>
                {(s.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {s.type === 'boolean' && (
              <input id={id} type="checkbox"
                     checked={Boolean(values[s.key])}
                     onChange={e => set(s.key, e.target.checked)} {...errProps} />
            )}
            {flag && <span id={errId} className="mono field-required">required</span>}
          </div>
        );
      })}

      <div className="preview" aria-live="polite">
        {hasMonetary ? <>ZAR equivalent · <b>{fmtZar(zarTotal)}</b></> : 'Ready to publish'}
      </div>

      <div className="cascade-hint">{cascadeHint}</div>

      {err && (
        <div className="act-error" role="alert">
          <span>{err}</span>
        </div>
      )}

      <div className="actbar-btns">
        <button type="submit" className="btn pri" disabled={submitting}>
          {submitting
            ? (mode === 'offer' ? 'Publishing offer…' : 'Publishing request…')
            : (mode === 'offer' ? 'Publish offer' : 'Publish request')}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
      </div>
    </form>
  );
}
