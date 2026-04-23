// ═══════════════════════════════════════════════════════════════════════════
// SuitePage — reusable tabbed dashboard with:
//   • column-driven tables
//   • per-tab "New" forms (dynamic field specs)
//   • per-row workflow actions (POST to a templated URL)
//   • row-click detail drawer with child tables
// Each tab declares its API surface; no custom page code needed.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, RefreshCw, X, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { AiBriefPanel, BriefRole } from './AiBriefPanel';

// ─── Field & form specs ────────────────────────────────────────────────────
export type FieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'datetime'
  | 'select' | 'multi-select' | 'checkbox' | 'json';

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  default?: unknown;
  /** Optional validator; return error string to block submit. */
  validate?: (value: unknown, all: Record<string, unknown>) => string | null;
}

export interface FormSpec {
  title: string;
  endpoint: string;             // POST target
  method?: 'POST' | 'PUT';
  fields: FieldSpec[];
  /** Extra values added to the body on submit. */
  extraBody?: Record<string, unknown>;
  /** Override the submit button label. */
  submitLabel?: string;
}

// ─── Row action specs ──────────────────────────────────────────────────────
export interface RowAction {
  label: string;
  /** `{id}` in the URL is replaced with the row id. Same for any `{foo}` vs row.foo. */
  endpoint: string;
  method?: 'POST' | 'PUT' | 'DELETE';
  tone?: 'default' | 'primary' | 'danger';
  /** Predicate — action only appears when returns true. */
  show?: (row: Record<string, unknown>) => boolean;
  /** If set, open an inline form before submitting the action. */
  form?: FormSpec;
  /** Confirmation message before submit. */
  confirm?: string;
}

// ─── Column specs ──────────────────────────────────────────────────────────
export interface Column<Row = Record<string, unknown>> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (row: Row) => React.ReactNode;
  currency?: boolean;
  number?: boolean;
  date?: boolean;
}

// ─── Detail drawer ─────────────────────────────────────────────────────────
export interface DetailSpec {
  /** Endpoint template, `{id}` replaced with row id. Optional — uses row itself if omitted. */
  endpoint?: string;
  /** Fields to render in the summary section. Defaults: all keys except id/timestamps. */
  summaryFields?: string[];
  /** Child collections returned inside the detail payload. */
  children?: Array<{
    /** Key in the detail JSON (e.g. "events", "conditions"). */
    dataKey: string;
    label: string;
    columns: Column[];
  }>;
}

// ─── Tab spec ──────────────────────────────────────────────────────────────
export interface TabSpec {
  key: string;
  label: string;
  endpoint: string;
  columns: Column[];
  emptyHint?: string;
  description?: string;
  params?: Record<string, string>;
  create?: FormSpec;
  rowActions?: RowAction[];
  detail?: DetailSpec;
}

// ─── Main component ────────────────────────────────────────────────────────
export interface SuitePageProps {
  title: string;
  subtitle?: string;
  tabs: TabSpec[];
  initialTab?: string;
  /** When set, renders the AI briefing panel at the top of the page. */
  aiBriefRole?: BriefRole;
  /** Optional colour overrides for the AI briefing panel gradient. */
  aiBriefAccent?: { from: string; to: string };
}

