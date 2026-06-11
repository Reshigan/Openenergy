// ═══════════════════════════════════════════════════════════════════════════
// SuitePage — reusable tabbed dashboard with:
//   • column-driven tables
//   • per-tab "New" forms (dynamic field specs)
//   • per-row workflow actions (POST to a templated URL)
//   • row-click detail drawer with child tables
// Each tab declares its API surface; no custom page code needed.
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle, RefreshCw, X, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { AiBriefPanel, BriefRole } from './AiBriefPanel';
import { SuiteHero } from './SuiteHero';

// ─── OKLCH design tokens ───────────────────────────────────────────────────
const BG      = 'oklch(0.96 0.003 250)';
const BG1     = 'oklch(0.99 0.002 80)';
const BORDER  = 'oklch(0.87 0.006 250)';
const TX1     = 'oklch(0.17 0.010 250)';
const TX2     = 'oklch(0.40 0.009 250)';
const TX3     = 'oklch(0.60 0.007 250)';
const ACC     = 'oklch(0.46 0.16 55)';
const ACC_HVR = 'oklch(0.40 0.15 55)';
const BAD     = 'oklch(0.48 0.20 20)';
const BAD_BG  = 'oklch(0.97 0.04 20)';
const BAD_BDR = 'oklch(0.85 0.08 20)';
const OK      = 'oklch(0.45 0.15 150)';
const OK_BG   = 'oklch(0.97 0.04 150)';
const OK_BDR  = 'oklch(0.85 0.08 150)';
const ROW_HOVER  = 'oklch(0.975 0.002 250)';
const HEADER_BG  = 'oklch(0.94 0.004 250)';
const ROW_BORDER = 'oklch(0.91 0.004 250)';

// ─── Field & form specs ────────────────────────────────────────────────────
// `datetime-local` mirrors the native HTML input type; FormField renders
// both `datetime` and `datetime-local` as a `type="datetime-local"` field.
export type FieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'datetime' | 'datetime-local'
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
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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
  /** Render arbitrary content instead of the row table. Used for
   *  insights tabs that show charts/calculators rather than a list. */
  customContent?: React.ReactNode;
}

// ─── Main component ────────────────────────────────────────────────────────
export interface SuitePageProps {
  title: string;
  subtitle?: string;
  /** Small uppercase chip rendered above the h1 (Esums-style canonical chrome). */
  eyebrow?: string;
  tabs: TabSpec[];
  initialTab?: string;
  /** When set, renders the AI briefing panel at the top of the page. */
  aiBriefRole?: BriefRole;
  /** Optional colour overrides for the AI briefing panel gradient. */
  aiBriefAccent?: { from: string; to: string };
  /** When set, renders the gradient KPI hero (Esums-style) above the tabs. */
  heroRole?: string;
  /** Eyebrow shown inside the gradient hero panel (defaults to `eyebrow`). */
  heroEyebrow?: string;
  /** Title shown inside the gradient hero panel (defaults to `title`). */
  heroTitle?: string;
  /** Subtitle shown inside the gradient hero panel (defaults to `subtitle`). */
  heroSubtitle?: string;
}

