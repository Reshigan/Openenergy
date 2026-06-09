# Wizards & Product Tours — Implementation Plan

**Goal:** Make every role's workstation self-guiding — multi-step wizards for complex first-use flows, and a contextual product tour on every workstation that walks users through the UI on first visit.

**Architecture:**
- `WizardModal` extends the existing `FieldSpec`/`ActionModal` pattern to N steps with progress indicator, back/next, and per-step validation. Reuses `lookup` field type and `lookupAutoFill`.
- `ProductTour` uses `data-tour="*"` attributes + a portal overlay (highlight rect + tooltip). No external library. State managed via `useTour(id)` hook backed by `localStorage`.
- `WorkstationShell` gains two new optional props: `wizards?: WizardSpec[]` and `tour?: TourDef`. A "Quick start" header button opens a wizard picker; first visit auto-triggers the tour.

**Tech Stack:** React 18, TypeScript, Tailwind/inline styles (matching existing shell), Framer Motion (already in bundle for AnimatePresence)

---

## File Structure

- Create: `pages/src/components/launch/WizardModal.tsx`
- Create: `pages/src/components/launch/ProductTour.tsx`
- Create: `pages/src/lib/useTour.ts`
- Modify: `pages/src/components/launch/WorkstationShell.tsx` — add `wizards`/`tour` props, `data-tour` attrs, "Quick start" button, auto-tour trigger
- Modify: `pages/src/components/pages/IppWorkstationPage.tsx` — add wizards + tour
- Modify: `pages/src/components/pages/TraderWorkstationPage.tsx` — add wizards + tour
- Modify: `pages/src/components/pages/LenderWorkstationPage.tsx` — add wizards + tour
- Modify: `pages/src/components/pages/OfftakerWorkstationPage.tsx` — add wizards + tour
- Modify: `pages/src/components/pages/GridOpsWorkstationPage.tsx` — add wizards + tour
- Modify: `pages/src/components/pages/CarbonWorkstationPage.tsx` — add wizards + tour
- Modify: `pages/src/components/pages/RegulatorWorkstationPage.tsx` — add wizards + tour
- Modify: `pages/src/components/pages/AdminWorkstationPage.tsx` — add wizards + tour
- Modify: `pages/src/components/pages/SupportWorkstationPage.tsx` — add wizards + tour

---

## Task 1: `WizardModal` component

**Files:**
- Create: `pages/src/components/launch/WizardModal.tsx`

- [ ] **Step 1: Define types**

```typescript
// In WizardModal.tsx
import { FieldSpec } from './WorkstationShell';

export type WizardStep = {
  title: string;
  description?: string;   // "why this step matters" — shown as light helper text
  fields: FieldSpec[];
};

export type WizardSpec = {
  id: string;
  title: string;
  subtitle?: string;
  steps: WizardStep[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
};
```

- [ ] **Step 2: Build WizardModal**

The component replicates ActionModal's lookup-fetching logic (all steps' lookup fields fetched on mount), plus step navigation. Key points:
- `stepIndex` state (0-based)
- Values accumulate across all steps in a single flat Record
- "Next" validates required fields in the current step only
- "Back" never loses already-entered values
- Final step shows `submitLabel` (default "Submit") instead of "Next"
- Step indicator: numbered circles connected by a line (active = filled, done = checkmark, pending = grey)
- Error shown beneath current step's fields (same pattern as ActionModal)