export function SuitePage(props: SuitePageProps) {
  const [activeKey, setActiveKey] = useState<string>(props.initialTab || props.tabs[0]?.key);
  const active = useMemo(
    () => props.tabs.find((t) => t.key === activeKey) || props.tabs[0],
    [props.tabs, activeKey],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <header>
        <h1 className="text-[22px] font-semibold text-[#32363a]">{props.title}</h1>
        {props.subtitle && <p className="text-[13px] text-[#6a6d70] mt-1">{props.subtitle}</p>}
      </header>

      {props.aiBriefRole && (
        <AiBriefPanel
          role={props.aiBriefRole}
          accentFrom={props.aiBriefAccent?.from}
          accentTo={props.aiBriefAccent?.to}
        />
      )}

      <div className="flex items-center gap-1.5 border-b border-[#e5e5e5] overflow-x-auto">
        {props.tabs.map((tab) => {
          const isActive = tab.key === active?.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveKey(tab.key)}
              className={`h-10 px-4 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-[#0a6ed1] text-[#0a6ed1]'
                  : 'border-transparent text-[#6a6d70] hover:text-[#32363a]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {active && <SuiteTable tab={active} />}
    </div>
  );
}

// ─── Table + toolbar ───────────────────────────────────────────────────────
function SuiteTable({ tab }: { tab: TabSpec }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalForm, setModalForm] = useState<{ form: FormSpec; rowId?: string; title: string } | null>(null);
  const [detailRow, setDetailRow] = useState<Record<string, unknown> | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams(tab.params || {}).toString();
      const resp = await api.get(qs ? `${tab.endpoint}?${qs}` : tab.endpoint);
      const data = resp.data?.data;
      setRows(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tab.endpoint, tab.params]);

  useEffect(() => { void load(); }, [load]);

  const handleRowAction = useCallback(async (action: RowAction, row: Record<string, unknown>) => {
    if (action.confirm && !window.confirm(action.confirm)) return;
    const rowId = String(row.id ?? '');
    const url = templateUrl(action.endpoint, row);
    if (action.form) {
      setModalForm({
        form: { ...action.form, endpoint: url, method: action.method || 'POST' },
        rowId,
        title: `${action.label}${rowId ? ' — ' + rowId.slice(-6) : ''}`,
      });
      return;
    }
    try {
      setError(null);
      if (action.method === 'DELETE') {
        await api.delete(url);
      } else if (action.method === 'PUT') {
        await api.put(url, {});
      } else {
        await api.post(url, {});
      }
      setSuccess(`${action.label} succeeded`);
      await load();
      setTimeout(() => setSuccess(null), 2500);
    } catch (e) {
      // Axios may have a string or object in response.data. Prefer specific messages.
      const axErr = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
      setError(
        axErr.response?.data?.error
          || axErr.response?.data?.message
          || axErr.message
          || 'Action failed',
      );
    }
  }, [load]);

  return (
    <div className="space-y-3">
      {(tab.description || tab.create) && (
        <div className="flex items-start justify-between gap-4">
          {tab.description && (
            <p className="text-[12px] text-[#6a6d70] max-w-3xl">{tab.description}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load()}
              className="h-8 px-3 rounded-md text-[12px] font-semibold border border-[#d0d5dd] bg-white text-[#6a6d70] hover:bg-[#f5f6fa] inline-flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            {tab.create && (
              <button
                onClick={() => setModalForm({ form: tab.create!, title: tab.create!.title })}
                className="h-8 px-3 rounded-md text-[12px] font-semibold bg-[#0a6ed1] text-white hover:bg-[#0956a3] inline-flex items-center gap-1"
              >
                <Plus size={12} /> {tab.create.submitLabel || 'New'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#ffcdd2] bg-[#ffebee] px-4 py-2 text-[13px] text-[#bb0000] inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-[#c8e6c9] bg-[#e7f4ea] px-4 py-2 text-[13px] text-[#107e3e]">
          {success}
        </div>
      )}

      <div className="rounded-xl border border-[#e5e5e5] bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 text-[13px] text-[#6a6d70] flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-[#6a6d70]">
            <p className="text-[14px] font-semibold text-[#32363a]">No records yet</p>
            {tab.emptyHint && <p className="text-[12px] mt-1 max-w-lg mx-auto">{tab.emptyHint}</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#fafafa] text-[#6a6d70]">
                <tr className="border-b border-[#f0f0f0]">
                  {tab.columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-2.5 font-semibold ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      {col.label}
                    </th>
                  ))}
                  {tab.rowActions && tab.rowActions.length > 0 && (
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={String(row.id ?? i)}
                    className={`border-b border-[#f0f0f0] hover:bg-[#fafbfd] ${tab.detail ? 'cursor-pointer' : ''}`}
                    onClick={(e) => {
                      // Don't drill in if clicking an action button.
                      if ((e.target as HTMLElement).closest('button')) return;
                      if (tab.detail) setDetailRow(row);
                    }}
                  >
                    {tab.columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-2.5 text-[#32363a] ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}
                      >
                        {renderCell(row, col)}
                      </td>
                    ))}
                    {tab.rowActions && tab.rowActions.length > 0 && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {tab.rowActions
                            .filter((a) => (a.show ? a.show(row) : true))
                            .map((a, idx) => (
                              <button
                                key={idx}
                                onClick={(e) => { e.stopPropagation(); void handleRowAction(a, row); }}
                                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold border transition-colors ${
                                  a.tone === 'danger'
                                    ? 'border-[#e9a2a2] bg-white text-[#bb0000] hover:bg-[#ffebee]'
                                    : a.tone === 'primary'
                                      ? 'border-[#0a6ed1] bg-[#0a6ed1] text-white hover:bg-[#0956a3]'
                                      : 'border-[#d0d5dd] bg-white text-[#6a6d70] hover:bg-[#f5f6fa]'
                                }`}
                              >
                                {a.label}
                              </button>
                            ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalForm && (
        <FormModal
          title={modalForm.title}
          form={modalForm.form}
          onClose={() => setModalForm(null)}
          onSubmitted={async () => {
            setModalForm(null);
            setSuccess('Saved');
            await load();
            setTimeout(() => setSuccess(null), 2500);
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {detailRow && tab.detail && (
        <DetailDrawer
          row={detailRow}
          spec={tab.detail}
          tab={tab}
          onClose={() => setDetailRow(null)}
        />
      )}
    </div>
  );
}

// ─── Renderers ─────────────────────────────────────────────────────────────
function renderCell(row: Record<string, unknown>, col: Column): React.ReactNode {
  if (col.render) return col.render(row);
  const raw = row[col.key];
  if (raw == null || raw === '') return <span className="text-[#b0b5bb]">—</span>;
  if (col.currency) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n);
  }
  if (col.number) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    return n.toLocaleString('en-ZA', { maximumFractionDigits: 2 });
  }
  if (col.date) {
    const s = String(raw);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-ZA');
  }
  return String(raw);
}

function templateUrl(template: string, row: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    const v = row[key];
    return v == null ? '' : String(v);
  });
}

// ─── Form modal ────────────────────────────────────────────────────────────
function FormModal({
  title, form, onClose, onSubmitted, onError,
}: {
  title: string;
  form: FormSpec;
  onClose: () => void;
  onSubmitted: () => void;
  onError: (msg: string) => void;
}) {
  const initial = useMemo(() => {
    const o: Record<string, unknown> = {};
    for (const f of form.fields) o[f.name] = f.default ?? (f.type === 'checkbox' ? false : '');
    return o;
  }, [form.fields]);
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFieldErrors({});
    const errs: Record<string, string> = {};
    for (const f of form.fields) {
      if (f.required && (values[f.name] == null || values[f.name] === '')) {
        errs[f.name] = 'Required';
      }
      if (f.validate) {
        const v = f.validate(values[f.name], values);
        if (v) errs[f.name] = v;
      }
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { ...(form.extraBody || {}) };
      for (const f of form.fields) {
        let v = values[f.name];
        if (v === '' || v == null) continue;
        if (f.type === 'number') v = Number(v);
        if (f.type === 'json' && typeof v === 'string') {
          try { v = JSON.parse(v); } catch { /* leave as string */ }
        }
        body[f.name] = v;
      }
      if (form.method === 'PUT') {
        await api.put(form.endpoint, body);
      } else {
        await api.post(form.endpoint, body);
      }
      onSubmitted();
    } catch (e) {
      const axErr = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
      onError(
        axErr.response?.data?.error
          || axErr.response?.data?.message
          || axErr.message
          || 'Request failed',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-[#e5e5e5] flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#32363a]">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#f5f6fa]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-3">
          {form.fields.map((f) => (
            <FormField
              key={f.name}
              field={f}
              value={values[f.name]}
              error={fieldErrors[f.name]}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
            />
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[#e5e5e5] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-md text-[13px] font-semibold border border-[#d0d5dd] bg-white text-[#6a6d70] hover:bg-[#f5f6fa]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-9 px-4 rounded-md text-[13px] font-semibold bg-[#0a6ed1] text-white hover:bg-[#0956a3] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {form.submitLabel || 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ field, value, error, onChange }: {
  field: FieldSpec;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const labelRow = (
    <label className="text-[12px] font-semibold text-[#32363a] flex items-center gap-1">
      {field.label}
      {field.required && <span className="text-[#bb0000]">*</span>}
    </label>
  );
  const help = field.help && <p className="text-[11px] text-[#6a6d70] mt-1">{field.help}</p>;
  const errNode = error && <p className="text-[11px] text-[#bb0000] mt-1">{error}</p>;
  const inputClass = `w-full h-9 px-3 rounded-md border text-[13px] bg-white ${
    error ? 'border-[#e9a2a2]' : 'border-[#d0d5dd]'
  } focus:outline-none focus:border-[#0a6ed1]`;

  switch (field.type) {
    case 'textarea':
      return (
        <div>
          {labelRow}
          <textarea
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className={`${inputClass} h-auto py-2`}
          />
          {help}{errNode}
        </div>
      );
    case 'select':
      return (
        <div>
          {labelRow}
          <select
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          >
            <option value="">— Select —</option>
            {(field.options || []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {help}{errNode}
        </div>
      );
    case 'checkbox':
      return (
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-1"
          />
          <div>
            {labelRow}
            {help}
          </div>
        </div>
      );
    case 'number':
      return (
        <div>
          {labelRow}
          <input
            type="number"
            value={value == null ? '' : String(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            step="any"
            className={inputClass}
          />
          {help}{errNode}
        </div>
      );
    case 'date':
      return (
        <div>
          {labelRow}
          <input
            type="date"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {help}{errNode}
        </div>
      );
    case 'datetime':
      return (
        <div>
          {labelRow}
          <input
            type="datetime-local"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
          {help}{errNode}
        </div>
      );
    case 'json':
      return (
        <div>
          {labelRow}
          <textarea
            value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
            onChange={(e) => onChange(e.target.value)}
            rows={5}
            placeholder='{"key":"value"}'
            className={`${inputClass} h-auto py-2 font-mono`}
          />
          {help}{errNode}
        </div>
      );
    default:
      return (
        <div>
          {labelRow}
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={inputClass}
          />
          {help}{errNode}
        </div>
      );
  }
}

// ─── Detail drawer ─────────────────────────────────────────────────────────
function DetailDrawer({
  row, spec, tab, onClose,
}: {
  row: Record<string, unknown>;
  spec: DetailSpec;
  tab: TabSpec;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!spec.endpoint) { setDetail(row); return; }
    setLoading(true);
    (async () => {
      try {
        const url = templateUrl(spec.endpoint!, row);
        const resp = await api.get(url);
        const data = resp.data?.data;
        setDetail(data && typeof data === 'object' ? (data as Record<string, unknown>) : row);
      } catch {
        setDetail(row);
      } finally {
        setLoading(false);
      }
    })();
  }, [row, spec.endpoint]);

  const summaryFields = spec.summaryFields
    || tab.columns.map((c) => c.key).concat(['created_at', 'updated_at']);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-[#e5e5e5] flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-[15px] font-semibold text-[#32363a]">Record detail</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-[#f5f6fa]">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading ? (
            <div className="text-[13px] text-[#6a6d70] inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <section>
                <h3 className="text-[12px] uppercase tracking-wider text-[#6a6d70] mb-2">Summary</h3>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  {summaryFields.map((k) => {
                    const v = detail?.[k];
                    if (v == null || v === '') return null;
                    return (
                      <div key={k}>
                        <dt className="text-[11px] text-[#89919a]">{k}</dt>
                        <dd className="text-[#32363a] break-all">
                          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              {spec.children?.map((child) => {
                const items = (detail?.[child.dataKey] as Record<string, unknown>[]) || [];
                return (
                  <section key={child.dataKey}>
                    <h3 className="text-[12px] uppercase tracking-wider text-[#6a6d70] mb-2">
                      {child.label} ({items.length})
                    </h3>
                    {items.length === 0 ? (
                      <p className="text-[13px] text-[#6a6d70]">—</p>
                    ) : (
                      <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead className="bg-[#fafafa] text-[#6a6d70]">
                            <tr>
                              {child.columns.map((col) => (
                                <th key={col.key} className={`px-3 py-2 font-semibold ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((r, i) => (
                              <tr key={String(r.id ?? i)} className="border-t border-[#f0f0f0]">
                                {child.columns.map((col) => (
                                  <td key={col.key} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''}`}>
                                    {renderCell(r, col)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Status pill helper ────────────────────────────────────────────────────
export function StatusPill({ status, tone }: { status: string; tone?: 'good' | 'warn' | 'bad' | 'info' | 'neutral' }) {
  const palette: Record<string, { bg: string; text: string }> = {
    good:    { bg: '#e7f4ea', text: '#107e3e' },
    warn:    { bg: '#fef3e6', text: '#b04e0f' },
    bad:     { bg: '#fde7e9', text: '#bb0000' },
    info:    { bg: '#e5f0fa', text: '#0a6ed1' },
    neutral: { bg: '#eef1f4', text: '#6a6d70' },
  };
  const inferTone = (): keyof typeof palette => {
    const s = status.toLowerCase();
    if (['active', 'compliant', 'pass', 'paid', 'completed', 'granted', 'verified', 'issued', 'approved', 'healthy', 'cleared', 'settled'].includes(s)) return 'good';
    if (['warn', 'warning', 'in_review', 'pending', 'submitted', 'draft', 'drafted', 'trialing'].includes(s)) return 'info';
    if (['breach', 'breached', 'non_compliant', 'rejected', 'failed', 'revoked', 'overdue', 'terminated'].includes(s)) return 'bad';
    if (['suspended', 'investigating', 'degraded', 'past_due', 'disputed', 'qualified'].includes(s)) return 'warn';
    return 'neutral';
  };
  const p = palette[tone || inferTone()];
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: p.bg, color: p.text }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