export function SuitePage(props: SuitePageProps) {
  // Tab is URL-driven so cross-role deep-links (?tab=<key>) land on the right tab —
  // param wins, then the initialTab prop, then the first tab.
  const [params, setParams] = useSearchParams();
  const paramTab = params.get('tab');
  const initialKey =
    (paramTab && props.tabs.some((t) => t.key === paramTab) ? paramTab : null)
    || props.initialTab || props.tabs[0]?.key;
  const [activeKey, setActiveKey] = useState<string>(initialKey);
  const selectTab = useCallback((k: string) => {
    setActiveKey(k);
    const next = new URLSearchParams(params);
    next.set('tab', k);
    setParams(next, { replace: true });
  }, [params, setParams]);
  const active = useMemo(
    () => props.tabs.find((t) => t.key === activeKey) || props.tabs[0],
    [props.tabs, activeKey],
  );

  return (
    <div className="p-6 lg:p-10 space-y-6 min-h-screen" style={{ background: BG }}>
      <SuiteHero
        role={props.heroRole}
        eyebrow={props.heroEyebrow || props.eyebrow || props.title}
        title={props.heroTitle || props.title}
        subtitle={props.heroSubtitle || props.subtitle}
        accentFrom={props.aiBriefAccent?.from}
        accentTo={props.aiBriefAccent?.to}
      />

      {props.aiBriefRole && (
        <AiBriefPanel
          role={props.aiBriefRole}
          accentFrom={props.aiBriefAccent?.from}
          accentTo={props.aiBriefAccent?.to}
        />
      )}

      {/* Tabs — desktop: horizontal strip; mobile: a scrollable row with
          momentum scroll. On very narrow screens we collapse to a select. */}
      <div className="sm:hidden">
        <select
          value={active?.key || ''}
          onChange={(e) => selectTab(e.target.value)}
          className="w-full h-10 px-3 rounded-md border text-[13px]"
          style={{ borderColor: BORDER, color: TX1, background: BG1 }}
          aria-label="Select tab"
        >
          {props.tabs.map((tab) => (
            <option key={tab.key} value={tab.key}>{tab.label}</option>
          ))}
        </select>
      </div>
      <div
        className="hidden sm:flex items-center gap-1.5 border-b overflow-x-auto"
        style={{ borderColor: BORDER }}
      >
        {props.tabs.map((tab) => {
          const isActive = tab.key === active?.key;
          return (
            <button type="button"
              key={tab.key}
              onClick={() => selectTab(tab.key)}
              className="h-11 px-4 text-[13px] font-semibold whitespace-nowrap border-b-2 transition-colors"
              style={isActive
                ? { borderColor: ACC, color: ACC }
                : { borderColor: 'transparent', color: TX2 }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = TX1; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = TX2; }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {active && (active.customContent ? <>{active.customContent}</> : <SuiteTable tab={active} />)}
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
  const [confirmPending, setConfirmPending] = useState<{ action: RowAction; row: Record<string, unknown>; message: string } | null>(null);

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

  const executeRowAction = useCallback(async (action: RowAction, row: Record<string, unknown>) => {
    setConfirmPending(null);
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

  const handleRowAction = useCallback((action: RowAction, row: Record<string, unknown>) => {
    if (action.confirm) {
      setConfirmPending({ action, row, message: action.confirm });
      return;
    }
    void executeRowAction(action, row);
  }, [executeRowAction]);

  return (
    <div className="space-y-3">
      {confirmPending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
        >
          <div
            className="rounded-xl shadow-xl p-6 max-w-sm w-full mx-4"
            style={{ background: BG1, borderWidth: 1, borderStyle: 'solid', borderColor: BORDER }}
          >
            <h2 id="confirm-dialog-title" className="text-[15px] font-display font-semibold mb-2" style={{ color: TX1 }}>
              Confirm action
            </h2>
            <p className="text-[13px] mb-5" style={{ color: TX2 }}>{confirmPending.message}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmPending(null)}
                className="rounded-md px-4 py-2 text-[13px] font-medium"
                style={{ borderWidth: 1, borderStyle: 'solid', borderColor: BORDER, background: BG1, color: TX1 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ROW_HOVER; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BG1; }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeRowAction(confirmPending.action, confirmPending.row)}
                className="rounded-md bg-red-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-800"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {(tab.description || tab.create) && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          {tab.description && (
            <p className="text-[12px] max-w-3xl" style={{ color: TX2 }}>
              {tab.description.length > 140 ? tab.description.slice(0, 137) + '…' : tab.description}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => void load()}
              className="h-9 px-3 rounded-md text-[12px] font-semibold inline-flex items-center gap-1.5"
              style={{ borderWidth: 1, borderStyle: 'solid', borderColor: BORDER, background: BG1, color: TX2 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ROW_HOVER; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BG1; }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
            {tab.create && (
              <button type="button"
                onClick={() => setModalForm({ form: tab.create!, title: tab.create!.title })}
                className="h-9 px-3 rounded-md text-[12px] font-semibold text-white inline-flex items-center gap-1"
                style={{ background: ACC }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ACC_HVR; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ACC; }}
              >
                <Plus size={12} /> {tab.create.submitLabel || 'New'}
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          className="rounded-lg px-4 py-2 text-[13px] inline-flex items-center gap-2"
          style={{ borderWidth: 1, borderStyle: 'solid', borderColor: BAD_BDR, background: BAD_BG, color: BAD }}
        >
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      {success && (
        <div
          className="rounded-lg px-4 py-2 text-[13px]"
          style={{ borderWidth: 1, borderStyle: 'solid', borderColor: OK_BDR, background: OK_BG, color: OK }}
        >
          {success}
        </div>
      )}

      <div
        className="rounded-xl overflow-hidden"
        style={{ borderWidth: 1, borderStyle: 'solid', borderColor: BORDER, background: BG1 }}
      >
        {loading ? (
          <div className="p-6 text-[13px] flex items-center gap-2" style={{ color: TX2 }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center" style={{ color: TX2 }}>
            <p className="text-[14px] font-semibold" style={{ color: TX1 }}>No records yet</p>
            {tab.emptyHint && <p className="text-[12px] mt-1 max-w-lg mx-auto">{tab.emptyHint}</p>}
          </div>
        ) : (
          <>
            {/* Desktop: proper table. Mobile (< sm): stacked cards since a
                10-column table is unreadable even with overflow scroll. */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead style={{ background: HEADER_BG, color: TX2 }}>
                  <tr style={{ borderBottom: `1px solid ${ROW_BORDER}` }}>
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
                    <HoverRow
                      key={String(row.id ?? i)}
                      row={row}
                      tab={tab}
                      onDetailOpen={() => setDetailRow(row)}
                      onRowAction={handleRowAction}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list — each row becomes a stacked card with
                label/value pairs. Tap the card to drill in (if detail is
                configured). Actions flow as full-width buttons at the bottom. */}
            <ul className="sm:hidden" style={{ borderTop: `1px solid ${ROW_BORDER}` }}>
              {rows.map((row, i) => (
                <li
                  key={String(row.id ?? i)}
                  className="p-4"
                  style={{ borderBottom: `1px solid ${ROW_BORDER}` }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    if (tab.detail) setDetailRow(row);
                  }}
                >
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {tab.columns.map((col) => {
                      const cell = renderCell(row, col);
                      const isEmpty =
                        cell == null ||
                        (typeof cell === 'object' && (cell as { props?: { children?: unknown } }).props?.children === '—');
                      if (isEmpty) return null;
                      return (
                        <React.Fragment key={col.key}>
                          <dt className="text-[11px] uppercase tracking-wider col-span-1" style={{ color: TX2 }}>{col.label}</dt>
                          <dd className="text-[13px] col-span-1 break-words" style={{ color: TX1 }}>{cell}</dd>
                        </React.Fragment>
                      );
                    })}
                  </dl>
                  {tab.rowActions && tab.rowActions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tab.rowActions
                        .filter((a) => (a.show ? a.show(row) : true))
                        .map((a, idx) => (
                          <MobileActionButton
                            key={idx}
                            action={a}
                            row={row}
                            onAction={handleRowAction}
                          />
                        ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
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

// ─── HoverRow — desktop table row with hover state ─────────────────────────
function HoverRow({
  row, tab, onDetailOpen, onRowAction,
}: {
  row: Record<string, unknown>;
  tab: TabSpec;
  onDetailOpen: () => void;
  onRowAction: (action: RowAction, row: Record<string, unknown>) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      style={{
        borderBottom: `1px solid ${ROW_BORDER}`,
        background: hovered ? ROW_HOVER : 'transparent',
        cursor: tab.detail ? 'pointer' : 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (tab.detail) onDetailOpen();
      }}
    >
      {tab.columns.map((col) => (
        <td
          key={col.key}
          className={`px-4 py-2.5 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}`}
          style={{ color: TX1 }}
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
                <ActionButton
                  key={idx}
                  action={a}
                  row={row}
                  onAction={onRowAction}
                />
              ))}
          </div>
        </td>
      )}
    </tr>
  );
}

// ─── ActionButton — desktop row action with hover state ────────────────────
function ActionButton({
  action, row, onAction,
}: {
  action: RowAction;
  row: Record<string, unknown>;
  onAction: (action: RowAction, row: Record<string, unknown>) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const baseStyle: React.CSSProperties = (() => {
    if (action.tone === 'danger') {
      return {
        borderWidth: 1, borderStyle: 'solid',
        borderColor: BAD_BDR,
        background: hovered ? BAD_BG : BG1,
        color: BAD,
      };
    }
    if (action.tone === 'primary') {
      return {
        borderWidth: 1, borderStyle: 'solid',
        borderColor: ACC,
        background: hovered ? ACC_HVR : ACC,
        color: 'white',
      };
    }
    return {
      borderWidth: 1, borderStyle: 'solid',
      borderColor: BORDER,
      background: hovered ? ROW_HOVER : BG1,
      color: TX2,
    };
  })();

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAction(action, row); }}
      className="h-8 px-2.5 rounded-md text-[11px] font-semibold transition-colors"
      style={baseStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {action.label}
    </button>
  );
}

// ─── MobileActionButton — card list action button ──────────────────────────
function MobileActionButton({
  action, row, onAction,
}: {
  action: RowAction;
  row: Record<string, unknown>;
  onAction: (action: RowAction, row: Record<string, unknown>) => void;
}) {
  const style: React.CSSProperties = (() => {
    if (action.tone === 'danger') {
      return {
        borderWidth: 1, borderStyle: 'solid',
        borderColor: BAD_BDR,
        background: BG1,
        color: BAD,
      };
    }
    if (action.tone === 'primary') {
      return {
        borderWidth: 1, borderStyle: 'solid',
        borderColor: ACC,
        background: ACC,
        color: 'white',
      };
    }
    return {
      borderWidth: 1, borderStyle: 'solid',
      borderColor: BORDER,
      background: BG1,
      color: TX2,
    };
  })();

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAction(action, row); }}
      className="flex-1 min-w-[calc(50%-4px)] h-9 px-3 rounded-md text-[12px] font-semibold transition-colors"
      style={style}
    >
      {action.label}
    </button>
  );
}

// ─── Renderers ─────────────────────────────────────────────────────────────
function renderCell(row: Record<string, unknown>, col: Column): React.ReactNode {
  if (col.render) return col.render(row);
  const raw = row[col.key];
  if (raw == null || raw === '') return <span style={{ color: TX3 }}>—</span>;
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
        className="shadow-xl w-full flex flex-col overflow-hidden
                   sm:rounded-2xl sm:max-w-xl sm:max-h-[90vh]
                   h-full sm:h-auto"
        style={{ background: BG1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-3.5 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: TX1 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded"
            style={{ color: TX2 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ROW_HOVER; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
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

        <div
          className="px-5 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <button type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-md text-[13px] font-semibold"
            style={{ borderWidth: 1, borderStyle: 'solid', borderColor: BORDER, background: BG1, color: TX2 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ROW_HOVER; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BG1; }}
          >
            Cancel
          </button>
          <button type="button"
            onClick={submit}
            disabled={submitting}
            className="h-9 px-4 rounded-md text-[13px] font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5"
            style={{ background: ACC }}
            onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = ACC_HVR; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ACC; }}
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
    <label className="text-[12px] font-semibold flex items-center gap-1" style={{ color: TX1 }}>
      {field.label}
      {field.required && <span style={{ color: BAD }}>*</span>}
    </label>
  );
  const help = field.help && <p className="text-[11px] mt-1" style={{ color: TX2 }}>{field.help}</p>;
  const errNode = error && <p className="text-[11px] mt-1" style={{ color: BAD }}>{error}</p>;
  const inputStyle: React.CSSProperties = {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: error ? BAD_BDR : BORDER,
    background: BG1,
    color: TX1,
  };
  const inputClass = 'w-full h-11 sm:h-10 px-3 rounded-md text-[14px] sm:text-[13px] focus:outline-none';

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
            style={inputStyle}
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
            style={inputStyle}
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
            style={inputStyle}
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
            style={inputStyle}
          />
          {help}{errNode}
        </div>
      );
    case 'datetime':
    case 'datetime-local':
      return (
        <div>
          {labelRow}
          <input
            type="datetime-local"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
            style={inputStyle}
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
            style={inputStyle}
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
            style={inputStyle}
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
        className="w-full sm:max-w-2xl h-full overflow-y-auto shadow-xl"
        style={{ background: BG1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-5 py-3.5 flex items-center justify-between sticky top-0 z-10"
          style={{ borderBottom: `1px solid ${BORDER}`, background: BG1 }}
        >
          <h2 className="text-[15px] font-semibold" style={{ color: TX1 }}>Record detail</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded"
            style={{ color: TX2 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = ROW_HOVER; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading ? (
            <div className="text-[13px] inline-flex items-center gap-2" style={{ color: TX2 }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <section>
                <h3 className="text-[12px] uppercase tracking-wider mb-2" style={{ color: TX2 }}>Summary</h3>
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  {summaryFields.map((k) => {
                    const v = detail?.[k];
                    if (v == null || v === '') return null;
                    return (
                      <div key={k}>
                        <dt className="text-[11px]" style={{ color: TX2 }}>{k}</dt>
                        <dd className="break-all" style={{ color: TX1 }}>
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
                    <h3 className="text-[12px] uppercase tracking-wider mb-2" style={{ color: TX2 }}>
                      {child.label} ({items.length})
                    </h3>
                    {items.length === 0 ? (
                      <p className="text-[13px]" style={{ color: TX2 }}>—</p>
                    ) : (
                      <div
                        className="rounded-lg overflow-hidden"
                        style={{ borderWidth: 1, borderStyle: 'solid', borderColor: BORDER }}
                      >
                        <table className="w-full text-[12px]">
                          <thead style={{ background: HEADER_BG, color: TX2 }}>
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
                              <tr
                                key={String(r.id ?? i)}
                                style={{ borderTop: `1px solid ${ROW_BORDER}` }}
                              >
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
// Accepts either `status` (inferred tone from the value) or `label` (an
// already-formatted display string) — historically called both ways from
// different tab specs. `tone` accepts `critical` as a synonym for `bad`.
export type StatusPillTone = 'good' | 'warn' | 'bad' | 'critical' | 'info' | 'neutral';
export function StatusPill({ status, label, tone }: { status?: string; label?: string; tone?: StatusPillTone }) {
  const text = label ?? status ?? '';
  const palette: Record<string, { bg: string; text: string }> = {
    good:     { bg: OK_BG,                        text: OK },
    warn:     { bg: 'oklch(0.97 0.04 55)',         text: 'oklch(0.45 0.15 55)' },
    bad:      { bg: BAD_BG,                        text: BAD },
    critical: { bg: BAD_BG,                        text: BAD },
    info:     { bg: 'oklch(0.96 0.04 250)',         text: ACC },
    neutral:  { bg: HEADER_BG,                     text: TX2 },
  };
  const inferTone = (): keyof typeof palette => {
    const s = text.toLowerCase();
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
      {text.replace(/_/g, ' ')}
    </span>
  );
}