```typescript
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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Fetch ALL lookup fields across ALL steps on mount
  useEffect(() => {
    const allLookup = spec.steps.flatMap(s => s.fields.filter(f => f.type === 'lookup' && f.lookupEndpoint));
    if (!allLookup.length) return;
    const token = localStorage.getItem('token') || '';
    Promise.all(allLookup.map(f =>
      fetch(f.lookupEndpoint!, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => ({ key: f.key, opts: d.data || [] }))
        .catch(() => ({ key: f.key, opts: [] }))
    )).then(results => {
      const map: Record<string, LookupOption[]> = {};
      results.forEach(({ key, opts }) => { map[key] = opts; });
      setLookupOpts(map);
    });
  }, []);

  const currentStep = spec.steps[stepIndex];
  const isLast = stepIndex === spec.steps.length - 1;

  const update = (k: string, v: string) => {
    setValues(prev => {
      const next = { ...prev, [k]: v };
      const field = currentStep.fields.find(f => f.key === k);
      if (field?.type === 'lookup' && field.lookupAutoFill && v) {
        const selected = (lookupOpts[k] || []).find(o => String(o.value) === v);
        if (selected) Object.entries(field.lookupAutoFill).forEach(([tk, sk]) => { next[tk] = String(selected[sk] ?? ''); });
      }
      return next;
    });
  };

  const advance = async () => {
    // Validate required fields in current step
    const missing = currentStep.fields.filter(f => f.required && !values[f.key]?.trim());
    if (missing.length) { setErr(`Required: ${missing.map(f => f.label).join(', ')}`); return; }
    setErr(null);
    if (isLast) {
      setSaving(true);
      try { await spec.onSubmit(values); onClose(); }
      catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Submit failed'); }
      finally { setSaving(false); }
    } else {
      setStepIndex(i => i + 1);
    }
  };

  // Render: step indicator + current step fields + nav buttons
  // (full JSX omitted for brevity — follows ActionModal styling patterns)
}
```

- [ ] **Step 3: Write step indicator sub-component**

```typescript
function StepIndicator({ steps, current }: { steps: WizardStep[]; current: number }) {
  return (
    <div className="flex items-center gap-0 mb-5">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all"
              style={{
                background: i < current ? '#1a8a5b' : i === current ? '#0f1c2e' : '#f1f4f8',
                borderColor: i < current ? '#1a8a5b' : i === current ? '#0f1c2e' : '#dde4ec',
                color: i <= current ? '#fff' : '#9aa6b4',
              }}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <div className="text-[9px] mt-0.5 text-center max-w-[60px] leading-tight" style={{ color: i === current ? '#0f1c2e' : '#9aa6b4' }}>
              {s.title}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-[2px] mb-4 mx-1 rounded" style={{ background: i < current ? '#1a8a5b' : '#dde4ec' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify type-check passes**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npm run check:pages 2>&1 | tail -5`
Expected: clean

---

## Task 2: `ProductTour` component + `useTour` hook

**Files:**
- Create: `pages/src/lib/useTour.ts`
- Create: `pages/src/components/launch/ProductTour.tsx`

- [ ] **Step 1: `useTour` hook**

```typescript
// pages/src/lib/useTour.ts
import { useState, useCallback } from 'react';

export function useTour(tourId: string) {
  const key = `oe-tour-done-${tourId}`;
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const start = useCallback(() => {
    if (localStorage.getItem(key)) return;  // already seen
    setStepIndex(0);
    setActive(true);
  }, [key]);

  const startForced = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(key, '1');
    setActive(false);
  }, [key]);

  const isDone = !!localStorage.getItem(key);

  return { active, stepIndex, setStepIndex, start, startForced, finish, isDone };
}
```

- [ ] **Step 2: `TourStep` and `TourDef` types**

```typescript
// in ProductTour.tsx
export type TourStep = {
  target: string;        // data-tour="<target>" attribute value on a DOM node
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
};

export type TourDef = {
  id: string;
  steps: TourStep[];
};
```

- [ ] **Step 3: `ProductTour` component**

Strategy: renders via React portal into `document.body`. Finds the target element by `document.querySelector('[data-tour="<target>"]')`. On each step:
1. Scroll element into view
2. Get bounding rect
3. Draw semi-transparent overlay with a transparent rect cutout over the element
4. Position tooltip above/below/left/right of the element (auto-flip if near viewport edge)
5. Animate in with Framer Motion

