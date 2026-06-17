## Cross-cutting: ZAR/i18n locale, responsive <760px, SurfaceState, print/export

### 1. ZAR Formatting & Unit Registry

**Current state:** fmtZar() in `pages/src/meridian/lib.ts` (lines 68–74) uses fixed compact notation (`bn`/`m`/`k` suffix) without locale awareness. Column-name regex patterns in form/table renders attempt ZAR detection via `/exposure|zar|amount|value/i` — fragile and non-composable.

**Spec:**

#### 1.1 Unified number formatting via Intl.NumberFormat

Replace all ad-hoc `toLocaleString()` and manual formatting with a central locale-aware formatter suite:

```typescript
// pages/src/meridian/formats.ts — new file
export const LOCALE = 'en-ZA';

/** Compact ZAR: "R 12.34bn", "R 456.7m", "R 890k", "R 1 234". */
export function fmtZarCompact(v: number | null): string {
  if (v == null) return '';
  const fmt = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'ZAR',
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: v >= 1e9 ? 2 : v >= 1e6 ? 1 : 0,
  });
  return fmt.format(v);
}

/** Full ZAR with thousands separator: "R 1 234 567.89". */
export function fmtZarFull(v: number | null, decimals = 2): string {
  if (v == null) return '';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

/** Unit-driven formatter keyed on column metadata. */
export function fmtByUnit(v: unknown, unit?: string): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const num = Number(v);
  if (Number.isNaN(num)) return String(v);
  
  switch (unit?.toLowerCase()) {
    case 'zar':
      return fmtZarCompact(num);
    case 'zar_full':
      return fmtZarFull(num);
    case 'mwh':
      return new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }).format(num) + ' MWh';
    case 'pct':
      return new Intl.NumberFormat(LOCALE, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(num / 100); // if input is 0–100, divide by 100
    case 'count':
      return new Intl.NumberFormat(LOCALE).format(num);
    case 'date':
      return new Date(v as string).toLocaleDateString(LOCALE);
    case 'datetime':
      return new Date(v as string).toLocaleString(LOCALE);
    default:
      return new Intl.NumberFormat(LOCALE).format(num);
  }
}
```

#### 1.2 Unit annotation on registry shapes

Update `ActionFieldSpec`, `ChainKpiSpec`, and `DealFieldSpec` in backend registry to carry **explicit unit metadata** (`unit?: 'zar' | 'mwh' | 'pct' | 'count' | 'date' | 'zar_full'`). Backend surfaces (Ledger, Thread, surfaces) already carry column shapes (`LedgerActionField` line 32–37); extend with `unit` field.

For backward compatibility, the regex heuristic in `LedgerPage.tsx` (line 74–75) remains as a fallback:
```typescript
const fmtKpi = (k: { key: string; value: number; unit?: string }) => {
  if (k.unit) return fmtByUnit(k.value, k.unit);
  // Fallback: old heuristic for registries missing unit
  if (/exposure|zar|amount|value/i.test(k.key)) return fmtZarCompact(k.value);
  return String(k.value);
};
```

#### 1.3 HTML lang & locale declaration

- **`pages/index.html`** already declares `<html lang="en">` and `<meta property="og:locale" content="en_ZA" />`.
- **Update to:** `<html lang="en-ZA">` for precise locale signaling to screen readers + Intl API default.
- Add `<meta name="language" content="English">` for legacy user-agent sniffing.

#### 1.4 Compact magnitude classes (KPI/Horizon tiles)

Keep `zarMagnitudeClass()` (line 76–80 lib.ts) for font-size scaling on Horizon tiles (`.zar.m1/m2/m3`). No behavioral change; the CSS (meridian.css lines 195–197) stays as-is.

---

### 2. Responsive reflow <760px floor

**Current state:** meridian.css declares media queries at `@media (max-width:1080px)` (lines 269–282) for aside stacking and `@media (max-width:760px)` (lines 676–741) for board/header reflow. Breakpoints hard-code grid/flex assumptions. Surfaces and Ledger tables have no mobile rules.

**Spec:**

#### 2.1 Core breakpoints (meridian.css)

Establish three tiers, all in meridian.css (under the existing `.mer` scope):

