import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Check, Lightbulb } from 'lucide-react';
import type { FieldSpec } from './WorkstationShell';

export type WizardStep = {
  title: string;
  description?: string;  // shown as a light context paragraph beneath the step title
  fields: FieldSpec[];
  aiHint?: string;        // optional static AI tip shown as an inline card for this step
};

export type WizardSpec = {
  id: string;
  title: string;
  subtitle?: string;
  steps: WizardStep[];
  submitLabel?: string;
  cta?: 'primary' | 'danger';
  onSubmit: (values: Record<string, string>) => Promise<void>;
};

type LookupOption = { value: string; label: string; [k: string]: unknown };

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ steps, current }: { steps: WizardStep[]; current: number }) {
  return (
    <div className="flex items-start gap-0 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 52 }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all"
              style={{
                background: i < current ? '#1a8a5b' : i === current ? '#0f1c2e' : '#f1f4f8',
                borderColor: i < current ? '#1a8a5b' : i === current ? '#0f1c2e' : '#dde4ec',
                color: i <= current ? '#fff' : '#9aa6b4',
              }}
            >
              {i < current ? <Check size={12} /> : i + 1}
            </div>
            <div
              className="text-[9px] mt-0.5 text-center leading-tight px-1"
              style={{ color: i === current ? '#0f1c2e' : '#9aa6b4', maxWidth: 56 }}
            >
              {s.title}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div
              className="flex-1 h-[2px] mt-3.5 mx-0.5 rounded"
              style={{ background: i < current ? '#1a8a5b' : '#dde4ec', minWidth: 12 }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Field renderer (replicates ActionModal logic) ───────────────────────────
const FIELD_CLS = 'mt-1 w-full px-3 py-2 border border-[var(--oe-surface-container-high)] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] text-[13px]';

function FieldInput({
  f,
  value,
  onChange,
  lookupOpts,
  lookupLoading,
}: {
  f: FieldSpec;
  value: string;
  onChange: (v: string) => void;
  lookupOpts: Record<string, LookupOption[]>;
  lookupLoading: boolean;
}) {
  if (f.type === 'textarea') {
    return <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={f.placeholder} className={FIELD_CLS + ' resize-none'} />;
  }
  if (f.type === 'select') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className={FIELD_CLS}>
        <option value="">— select —</option>
        {(f.options || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (f.type === 'lookup') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className={FIELD_CLS}>
        <option value="">{lookupLoading ? 'Loading…' : '— select —'}</option>
        {(lookupOpts[f.key] || []).map(o => (
          <option key={String(o.value)} value={String(o.value)}>{String(o.label)}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={f.placeholder}
      className={FIELD_CLS}
    />
  );
}

// ─── Main WizardModal ─────────────────────────────────────────────────────────
export function WizardModal({
  spec,
  onClose,
}: {
  spec: WizardSpec;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    spec.steps.forEach(s => s.fields.forEach(f => { init[f.key] = f.defaultValue || ''; }));
    return init;
  });
  const [lookupOpts, setLookupOpts] = useState<Record<string, LookupOption[]>>({});
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Fetch ALL lookup fields across ALL steps on mount
  useEffect(() => {
    const allLookup = spec.steps.flatMap(s =>
      s.fields.filter(f => f.type === 'lookup' && f.lookupEndpoint)
    );
    if (!allLookup.length) return;
    setLookupLoading(true);
    const token = localStorage.getItem('token') || '';
    Promise.all(
      allLookup.map(f =>
        fetch(f.lookupEndpoint!, { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json() as Promise<{ data: LookupOption[] }>)
          .then(d => ({ key: f.key, opts: Array.isArray(d.data) ? d.data : [] }))
          .catch(() => ({ key: f.key, opts: [] as LookupOption[] }))
      )
    ).then(results => {
      const map: Record<string, LookupOption[]> = {};
      results.forEach(({ key, opts }) => { map[key] = opts; });
      setLookupOpts(map);
      setLookupLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard: Esc closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const currentStep = spec.steps[stepIndex];
  const isLast = stepIndex === spec.steps.length - 1;

  const update = (k: string, v: string) => {
    setValues(prev => {
      const next = { ...prev, [k]: v };
      const field = currentStep.fields.find(f => f.key === k);
      if (field?.type === 'lookup' && field.lookupAutoFill && v) {
        const selected = (lookupOpts[k] || []).find(o => String(o.value) === v);
        if (selected) {
          Object.entries(field.lookupAutoFill).forEach(([tk, sk]) => {
            next[tk] = String(selected[sk] ?? '');
          });
        }
      }
      return next;
    });
    setErr(null);
  };

  const advance = async () => {
    const missing = currentStep.fields.filter(f => f.required && !values[f.key]?.trim());
    if (missing.length) {
      setErr(`Required: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setErr(null);
    if (isLast) {
      setSaving(true);
      try {
        await spec.onSubmit(values);
        setSaved(true);
        setTimeout(onClose, 900);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Submit failed');
      } finally {
        setSaving(false);
      }
    } else {
      setStepIndex(i => i + 1);
    }
  };

  const btnBg = spec.cta === 'danger' ? '#c0392b' : '#0f1c2e';

  return (
    <AnimatePresence>
      <motion.div
        key="wizard-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(10,20,34,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          ref={dialogRef}
          key="wizard-panel"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: '#fff', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        >
          {/* Header */}
          <div
            className="px-6 py-4 border-b flex items-start justify-between gap-3"
            style={{ borderColor: '#e5ebf2', background: 'linear-gradient(135deg,#0a1c30 0%,#1a3a5c 100%)', color: '#fff' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                {spec.steps.length}-step wizard
              </div>
              <div className="mt-0.5 text-[17px] font-bold leading-tight">{spec.title}</div>
              {spec.subtitle && (
                <div className="mt-0.5 text-[12px] text-white/65">{spec.subtitle}</div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 p-1.5 rounded-md hover:bg-white/10 transition-colors"
              aria-label="Close wizard"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: 'none' }}>
            {/* Step indicator */}
            <StepIndicator steps={spec.steps} current={stepIndex} />

            {/* Step header */}
            <div className="mb-4">
              <h3 className="text-[15px] font-bold" style={{ color: '#0f1c2e' }}>
                {currentStep.title}
              </h3>
              {currentStep.description && (
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: '#6b7685' }}>
                  {currentStep.description}
                </p>
              )}
            </div>

            {/* AI hint card (if present) */}
            {currentStep.aiHint && (
              <div
                className="flex items-start gap-2.5 rounded-xl p-3 mb-4"
                style={{ background: '#fffbf0', border: '1px solid #f0e4a8' }}
              >
                <Lightbulb size={14} style={{ color: '#b04e0f', flexShrink: 0, marginTop: 1 }} />
                <p className="text-[11px] leading-relaxed" style={{ color: '#6b3a12' }}>
                  {currentStep.aiHint}
                </p>
              </div>
            )}

            {/* Error */}
            {err && (
              <div className="mb-3 text-[12px] text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert">
                {err}
              </div>
            )}

            {/* Fields */}
            <div className="space-y-3">
              {currentStep.fields.map(f => (
                <label key={f.key} className="block text-[13px]">
                  <span className="font-medium" style={{ color: '#3a4658' }}>
                    {f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}
                  </span>
                  <FieldInput
                    f={f}
                    value={values[f.key] ?? ''}
                    onChange={v => update(f.key, v)}
                    lookupOpts={lookupOpts}
                    lookupLoading={lookupLoading}
                  />
                  {f.helperText && (
                    <span className="block mt-0.5 text-[10px]" style={{ color: '#9aa6b4' }}>{f.helperText}</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-6 py-4 border-t flex items-center justify-between gap-3"
            style={{ borderColor: '#e5ebf2', background: '#fafbfc' }}
          >
            {/* Back / step counter */}
            <div className="flex items-center gap-3">
              {stepIndex > 0 ? (
                <button
                  type="button"
                  onClick={() => { setStepIndex(i => i - 1); setErr(null); }}
                  className="flex items-center gap-1 text-[12px] font-semibold h-9 px-3 rounded-lg border transition-colors hover:bg-gray-50"
                  style={{ borderColor: '#dde4ec', color: '#0f1c2e' }}
                >
                  <ChevronLeft size={13} /> Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[12px] h-9 px-3 rounded-lg border hover:bg-gray-50 transition-colors"
                  style={{ borderColor: '#dde4ec', color: '#6b7685' }}
                >
                  Cancel
                </button>
              )}
              <span className="text-[11px]" style={{ color: '#9aa6b4' }}>
                {stepIndex + 1} / {spec.steps.length}
              </span>
            </div>

            {/* Next / Submit */}
            <button
              type="button"
              onClick={advance}
              disabled={saving || saved}
              className="flex items-center gap-1.5 h-9 px-5 rounded-lg text-[13px] font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: saved ? '#1a8a5b' : btnBg }}
            >
              {saved ? (
                <><Check size={14} /> Done</>
              ) : saving ? (
                'Saving…'
              ) : isLast ? (
                <>{spec.submitLabel ?? 'Submit'}</>
              ) : (
                <>Next <ChevronRight size={13} /></>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── WizardPicker — shows available wizards as cards ─────────────────────────
export function WizardPicker({
  wizards,
  onSelect,
  onClose,
}: {
  wizards: WizardSpec[];
  onSelect: (spec: WizardSpec) => void;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        key="picker-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(10,20,34,0.55)', backdropFilter: 'blur(2px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="picker-panel"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: '#fff' }}
        >
          <div
            className="px-5 py-4 border-b flex items-center justify-between"
            style={{ borderColor: '#e5ebf2' }}
          >
            <div>
              <div className="text-[15px] font-bold" style={{ color: '#0f1c2e' }}>Quick start</div>
              <div className="text-[11px]" style={{ color: '#6b7685' }}>Guided step-by-step workflows</div>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100" aria-label="Close">
              <X size={15} style={{ color: '#6b7685' }} />
            </button>
          </div>
          <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
            {wizards.map(w => (
              <button
                key={w.id}
                type="button"
                onClick={() => onSelect(w)}
                className="w-full text-left rounded-xl border p-3.5 transition-all hover:border-[#3b82c4] hover:shadow-sm"
                style={{ borderColor: '#e5ebf2', background: '#fafbfc' }}
              >
                <div className="text-[13px] font-semibold" style={{ color: '#0f1c2e' }}>{w.title}</div>
                {w.subtitle && (
                  <div className="mt-0.5 text-[11px]" style={{ color: '#6b7685' }}>{w.subtitle}</div>
                )}
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#3b82c4' }}>
                  {w.steps.length} steps
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