```typescript
export function ProductTour({
  def,
  stepIndex,
  onNext,
  onPrev,
  onClose,
}: {
  def: TourDef;
  stepIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const step = def.steps[stepIndex];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const isLast = stepIndex === def.steps.length - 1;

  useEffect(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Small delay to let scroll settle before measuring
    const t = setTimeout(() => setRect(el.getBoundingClientRect()), 300);
    return () => clearTimeout(t);
  }, [step.target]);

  // Recalculate on resize/scroll
  useEffect(() => {
    const recalc = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', recalc);
    window.addEventListener('scroll', recalc, true);
    return () => { window.removeEventListener('resize', recalc); window.removeEventListener('scroll', recalc, true); };
  }, [step.target]);

  // Portal overlay with cutout + tooltip
  // overlay = full screen, clip-path punches out rect around target
  // tooltip positioned relative to rect
}
```

The overlay uses `clip-path: polygon(...)` or SVG mask with a cutout rect. Tooltip is absolutely positioned based on `rect` + `placement`.

- [ ] **Step 4: Verify type-check**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npm run check:pages 2>&1 | tail -5`
Expected: clean

---

## Task 3: Integrate into WorkstationShell

**File:** `pages/src/components/launch/WorkstationShell.tsx`

- [ ] **Step 1: Add new props to WorkstationShell**

```typescript
import { WizardSpec } from './WizardModal';
import { TourDef } from './ProductTour';

// Add to WorkstationShell props:
wizards?: WizardSpec[];
tour?: TourDef;
```

- [ ] **Step 2: Add `data-tour` attributes to key elements**

| Element | Attribute |
|---|---|
| KPI row `<div>` | `data-tour="kpi-row"` |
| Tab nav container | `data-tour="tab-nav"` |
| Tab search input | `data-tour="tab-search"` |
| IncomingPanel container | `data-tour="incoming-panel"` |
| "What can I do?" button | `data-tour="capability-palette"` |
| "Quick start" button (new) | `data-tour="quick-start"` |
| First tab content area | `data-tour="tab-content"` |

- [ ] **Step 3: Add "Quick start" button to header**

Next to the existing "What can I do?" button, add a "Quick start" button that opens a wizard picker modal when `wizards` prop is provided:

```tsx
{wizards && wizards.length > 0 && (
  <button
    type="button"
    data-tour="quick-start"
    onClick={() => setWizardPickerOpen(true)}
    className="..."
  >
    <Wand2 size={14} /> Quick start
  </button>
)}
```

The wizard picker is a small modal listing available wizards as cards. Clicking one launches `WizardModal` with that spec.

- [ ] **Step 4: Auto-trigger tour on first visit**

```typescript
const { active: tourActive, stepIndex: tourStep, setStepIndex: setTourStep, start: startTour, finish: finishTour } = useTour(tour?.id ?? '');

useEffect(() => {
  if (tour) startTour();  // no-op if already seen
}, [tour?.id]);
```

- [ ] **Step 5: Render `ProductTour` when active**

```tsx
{tour && tourActive && (
  <ProductTour
    def={tour}
    stepIndex={tourStep}
    onNext={() => tourStep < tour.steps.length - 1 ? setTourStep(s => s + 1) : finishTour()}
    onPrev={() => setTourStep(s => Math.max(0, s - 1))}
    onClose={finishTour}
  />
)}
```

- [ ] **Step 6: Add "Take a tour" button alongside "Quick start"**

```tsx
{tour && (
  <button type="button" onClick={() => startForcedTour()} ...>
    <Map size={14} /> Tour
  </button>
)}
```

- [ ] **Step 7: Verify no regressions**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npm run check:pages 2>&1 | tail -5`
Expected: clean

---

## Task 4: Wizard definitions — IPP Developer + Trader

**Files:**
- Modify: `pages/src/components/pages/IppWorkstationPage.tsx`
- Modify: `pages/src/components/pages/TraderWorkstationPage.tsx`