| Breakpoint | Condition | Use case | Surfaces |
|---|---|---|---|
| **Desktop** | ≥761px | Multi-column grids, split sidebar | Horizon (7-col board + 348px aside), Atlas grid (3-col), DealDesk (2-col), Thread (full width) |
| **Tablet** | 481–760px | Single column, stacked, larger touch targets (≥44px) | Horizon (stacked lanes), aside under board, DealDesk (1-col), Ledger tables (horizontal scroll) |
| **Mobile** | ≤480px | Phone screens, minimal chrome, full-width bands | All reflow to block flow, touch-only targets, no horizontal scroll |

Existing rule at 1080px moves to a **tablet precursor** (1081–1280px): aside collapsible-but-visible; no further changes needed there.

#### 2.2 Horizon board reflow (<760px)

**Already complete** (meridian.css 676–713): board-head hidden, lane-row block flow, per-cell `::before` pseudo-labels restore bucket names. Add touch-target upgrades (44px min):
```css
@media (max-width:760px) {
  .mer .lane-label { min-height: 44px; padding: 12px 18px; }
  .mer .cell { min-height: 44px; }
}
```

#### 2.3 Ledger table reflow (<760px)

New rules for `LedgerPage.tsx` surfaces (master-data tables, etc.):

```css
/* pages/src/meridian/meridian-responsive.css (or inline in meridian.css) */
@media (max-width:760px) {
  /* Ledger filter pills wrap & grow touch targets */
  .mer.ledger .pills {
    flex-direction: column;
  }
  .mer.ledger .pill {
    width: 100%;
    justify-content: center;
    min-height: 44px;
  }
  
  /* KPI strip becomes single-column on phones */
  .mer.ledger .kpis {
    flex-direction: column;
    gap: 12px 0;
  }
  
  /* Card list scales to mobile; ref chip wraps above status on very narrow */
  .mer.ledger .lcard {
    padding: 12px 14px;
  }
  .mer.ledger .lcard-top {
    flex-wrap: wrap;
    gap: 6px;
  }
  .mer.ledger .ref {
    flex: 0 1 100%;
  }
}
```

#### 2.4 Atlas grid reflow (<760px)

```css
@media (max-width:760px) {
  /* 3-col → 2-col → 1-col: domains grid collapses */
  .mer .domains {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 18px 18px 48px;
  }
  .mer .domain {
    margin-bottom: 24px;
  }
}
```

#### 2.5 DealDesk reflow (<900px already exists; add <760px)

```css
@media (max-width:760px) {
  .mer .deal-desk {
    padding: 18px 18px 48px;
  }
  .mer .deal-cols {
    gap: 24px 0;
  }
  /* Process rail remains 5-step but font/spacing tighten */
  .mer .drail .step {
    font-size: 8px;
  }
}
```

#### 2.6 Thread split → stacked (<760px)

Thread pages (Thread, MeridianSurfacePage frame) are single-column by default. No change needed; the 44px touch targets + max-width caps (case-body max-width:780px, meridian.css line 329) ensure readability on narrow viewports. Add:

```css
@media (max-width:760px) {
  .mer.thread .case-body {
    padding: 20px 18px 40px;
    max-width: 100%;
  }
  .mer.thread .actbar {
    padding: 12px 18px 16px;
  }
}
```

#### 2.7 Surface frame reflow (<760px)

Master-data tables in `/surface/:key` (lender/facilities, regulator/notices, etc.) mounted via MeridianSurfacePage:

```css
@media (max-width:760px) {
  .mer.mer-frame .mer-frame-body {
    padding: 18px 18px 48px;
    max-width: 100%;
  }
  /* Inline tables (ListingTable) trigger horizontal scroll if >760px;
     on phones, render as stacked cards or scrollable-x container w/ min-width. */
}
```

#### 2.8 Header reflow (<760px, already done)

meridian.css 718–741 handles wrapping, clock drop, kbd-hint compact, quicklinks row. No further changes.

#### 2.9 Touch-target enforcement (pointer:coarse)

Existing rule meridian.css 746–753 covers all coarse-pointer devices (touchscreen, stylus) with 44px minimums independently of viewport width. Keep as-is.

