import React, { useState } from 'react';
import { OeIcon } from '../icons/Icons';

export interface TransitionField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'file';
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}

export interface TransitionFormProps {
  /** The state-machine action label e.g. "Approve", "Escalate to Regulator" */
  actionLabel: string;
  /** Reason codes — typical in all P6 chains */
  reasonCodes?: { value: string; label: string }[];
  fields?: TransitionField[];
  requireReason?: boolean;
  onSubmit: (data: Record<string, any>) => Promise<void> | void;
  onCancel?: () => void;
  confirmMessage?: string;
}

export function TransitionForm({
  actionLabel,
  reasonCodes,
  fields = [],
  requireReason = true,
  onSubmit,
  onCancel,
  confirmMessage,
}: TransitionFormProps) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');

  const setValue = (key: string, val: any) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const canProceed = () => {
    if (requireReason && reasonCodes && !reason) return false;
    for (const f of fields) {
      if (f.required && !values[f.key]) return false;
    }
    return true;
  };

  const handleNext = () => {
    if (confirmMessage) {
      setStep('confirm');
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ ...values, reason, note });
      setStep('done');
    } catch (e: any) {
      setError(e?.message ?? 'An error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: 'var(--oe-green-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 10px',
          }}
        >
          <OeIcon name="check-circle" size={22} color="var(--oe-green)" />
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--oe-text-1)' }}>
          {actionLabel} completed
        </div>
        <div style={{ fontSize: '12px', color: 'var(--oe-text-3)', marginTop: '4px' }}>
          The chain state has been updated and all downstream cascades triggered.
        </div>
      </div>
    );
  }

  if (step === 'confirm') {
    return (
      <div>
        <div
          style={{
            background: 'var(--oe-amber-bg)',
            border: '1px solid var(--oe-amber-ring)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
            display: 'flex',
            gap: '8px',
          }}
        >
          <OeIcon name="alert-triangle" size={15} color="var(--oe-amber)" />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--oe-amber)' }}>
              Confirm: {actionLabel}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--oe-text-2)', marginTop: '3px', lineHeight: '1.5' }}>
              {confirmMessage}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setStep('form')}
            style={secondaryBtnStyle}
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={primaryBtnStyle(submitting)}
          >
            {submitting ? (
              <><OeIcon name="clock" size={14} color="#fff" /> Processing…</>
            ) : (
              <><OeIcon name="check" size={14} color="#fff" /> Confirm {actionLabel}</>
            )}
          </button>
        </div>
        {error && <ErrorBanner message={error} />}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Dynamic fields */}
      {fields.map(field => (
        <FormField
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          onChange={val => setValue(field.key, val)}
        />
      ))}

      {/* Reason code */}
      {requireReason && reasonCodes && reasonCodes.length > 0 && (
        <div>
          <label style={labelStyle}>
            Reason code <span style={{ color: 'var(--oe-rose)' }}>*</span>
          </label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            style={inputStyle(false)}
          >
            <option value="">Select reason…</option>
            {reasonCodes.map(rc => (
              <option key={rc.value} value={rc.value}>{rc.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Free-text note */}
      <div>
        <label style={labelStyle}>
          Notes {requireReason ? '' : ''}
          <span style={{ color: 'var(--oe-text-3)', fontSize: '10px', fontWeight: 400, marginLeft: '4px' }}>optional</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add context or supporting information…"
          rows={3}
          style={{
            ...inputStyle(false),
            resize: 'vertical',
            minHeight: '72px',
          }}
        />
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {onCancel && (
          <button onClick={onCancel} style={secondaryBtnStyle}>
            Cancel
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!canProceed() || submitting}
          style={primaryBtnStyle(!canProceed() || submitting)}
          onMouseDown={e => { if (canProceed()) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
          onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
        >
          {submitting ? (
            <><OeIcon name="clock" size={14} color="#fff" /> Processing…</>
          ) : (
            <><OeIcon name="send" size={14} color="#fff" /> {actionLabel}</>
          )}
        </button>
      </div>
    </div>
  );
}

function FormField({
  field,
  value,
  onChange,
}: {
  field: TransitionField;
  value: any;
  onChange: (val: any) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {field.label}
        {field.required && <span style={{ color: 'var(--oe-rose)' }}> *</span>}
      </label>
      {field.type === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle(false)}>
          <option value="">{field.placeholder ?? 'Select…'}</option>
          {field.options?.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          style={{ ...inputStyle(false), resize: 'vertical', minHeight: '72px' }}
        />
      ) : (
        <input
          type={field.type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          style={inputStyle(false)}
        />
      )}
      {field.hint && (
        <div style={{ fontSize: '10px', color: 'var(--oe-text-3)', marginTop: '3px' }}>{field.hint}</div>
      )}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        background: 'var(--oe-rose-bg)',
        border: '1px solid var(--oe-rose-ring)',
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '12px',
        color: 'var(--oe-rose)',
        display: 'flex',
        gap: '6px',
        alignItems: 'flex-start',
      }}
    >
      <OeIcon name="x-circle" size={14} color="var(--oe-rose)" />
      {message}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--oe-text-2)',
  marginBottom: '4px',
};

function inputStyle(error: boolean): React.CSSProperties {
  return {
    width: '100%',
    border: `1px solid ${error ? 'var(--oe-rose)' : 'var(--oe-border)'}`,
    borderRadius: 'var(--oe-r-input)',
    padding: '8px 10px',
    fontSize: '13px',
    color: 'var(--oe-text-1)',
    background: 'var(--oe-canvas)',
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color 80ms',
    boxSizing: 'border-box',
  };
}

const secondaryBtnStyle: React.CSSProperties = {
  border: '1px solid var(--oe-border)',
  background: 'var(--oe-surf)',
  borderRadius: 'var(--oe-r-btn)',
  padding: '8px 14px',
  fontSize: '13px',
  color: 'var(--oe-text-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    border: 'none',
    background: disabled ? 'var(--oe-surf-3)' : 'var(--oe-grad-button)',
    borderRadius: 'var(--oe-r-btn)',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    color: disabled ? 'var(--oe-text-3)' : '#ffffff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : 'var(--oe-shadow-btn)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'transform 100ms var(--oe-ease)',
  };
}

export default TransitionForm;