- [ ] **Step 1: IPP — 3 wizards**

**Wizard 1: "Start a new project"** (5 steps)
```typescript
{
  id: 'ipp-new-project',
  title: 'Start a new IPP project',
  subtitle: 'Walk through the key fields to register your project on the platform.',
  steps: [
    {
      title: 'Project basics',
      description: 'Name and classify your project — this sets the REIPPPP bid window and energy type routing.',
      fields: [
        { key: 'name', label: 'Project name', required: true },
        { key: 'technology', label: 'Technology', type: 'select', required: true, options: TECH_OPTIONS },
        { key: 'energy_type', label: 'Energy type', type: 'select', required: true, options: ENERGY_OPTIONS },
      ],
    },
    {
      title: 'Capacity',
      description: 'Capacity determines your SLA tier and NERSA licence class.',
      fields: [
        { key: 'capacity_mw', label: 'Installed capacity (MW)', type: 'number', required: true },
        { key: 'location', label: 'Municipality / province', required: true },
      ],
    },
    {
      title: 'Timeline',
      description: 'Key dates drive the milestone variance engine and SLA countdown.',
      fields: [
        { key: 'financial_close_date', label: 'Financial close target', type: 'date' },
        { key: 'cod_target_date', label: 'COD target', type: 'date', required: true },
      ],
    },
    {
      title: 'Developer',
      description: 'Links this project to the developer participant record.',
      fields: [
        { key: 'developer_id', label: 'Developer', type: 'lookup', lookupEndpoint: '/api/lookup/participants',
          lookupAutoFill: { developer_name: 'name' }, required: true },
        { key: 'developer_name', label: 'Developer name' },
      ],
    },
    {
      title: 'Confirm',
      description: 'Review and submit — the project will enter "development" status and a stage-gate DG0 will be created.',
      fields: [
        { key: 'notes', label: 'Initial notes', type: 'textarea' },
      ],
    },
  ],
  submitLabel: 'Create project',
  onSubmit: async (values) => { await api.post('/ipp/projects', values); },
}
```

**Wizard 2: "Execute a stage gate"** (3 steps — gate selection → evidence → submit)
**Wizard 3: "Log an HSE incident"** (3 steps — incident details → severity/cause → notifications)

- [ ] **Step 2: Trader — 3 wizards**

**Wizard 1: "Place your first order"** (3 steps)
```typescript
{
  id: 'trader-first-order',
  title: 'Place your first order',
  subtitle: 'Step through a bid or offer with pre-trade checks explained at each step.',
  steps: [
    {
      title: 'Energy product',
      description: 'Energy type and delivery window determine which order book your order enters.',
      fields: [
        { key: 'energy_type', label: 'Energy type', type: 'select', required: true, options: ENERGY_OPTIONS },
        { key: 'delivery_start', label: 'Delivery start', type: 'date', required: true },
        { key: 'delivery_end', label: 'Delivery end', type: 'date', required: true },
      ],
    },
    {
      title: 'Price & quantity',
      description: 'Price is validated against your credit limit and current mark price ±20%.',
      fields: [
        { key: 'side', label: 'Side', type: 'select', required: true,
          options: [{ value: 'buy', label: 'Buy (Bid)' }, { value: 'sell', label: 'Sell (Offer)' }] },
        { key: 'quantity_mwh', label: 'Quantity (MWh)', type: 'number', required: true },
        { key: 'price_zar', label: 'Price (ZAR/MWh)', type: 'number', required: true },
      ],
    },
    {
      title: 'Confirm',
      description: 'Your order will be checked against credit, exposure, and halt guards before entering the book.',
      fields: [
        { key: 'order_type', label: 'Order type', type: 'select', required: true,
          options: [{ value: 'limit', label: 'Limit' }, { value: 'market', label: 'Market' }] },
        { key: 'notes', label: 'Internal ref (optional)', type: 'text' },
      ],
    },
  ],
  submitLabel: 'Submit order',
  onSubmit: async (values) => { await api.post('/trading/orders', values); },
}
```