---

### 3. SurfaceState: shared loading/empty/error component contract

**Current state:** Each surface (Ledger, Thread, Atlas, DealDesk, MeridianSurfacePage) has inline `mer-loading`, `mer-error`, `lcard-empty` patterns. Surfaces fetch via different endpoints and handle errors locally. No unified first-run UX or role-aware scaffolding copy.

**Spec:**

#### 3.1 SurfaceState component

New file: `pages/src/meridian/SurfaceState.tsx`

```typescript
export type SurfaceStateKind = 'loading' | 'empty' | 'empty-filtered' | 'error' | 'unauthorized';

export interface SurfaceStateProps {
  kind: SurfaceStateKind;
  role?: string;
  chainTitle?: string;
  retryFn?: () => void;
  message?: string; // custom message for 'error'
  actionLabel?: string;
  actionFn?: () => void;
}

export function SurfaceState({
  kind,
  role = 'trader',
  chainTitle = 'this workflow',
  retryFn,
  message,
  actionLabel,
  actionFn,
}: SurfaceStateProps) {
  const copy = roleAwareCopy(kind, role, chainTitle);
  
  return (
    <div className={`mer mer-surface-state mer-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div className="state-icon">{copy.icon}</div>
      <h2>{copy.title}</h2>
      {copy.description && <p>{copy.description}</p>}
      {kind === 'error' && message && <code className="err-detail">{message}</code>}
      
      <div className="state-actions">
        {kind === 'error' && retryFn && (
          <button type="button" className="btn pri" onClick={retryFn}>Retry</button>
        )}
        {actionFn && (
          <button type="button" className="btn pri" onClick={actionFn}>
            {actionLabel || (kind === 'empty' ? 'Start one' : 'Open')}
          </button>
        )}
      </div>
    </div>
  );
}

function roleAwareCopy(
  kind: SurfaceStateKind,
  role: string,
  chainTitle: string,
): { title: string; description?: string; icon: string } {
  switch (kind) {
    case 'loading':
      return { title: 'Loading…', icon: '⏳' };
    case 'empty':
      if (role === 'ipp_developer') {
        return {
          title: `No ${chainTitle} yet`,
          description: `You haven't initiated any ${chainTitle.toLowerCase()} transactions. Start one from the "+" button or Atlas.`,
          icon: '📋',
        };
      }
      return {
        title: `No ${chainTitle} found`,
        description: `There are no active ${chainTitle.toLowerCase()} cases for your role.`,
        icon: '📭',
      };
    case 'empty-filtered':
      return {
        title: 'No results match this filter',
        description: 'Try adjusting your status filter or search criteria.',
        icon: '🔍',
      };
    case 'error':
      return {
        title: 'Failed to load',
        description: 'An error occurred while fetching data. Check your connection and try again.',
        icon: '⚠️',
      };
    case 'unauthorized':
      return {
        title: 'Not available',
        description: `Your ${role} role doesn't have access to this surface.`,
        icon: '🔒',
      };
  }
}
```

#### 3.2 CSS for SurfaceState (meridian.css)

```css
.mer .mer-surface-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 56px 28px;
  text-align: center;
  color: var(--ink2);
  min-height: 280px;
}
.mer .mer-surface-state.mer-error {
  background: var(--oxide-tint);
  border: 1px solid var(--oxide);
  border-radius: 8px;
  margin: 20px;
  color: var(--oxide);
}
.mer .state-icon {
  font-size: 48px;
  line-height: 1;
}
.mer .mer-surface-state h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  margin: 8px 0;
}
.mer .mer-surface-state p {
  font-size: 14px;
  color: var(--ink2);
  margin: 0;
  max-width: 480px;
}
.mer .err-detail {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 8px 12px;
  margin: 12px 0;
  word-break: break-all;
  color: var(--oxide);
}
.mer .state-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
  justify-content: center;
}
```

#### 3.3 Integration points

Update `LedgerPage.tsx`, `ThreadPage.tsx`, `HorizonPage.tsx`, `AtlasPage.tsx`, `DealDeskPage.tsx`:

```typescript
// Before:
if (err) return <div className="mer mer-error">…<button className="btn ghost">Retry</button></div>;
if (!data) return <div className="mer mer-loading">Loading…</div>;