**Wizard 2: "Register an algo system"** (4 steps)
**Wizard 3: "Submit a STOR report"** (3 steps)

- [ ] **Step 3: Verify type-check clean**

---

## Task 5: Wizard definitions — Lender + Offtaker

**Files:**
- Modify: `pages/src/components/pages/LenderWorkstationPage.tsx`
- Modify: `pages/src/components/pages/OfftakerWorkstationPage.tsx`

- [ ] **Step 1: Lender — 3 wizards**

**Wizard 1: "Originate a credit facility"** (5 steps): borrower lookup → facility type/amount/currency → tenor/grace → covenants (DSCR floor, LTV cap) → submit for credit committee approval
**Wizard 2: "Request a drawdown"** (3 steps): select facility → confirm CPs cleared checkbox list → specify amount + drawdown date
**Wizard 3: "Raise covenant breach"** (3 steps): select facility → breach type + description + quantum → cure period start/duration

All 3 use `api.post` to the appropriate chain endpoints. Field specs follow the same patterns as Task 4.

- [ ] **Step 2: Offtaker — 3 wizards**

**Wizard 1: "Execute a PPA"** (4 steps): generator lookup → capacity MW + tariff type + base tariff → delivery site lookup → payment security instrument type + bank + amount
**Wizard 2: "Retire RECs for Scope 2 reporting"** (3 steps): certificate standard select → vintage/quantity → retirement purpose (CDP/SBTi/mandatory/voluntary) + beneficiary
**Wizard 3: "Lodge a curtailment claim"** (3 steps): curtailment event date/duration → deemed-MWh calculation inputs → submit claim with PPA reference

- [ ] **Step 3: Verify type-check clean**

---

## Task 6: Wizard definitions — Grid Operator + Carbon Fund

**Files:**
- Modify: `pages/src/components/pages/GridOpsWorkstationPage.tsx`
- Modify: `pages/src/components/pages/CarbonWorkstationPage.tsx`

- [ ] **Step 1: Grid Operator — 3 wizards**

**Wizard 1: "Submit dispatch nomination"** (3 steps): BRP participant lookup → nomination window (start/end) → submitted quantities + confirmation
**Wizard 2: "Activate EOP"** (4 steps): EOP type select → severity + affected area + load-shed stage → notification list (participants lookup multi-select notes field) → confirm activation + auto-notification
**Wizard 3: "Schedule planned outage"** (4 steps): facility/asset lookup → outage window → NERSA 30-day notification flag → affected connections list

- [ ] **Step 2: Carbon Fund — 3 wizards**

**Wizard 1: "Register a carbon project"** (5 steps): project name/description → methodology select → baseline year + baseline tCO2e → additionality test (documentation notes) → registry select + submit PDD
**Wizard 2: "File MRV monitoring report"** (3 steps): project lookup → monitoring period start/end + reported tCO2e → verifier select + upload reference
**Wizard 3: "Retire credits"** (3 steps): vintage select → quantity + scope select → retirement purpose (compliance/article6/voluntary) + beneficiary name

- [ ] **Step 3: Verify type-check clean**

---

## Task 7: Wizard definitions — Regulator + Admin + Support

**Files:**
- Modify: `pages/src/components/pages/RegulatorWorkstationPage.tsx`
- Modify: `pages/src/components/pages/AdminWorkstationPage.tsx`
- Modify: `pages/src/components/pages/SupportWorkstationPage.tsx`

- [ ] **Step 1: Regulator — 3 wizards**