// After:
if (err) return <SurfaceState kind="error" message={err} retryFn={load} />;
if (!data) return <SurfaceState kind="loading" />;

// In card list:
if (rows.length === 0) return <SurfaceState kind="empty" chainTitle={data.chain.title} actionFn={() => setComposeOpen(true)} actionLabel={initiation?.label} />;
if (rows.length === 0 && status) return <SurfaceState kind="empty-filtered" />;
```

Unauthorized access (404 on surface key, W49 licence-application gatekeeping, etc.):
```typescript
if (!Comp) return <SurfaceState kind="unauthorized" role={role} />;
```

---

### 4. Print & Export: certified PDF/CSV for regulator-grade chains

**Current state:** ExportBar.tsx exports CSV only (header + data rows, comma-separated). No PDF export, no print styling, no role-based gating.

**Spec:**

#### 4.1 Exportable chain classes

Define four chain classes (encoded in registry metadata):

- **regulator** — NERSA/ERA 2006 disclosure chains (W31 disposition, W33 licence-renewal, W49 licence-application, W40 compliance-inspection, W74 levy-assessment, W57 sseg-registration). **Export:** PDF (tamper-evident via PDF/A with signature zone) + CSV.
- **lender** — SARB/Basel III credit chains (W21 drawdown, W38 covenant-certificate, W45 loan-default, W53 credit-origination, W61 loan-transfer, W69 security-perfection). **Export:** PDF (DMS-compliant attestation page) + CSV.
- **carbon** — UNFCCC/Verra chains (W37 registration/PDD, W42 reversal, W48 offset-claim, W56 crediting-renewal, W65 ERPA, W11 MRV). **Export:** PDF (article-6 PoA certification format) + CSV.
- **settlement** — CPMI-IOSCO / DvP chains (W3 settlement, W13 dispatch-nominations, W50 reserve-activation). **Export:** PDF (atomic settlement ledger, timestamp-locked) + CSV.

All other chains: CSV only.

#### 4.2 ExportBar enhancements

```typescript
// pages/src/components/ExportBar.tsx — revised
interface ExportBarProps {
  data: any[];
  filename?: string;
  columns?: { key: string; header: string }[];
  chainKey?: string;        // NEW: identifies export class
  role?: string;            // NEW: role gating
  onPdfExport?: () => void; // NEW: custom PDF renderer
}

export function ExportBar({
  data,
  filename = 'export',
  columns,
  chainKey = '',
  role = 'trader',
  onPdfExport,
}: ExportBarProps) {
  const exportClass = getExportClass(chainKey);
  const canPdf = ['regulator', 'lender', 'carbon', 'settlement'].includes(exportClass) 
              && (role === 'regulator' || role === 'lender' || role === 'carbon_fund' || role === 'grid_operator');
  
  return (
    <div className="export-bar">
      {canPdf && (
        <button type="button" onClick={onPdfExport} className="btn ghost">
          📄 PDF
        </button>
      )}
      <button type="button" onClick={() => exportCsv(data, columns, filename)} className="btn ghost">
        📊 CSV
      </button>
    </div>
  );
}