**Wizard 1: "Process a licence application"** (4 steps): application lookup → completeness review (checklist notes) → public participation decision + window dates → final determination type + reasoning
**Wizard 2: "Issue a compliance notice"** (3 steps): licensee lookup → notice type select + statutory basis → notice text (textarea) + service date
**Wizard 3: "Open a compliance inspection"** (3 steps): subject participant + scope → inspection team lead lookup + scheduled date → notification text

- [ ] **Step 2: Admin — 3 wizards**

**Wizard 1: "Onboard a new tenant"** (4 steps): org name + trading name + CIPC number → plan select + billing cycle → initial admin email → confirm + send invite
**Wizard 2: "Complete KYC verification"** (3 steps): participant lookup + document list display (textarea notes) → check FICA criteria (POPIA consent + identity + source of funds) checkboxes as notes → approve/reject select + reason
**Wizard 3: "Configure a feature flag"** (2 steps): flag name + type select → target scope (all/tenant_id/role) + percentage rollout

- [ ] **Step 3: Support — 3 wizards**

**Wizard 1: "Raise a support ticket"** (3 steps): category select + priority P1-P4 select → subject + description textarea + steps-to-reproduce → assignee lookup + expected resolution date
**Wizard 2: "Open a problem investigation"** (3 steps): problem title + category → related incidents (ticket lookup multi-ref notes) + RCA methodology select → workaround description + planned fix ETA
**Wizard 3: "Submit a change request (RFC)"** (4 steps): change type select (normal/standard/emergency) → title + description + business justification → impact assessment + rollback plan textarea → implementation start date + CAB meeting date

- [ ] **Step 4: Verify type-check clean**

---

## Task 8: Product tour definitions — all 9 workstations

Add `tour` prop to each workstation page's `WorkstationShell` call. Each tour has 6–7 steps referencing `data-tour` attributes added in Task 3.

- [ ] **Step 1: Standard tour step set (reused across all roles)**

```typescript
// Shared tour steps that reference data-tour="*" attributes in WorkstationShell
const workstationTourBase = (roleLabel: string, primaryTab: string, primaryTabLabel: string): TourStep[] => [
  {
    target: 'ws-header',
    title: `Welcome to your ${roleLabel} workstation`,
    body: 'This is your command centre. Everything for your role lives here — use the tabs below to navigate.',
    placement: 'bottom',
  },
  {
    target: 'kpi-row',
    title: 'Live KPIs',
    body: 'These numbers update in real-time and link directly to the relevant workstation tab.',
    placement: 'bottom',
  },
  {
    target: 'incoming-panel',
    title: 'Items queued to you',
    body: 'Counterparty requests, regulatory crossings, and cascade-triggered actions land here. Items have SLA countdowns.',
    placement: 'left',
  },
  {
    target: 'tab-nav',
    title: 'All your functions',
    body: 'Each tab is a full L4 workflow. Use the search box to jump to any function by name.',
    placement: 'bottom',
  },
  {
    target: 'tab-search',
    title: 'Find any function instantly',
    body: 'Type here to filter tabs — useful when you know what you need but can\'t see it.',
    placement: 'bottom',
  },
  {
    target: 'capability-palette',
    title: '"What can I do?" — your discovery panel',
    body: 'Opens a searchable list of everything available to your role, organised by function. Each entry links directly to the right tab.',
    placement: 'bottom',
  },
  {
    target: 'quick-start',
    title: 'Quick start wizards',
    body: `Use these guided flows for your first ${primaryTabLabel} or any complex multi-step process. The wizard explains each step as you go.`,
    placement: 'bottom',
  },
];
```

- [ ] **Step 2: Per-role tour definitions**

One tour per workstation page. Each tour starts with the standard base steps then adds 1-2 role-specific steps:

```typescript
// IPP Developer
const ippTour: TourDef = {
  id: 'ipp-workstation',
  steps: [
    ...workstationTourBase('IPP Developer', 'projects', 'project'),
    {
      target: 'tab-content',
      title: 'Your project list',
      body: 'Each project row shows its current stage gate, SLA health, and links to the full P6 schedule and document register.',
      placement: 'top',
    },
  ],
};

// Trader
const traderTour: TourDef = {
  id: 'trader-workstation',
  steps: [
    ...workstationTourBase('Trader Risk', 'orders', 'order'),
    {
      target: 'tab-content',
      title: 'The order book',
      body: 'Bids and offers matched by the order book engine. Pre-trade guards run on every submission — rejections appear in the Rejections tab with AI-explained reasons.',
      placement: 'top',
    },
  ],
};
// ... similarly for Lender, Offtaker, Grid Ops, Carbon, Regulator, Admin, Support
```

- [ ] **Step 3: Wire each tour into the workstation page**

In each workstation page file, import `TourDef` and pass the tour to `WorkstationShell`:
```tsx
<WorkstationShell
  ...existingProps
  wizards={ippWizards}
  tour={ippTour}
/>
```

- [ ] **Step 4: Verify all 9 pages type-check clean**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npm run check:pages 2>&1 | tail -5`

---

## Task 9: SetupChecklist enhancement + deploy

**Files:**
- Modify: `pages/src/components/launch/SetupChecklist.tsx`

- [ ] **Step 1: Add "Take a tour" entry to SetupChecklist**

When a workstation has a tour and the tour hasn't been completed, add a "Take the workstation tour" item to the checklist. This requires passing a `tourId?` prop to SetupChecklist and checking localStorage.

```typescript
export function SetupChecklist({ role, tourId }: { role: string; tourId?: string }) {
  // ... existing code ...
  const tourDone = tourId ? !!localStorage.getItem(`oe-tour-done-${tourId}`) : true;

  // If tour not done, show it as the first item regardless of server items
  const augmented = tourId && !tourDone
    ? [{ id: '__tour__', label: 'Take the workstation tour', description: 'A 2-minute guided walkthrough of all the key areas.', href: '?__tour=1', done: false }, ...items]
    : items;
}
```

The `?__tour=1` query param is picked up by WorkstationShell to force-start the tour.

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npm test 2>&1 | tail -10`
Expected: all tests pass (wizards/tours are frontend-only, no backend changes)

- [ ] **Step 3: Type-check both**

Run: `npm run check && npm run check:pages`

- [ ] **Step 4: Deploy**

Run: `bash /Users/reshigan/Openenergy/deploy.sh`

---

## Wizard flows summary (27 total, 3 per role)

| Role | Wizard 1 | Wizard 2 | Wizard 3 |
|---|---|---|---|
| IPP Developer | Start new project (5 steps) | Execute stage gate (3 steps) | Log HSE incident (3 steps) |
| Trader | Place first order (3 steps) | Register algo system (4 steps) | Submit STOR report (3 steps) |
| Lender | Originate credit facility (5 steps) | Request drawdown (3 steps) | Raise covenant breach (3 steps) |
| Offtaker | Execute PPA (4 steps) | Retire RECs for Scope 2 (3 steps) | Lodge curtailment claim (3 steps) |
| Grid Operator | Submit dispatch nomination (3 steps) | Activate EOP (4 steps) | Schedule planned outage (4 steps) |
| Carbon Fund | Register carbon project (5 steps) | File MRV report (3 steps) | Retire credits (3 steps) |
| Regulator | Process licence application (4 steps) | Issue compliance notice (3 steps) | Open inspection (3 steps) |
| Admin | Onboard tenant (4 steps) | Complete KYC (3 steps) | Configure feature flag (2 steps) |
| Support | Raise ticket (3 steps) | Open problem investigation (3 steps) | Submit RFC (4 steps) |

## Product tour summary (9 total, ~7 steps each)

All tours trigger on first visit to the workstation (localStorage-gated). Can be replayed via the "Tour" button in the workstation header or from SetupChecklist. Steps highlight: header, KPI row, IncomingPanel, TabNav, tab search, CapabilityPalette, Quick-start button, and one role-specific tab.