function getExportClass(chainKey: string): string {
  const regulatorChains = ['disposition', 'licence_renewal', 'licence_application', 'compliance_inspection', 'levy_assessment', 'sseg_registration'];
  const lenderChains = ['drawdown', 'covenant_certificate', 'loan_default', 'credit_origination', 'loan_transfer', 'security_perfection'];
  const carbonChains = ['carbon_registration', 'carbon_reversal', 'carbon_offset_claim', 'crediting_renewal', 'carbon_erpa', 'mrv'];
  const settlementChains = ['settlement', 'dispatch_nominations', 'reserve_activation'];
  
  if (regulatorChains.some(c => chainKey.includes(c))) return 'regulator';
  if (lenderChains.some(c => chainKey.includes(c))) return 'lender';
  if (carbonChains.some(c => chainKey.includes(c))) return 'carbon';
  if (settlementChains.some(c => chainKey.includes(c))) return 'settlement';
  return 'general';
}
```

#### 4.3 Print rules (@media print)

Add to meridian.css:

```css
@media print {
  /* Hide chrome */
  .mer header, .mer aside, .mer .duty-rail, .mer .actbar, .mer .pills, 
  .mer .head-new, .mer .board-new, .mer .kbd-hint { display: none !important; }
  
  /* Full-bleed content */
  .mer { background: white; min-height: 100%; }
  .mer .case-body, .mer.ledger .ledger-body, .mer.mer-frame .mer-frame-body {
    max-width: 100%;
    padding: 40px;
  }
  
  /* Table: landscape, avoid page breaks mid-row */
  table { page-break-inside: avoid; width: 100%; }
  tbody tr { page-break-inside: avoid; }
  
  /* Monospace numerics in print (less compact than screen) */
  .mono { font-family: 'Courier New', monospace; font-weight: 500; }
  
  /* Color → grayscale for accessible printing */
  body { color: black; background: white; }
  .mer .oxide-tint, .oxide { color: #333 !important; background: #f0f0f0 !important; }
  
  /* Page footer: add chain key + export timestamp */
  body::after {
    content: attr(data-chain) ' · Exported ' attr(data-timestamp);
    display: block;
    margin-top: 20px;
    font-size: 10px;
    color: #666;
    border-top: 1px solid #ccc;
    padding-top: 10px;
  }
}
```

#### 4.4 PDF export scaffold (stub; domain-specific)

Regulator chains (W31, W33, W49, W40, W74, W57) need a PDF builder library (e.g., pdfkit or html2pdf). **For now, stub a config**:

```typescript
// pages/src/meridian/pdf-export.ts
interface PdfConfig {
  title: string;
  headerRows?: string[];
  signatureZone?: boolean; // regulator
  attestationPage?: boolean; // lender
  certificationFormat?: 'article6' | 'verra'; // carbon
  lockTimestamp?: boolean; // settlement
}

export const PDF_CONFIG: Record<string, PdfConfig> = {
  disposition: {
    title: 'NERSA §10 Regulator Disposition',
    headerRows: ['Chain: W31 Disposition', 'Authority: National Energy Regulator of South Africa'],
    signatureZone: true,
  },
  covenant_certificate: {
    title: 'Lender Covenant Certificate',
    attestationPage: true,
  },
  carbon_registration: {
    title: 'UNFCCC Article 6 Project Registration',
    certificationFormat: 'article6',
  },
};

export async function exportPdf(
  chainKey: string,
  data: any,
  filename: string,
): Promise<void> {
  const cfg = PDF_CONFIG[chainKey];
  if (!cfg) throw new Error(`No PDF export config for ${chainKey}`);
  // TODO: call html2pdf or pdfkit with cfg
}
```

#### 4.5 CSV export enhancement

Update ExportBar `exportCsv()` to use locale-aware formatting:

```typescript
function exportCsv(data: any[], columns?: any[], filename: string) {
  const headers = columns || Object.keys(data[0]).map(key => ({ key, header: key }));
  const csvContent = [
    headers.map(h => h.header).join(','),
    ...data.map(row => headers.map(h => {
      const val = row[h.key];
      // Format ZAR as "R 1 234 567" in CSV (locale-aware, comma-safe)
      if (typeof val === 'number' && h.header.toLowerCase().includes('zar')) {
        const fmt = new Intl.NumberFormat('en-ZA', {
          style: 'currency',
          currency: 'ZAR',
          minimumFractionDigits: 0,
        }).format(val);
        return `"${fmt}"`;
      }
      // Escape quotes in strings
      return typeof val === 'string' && val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val ?? '';
    }).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}
```

---

### 5. Locale-aware copy layer

**Thin layer for non-English deployments (future); today all copy is en-ZA hardcoded.**

Create `pages/src/meridian/i18n.ts`:

```typescript
// Defer full i18n scaffold; today return en-ZA strings.
// Hook point for future translation layer (i18n-js, react-i18next, etc.).
export const MSG = {
  HORIZON_TITLE: 'Workspace',
  ATLAS_TITLE: 'Functions',
  LEDGER_BACK: '← Horizon',
  LEDGER_NOTICE: 'Your role can review this workflow but can't start a case here.',
  THREAD_LOADING: 'Loading transaction…',
  THREAD_FAILED: 'Transaction failed to load.',
  SURFACE_LOADING: 'Loading…',
  SURFACE_ERROR: 'Failed to load.',
  SURFACE_UNAUTHORIZED: 'Not available to your role.',
  EMPTY_STATE: 'No cases found.',
  ACTION_RETRY: 'Retry',
  ACTION_DISMISS: 'Dismiss',
};

export function translate(key: keyof typeof MSG, context?: Record<string, unknown>): string {
  let s = MSG[key];
  if (context) {
    Object.entries(context).forEach(([k, v]) => {
      s = s.replace(`{{${k}}}`, String(v));
    });
  }
  return s;
}
```

All hardcoded copy in meridian pages (`LedgerPage`, `ThreadPage`, `AtlasPage`, `HorizonPage`, `DealDeskPage`, `OnboardingWizard`) references `MSG.*` instead of string literals. Example:

```typescript
// Before:
if (err) return <div className="mer mer-error">Thread failed to load.</div>;
// After:
if (err) return <SurfaceState kind="error" message={translate('THREAD_FAILED')} />;
```

---

### Summary table: per-surface responsibilities

| Surface | Breakpoint floor | SurfaceState integration | Export capability | Print rules | Copy source |
|---|---|---|---|---|---|
| **Horizon** | 1080px (aside stack) → 760px (board stack) | Loading, Error, (no empty—always has duty) | N/A | Hide header/aside | MSG.HORIZON_* |
| **Atlas** | 900px (3-col→1-col) | Loading, Error, empty-filtered | CSV only | Hide header | MSG.ATLAS_* |
| **Ledger** | 760px (pills stack, cards wrap) | Loading, Error, empty, empty-filtered | Chain-class gated (regulator/lender/carbon/settlement) | Full-bleed, monospace numerics | MSG.LEDGER_* + roleAwareCopy() |
| **Thread** | 760px (content squeeze, case-body reflow) | Error | Chain-class gated | Full-bleed, hide actbar | MSG.THREAD_* |
| **DealDesk** | 900px (2-col→1-col) | (N/A—external veil) | N/A | Hide header/veil | MSG.DEAL_* |
| **Surface (/surface/:key)** | 760px (frame-body reflow) | Loading, Error, unauthorized | Surface-dependent (admin dashboards N/A; regulator/lender/carbon surfaced get export) | Full-bleed | humanizeKey() + roleAwareCopy() |
| **OnboardingWizard** | 760px (step cards reflow) | Loading, Error | N/A | Hide header | MSG.ONBOARD_* |

---

### Notes on audit fixes

1. **40 dangling/empty tiles** → ExportBar will render with no data; SurfaceState will show empty with action-prompts.
2. **1275 free-text fields** → Gradually annotate registry with `unit: 'lookup'` + whitelist; LedgerActionField `source` field already in place.
3. **32+ raw *_id text inputs** → `fmtByUnit()` won't format these unless registry marks them with `unit: 'lookup'` and provides `source`.
4. **Modals without focus-trap** → FieldForm (Ledger/Thread compose veils) already uses Escape-to-dismiss + focus-restore (LedgerPage 54–60, ThreadPage 40–46). Add `inert` to non-active surface siblings when veil open.
5. **Thread dumps raw.* verbatim** → raw-fields section (meridian.css 354–362) renders as `<dl>` grid. Keep as-is for audit trail; no XSS injection (all server-sourced).

---

**Files to create/modify:**
- `pages/src/meridian/formats.ts` (new)
- `pages/src/meridian/SurfaceState.tsx` (new)
- `pages/src/meridian/pdf-export.ts` (new, stub)
- `pages/src/meridian/i18n.ts` (new)
- `pages/src/meridian/meridian.css` (add responsive rules + print)
- `pages/index.html` (`lang="en-ZA"`)
- `pages/src/meridian/{LedgerPage,ThreadPage,HorizonPage,AtlasPage,DealDeskPage}.tsx` (integrate SurfaceState + MSG)
- Backend registry: extend ActionFieldSpec/ChainKpiSpec/DealFieldSpec with `unit` field.
