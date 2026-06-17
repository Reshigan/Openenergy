## Surface: Onboarding (/onboard) — OnboardingWizard

**Route**: `/onboard` (protected, ProtectedRoute wrapper)
**Entry point**: LaunchRedirect (App.tsx) calls `GET /api/onboarding/state` — if `!completed`, navigates to `/onboard`; if `completed`, goes to `/horizon`
**Cascade trigger**: `onboarding.completed` fires `onboarding-provisioning` rule (Layer A) → creates `om_sites` row (esums_owner) or `ipp_projects` row (ipp_developer), logs to `oe_onboarding_provisioning_log`

---

### LAYOUT — Full-page centered card

```
╔════════════════════════════════════════════════════════════════════╗
║ [color bar — 1px, role-specific hue at 15% opacity, top edge]     ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  pt-12 pb-8 px-4 (flex center)                                     ║
║                                                                    ║
║  ┌─────────────────────────────────────────────────────────┐       ║
║  │ max-w-lg centered column                                │       ║
║  │                                                         │       ║
║  │  [role-chip] ← inline-flex, role label + accent dot    │       ║
║  │  mb-6                                                  │       ║
║  │                                                         │       ║
║  │  [progress-dots] ← 8px radius, skip 'complete' step   │       ║
║  │  mb-8, gap-2                                          │       ║
║  │                                                         │       ║
║  │  ╔═══════════════════════════════════════════════════╗ │       ║
║  │  ║ white card, rounded-xl, border #dde4ec           ║ │       ║
║  │  ║ overflow-hidden, relative shadow-sm              ║ │       ║
║  │  ║                                                   ║ │       ║
║  │  ║ [0.5px accent top border]                        ║ │       ║
║  │  ║ p-8 space-y-[varies]                             ║ │       ║
║  │  ║                                                   ║ │       ║
║  │  ║  if !welcome:                                    ║ │       ║
║  │  ║    Step {idx+1} of {count}  ← 11px uppercase     ║ │       ║
║  │  ║    {title}                   ← 20px semibold     ║ │       ║
║  │  ║    {subtitle}                ← 13px gray         ║ │       ║
║  │  ║    mb-6                                           ║ │       ║
║  │  ║                                                   ║ │       ║
║  │  ║  <StepComponent /> ← role+step-specific form    ║ │       ║
║  │  ║                                                   ║ │       ║
║  │  ║  {if error}                                       ║ │       ║
║  │  ║    mt-4 px-3 py-2 rounded bg-red-50 border       ║ │       ║
║  │  ║    border-red-200 text-12px red-700               ║ │       ║
║  │  ║                                                   ║ │       ║
║  │  ╚═══════════════════════════════════════════════════╝ │       ║
║  │                                                         │       ║
║  │  mt-6 flex justify-between items-center                │       ║
║  │                                                         │       ║
║  │  [left]          [right]                               │       ║
║  │  "Skip setup"    [Back] [CTA]                          │       ║
║  │  12px underline  h-9 px-4 ← Back button only if !first │       ║
║  │  hover:darker    h-9 px-5 ← Primary button            │       ║
║  │                  disabled while loading               │       ║
║  │                                                         │       ║
║  └─────────────────────────────────────────────────────────┘       ║
║                                                                    ║
║  min-h-screen bg-[#f5f7fa] flex flex-col (flex-1 flex-col)         ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

### ROLE SEQUENCES & STEP TITLES

| Role | Steps | Colors |
|------|-------|--------|
| **esums_owner** (Asset Owner) | welcome → **site_setup** → **device_config** → **data_sources** → **alerts** → complete | #16a34a green |
| **ipp_developer** (IPP Developer) | welcome → **company_profile** → **first_project** → **compliance** → complete | oklch(0.46 0.16 55) amber |
| **trader** (Trader) | welcome → **entity** → **risk_limits** → complete | #7c3aed purple |
| **lender** (Lender) | welcome → **fund_setup** → **coverage** → complete | #b45309 amber-800 |
| **offtaker** (Offtaker) | welcome → **entity** (OfftakerEntityStep override) → **ppa_prefs** → complete | #0369a1 cyan |
| **carbon_fund** (Carbon Fund) | welcome → **registry** → **methodology** → complete | #065f46 teal |
| **grid_operator** (Grid Operator) | welcome → **authority** → **services** → complete | #9f1239 rose |
| **regulator** (Regulator) | welcome → **body** → **jurisdiction** → complete | #374151 gray |
| **support** (OEM Support) | welcome → **org** → **sla** → complete | #1d4ed8 blue |
| **admin** (Administrator) | welcome → complete | #111827 black |
| **esco**, **epc_contractor** | Falls back to admin sequence (welcome → complete) — no role-specific throw; generic no-op fallback |

---

### STEP DETAILS & FORM PATTERNS

#### Welcome Step (all roles)
**Component**: `WelcomeStep`  
**Heading**: "Welcome to the Consolidated Energy Cockpit, {firstName}"  
**Subtitle**: {ROLE_DESCS[role]} — describes what the role does on the platform
**Timing copy**: "This will take about 2 minutes"  
**Render**: text-center, decorative 32px grid pattern at 3% opacity (pointer-events-none)  
**States**:
- Normal (visited): heading + role description + timing line
- (no error/loading states on welcome)

**Button behavior**: CTA text = **"Get started"** (not "Continue")

---

#### Content Steps (all roles)

**Form field primitives** (`steps.tsx`):
- **Label**: text-[12px] font-medium #3a4658, block mb-1
- **Input**: h-9 px-3 rounded border #dde4ec, text-[13px] #0f1c2e, focus:border-[oklch(0.46 0.16 55)] (ipp accent)
- **Select**: same as input
- **Checkbox**: h-3.5 w-3.5, border #dde4ec, accent-[oklch(0.46 0.16 55)]
- **CheckRow**: flex items-center gap-2, text-[13px] #3a4658, cursor-pointer (labels wrap checkbox)
- **Grid2**: `grid grid-cols-2 gap-x-4 gap-y-3` (2-col layout, stacks 1-col at <760px via Tailwind default)

**Common field containers**:
- Space-y-4 between groups (4 fields per step typical)
- `<div className={GRID2}>` for side-by-side pairs
- Full-width single field: `col-span-2` + `<div className="col-span-2">`

---

### STEP PAYLOADS & FORM STRUCTURE

**esums_owner** (5 content steps, ~13 min expected):

1. **site_setup** (grid2)
   - Site name (text, "e.g. Stellenbosch Solar Farm")
   - Site type (select: solar_pv | wind | bess | hybrid)
   - Installed capacity kW (number, "e.g. 5000")
   - Province (select: GP/WC/KZN/EC/LP/FS/NC/NW/MP)
   - Grid connection type (select: embedded_generation | wheeling | off_grid)

2. **device_config** (grid2)
   - Number of inverters (number, "e.g. 4")
   - Number of meters (number, "e.g. 2")
   - Communications protocol (select: modbus_rs485 | modbus_tcp | sunspec | mqtt | proprietary)
   - Data interval (select: 1/5/15/30/60 minutes)

3. **data_sources** (dynamic list)
   - No initial entries → empty state: "No data sources added yet" + "Add your inverters, meters, MQTT brokers or REST APIs"
   - "+ Add data source" button (dashed border, hover to accent)
   - Per entry (nested form):
     - Label (text, "e.g. Roof inverter bank")
     - Connection type (select: modbus_tcp | sunspec | modbus_rtu_ip | mqtt | rest_api | opc_ua | push_ingest)
     - Conditional fields based on connection_type:
       - TCP protocols: IP Address / Hostname, Port (3 fields grid)
       - MQTT: Broker URL, Topic prefix (2 fields grid)
       - REST API: API endpoint URL, Authentication (none/bearer/api_key/basic), Token/API key (if auth selected)
       - Push ingest: static text "Your device will POST readings to `/api/esums-ingest/:site_key`"
     - Remove button (✕, right-aligned)
   - Helper text: "You can skip this and add data sources later from the Esums dashboard."

4. **alerts** (space-y-5)
   - Checkboxes: Email alerts | SMS alerts (flex gap-6)
   - Alert threshold %: range slider 80–100, default 90, live label
   - Notify on: 2-col grid, checkboxes for overtemp, low_irradiance, inverter_fault, comms_loss, pr_degradation

5. Onboarding data collected into `formData` object, sent via `POST /api/onboarding/step` on each "Continue"

**ipp_developer** (4 content steps, ~10 min):

1. **company_profile** (grid2)
   - Company registration number (text, "e.g. 2010/012345/07")
   - B-BBEE level (select: 1–8 or exempt)
   - REIPPPP bidder number (optional, text)
   - Primary province (select)

2. **first_project** (grid2)
   - Project name (text, col-span-2, "e.g. Karoo Wind Farm Phase 1")
   - Technology (select: solar_pv | wind | bess | hydro | biomass | csg)
   - Installed capacity MW (number, "e.g. 100")
   - Expected COD (date input, col-span-2)

3. **compliance** (space-y-4)
   - NERSA licence number (text, optional, "e.g. G/G/G/…")
   - Independent Engineer firm (text, optional, "e.g. Turner & Townsend, WSP")

**trader** (3 content steps, ~5 min):

1. **entity** (space-y-4)
   - Trading desk name (text, "e.g. ZA Power Desk")
   - FSCA FSP number (text)
   - LEI code (text, maxLength 20, "20-character LEI")

2. **risk_limits** (space-y-4)
   - Daily VaR limit ZAR (number, "e.g. 500000")
   - Max open position MWh (number, "e.g. 1000")
   - Preferred delivery horizon (select: day_ahead | week_ahead | month_ahead)

**lender** (3 content steps, ~7 min):

1. **fund_setup** (grid2)
   - Fund name (text, col-span-2, "e.g. Meridian Clean Energy Fund II")
   - AUM ZAR millions (number, "e.g. 2500")
   - Target IRR % (number, "e.g. 14")
   - Fund strategy (select: senior_debt | mezzanine | equity | blended, col-span-2)

2. **coverage** (space-y-4)
   - Min project size MW (number)
   - Max project size MW (number)
   - Preferred technologies: 2-col checkbox grid (solar_pv | wind | bess | hydro)
   - Preferred provinces: 3-col checkbox grid (9 provinces)

**offtaker** (3 content steps, ~8 min):

1. **entity** (OfftakerEntityStep — role override at line 100–104)
   - Entity type (select, col-span-2: municipality | c_and_i | soe | mining | other)
   - Annual consumption MWh (number, "e.g. 50000")
   - Peak demand MW (number, "e.g. 12")
   - Current tariff classification (text, col-span-2, "e.g. Megaflex, Homeflex")

2. **ppa_prefs** (space-y-4)
   - Preferred PPA tenor (select: 5/10/15/20/25 years)
   - Preferred technology (select: solar_pv | wind | any)
   - Green sourcing target: range slider 0–100%, 5% step, live label "{value}% of consumption"
   - Required availability: range slider 80–100%, 1% step, live label "{value}%", default 95%

**carbon_fund** (3 content steps, ~6 min):

1. **registry** (space-y-4)
   - Registry memberships: 2-col checkbox grid (vcs_verified | gold_standard | article_6_4 | cdm_poa | i_rec)
   - Conditional:
     - If vcs_verified: "Verra VCS account number" (text)
     - If gold_standard: "Gold Standard account number" (text)

2. **methodology** (space-y-4)
   - Technology focus: 2-col checkbox grid (solar_pv | wind | bess | biogas | cookstoves | forestry_redd)
   - Preferred vintage from: select (Any + 11 years centered on 2025, default Any)
   - Preferred vintage to: select (Any + same year range, default Any)

**grid_operator** (3 content steps, ~6 min):

1. **authority** (grid2)
   - Authority type (select: ntcsa | mts | redt | municipal)
   - Grid zone (text, "e.g. Cape Peninsula")
   - Managed capacity MW (number, "e.g. 5000")
   - Checkbox: Interface with Eskom Transmission

2. **services** (space-y-4)
   - Ancillary services managed: 2-col checkbox grid (frequency_response | spinning_reserve | non_spinning_reserve | voltage_support | black_start)
   - Reserve procurement capacity MW (number, "e.g. 200")

**regulator** (3 content steps, ~7 min):

1. **body** (space-y-4)
   - Regulatory body (select: nersa | fsca | dmre | del | dti)
   - Jurisdiction (provinces): 3-col checkbox grid (9 provinces)
   - Licence classes handled: 2-col checkbox grid (generation | transmission | distribution | trading | gas)

2. **jurisdiction** (space-y-4)
   - Average case volume per month (number, "e.g. 30")
   - Escalation email (email, "escalations@nersa.org.za")
   - Checkbox: Auto-assign inspections (default true)

**support** (3 content steps, ~8 min):

1. **org** (space-y-4)
   - Organisation name (text, "e.g. SolarServ (Pty) Ltd")
   - OEM brands supported: 3-col checkbox grid (sungrow | huawei | sma | fronius | abb | other)
   - Coverage provinces: 3-col checkbox grid (9 provinces)
   - Target first response hours (number, "e.g. 4")

2. **sla** (grid2)
   - P1 resolution hours (number, "4")
   - P2 resolution hours (number, "24")
   - P3 resolution hours (number, "72")
   - Escalation contact (text, "Name or email", col-span-2 implied by remaining space)

**admin** (no content steps — just welcome → complete)

---

### STATE MACHINES & TRANSITIONS

#### Initialization (useEffect on mount)
- `initializing = true` → renders "Loading…" centered on gray bg
- Calls `GET /api/onboarding/state`
- Response shape: `{ completed: bool, step: string, data: object, role: string, skipped: bool }`
  - If `completed: true` → navigate to `/launch/${role}` **[BROKEN: should be `/horizon`]**
  - If `completed: false` && `step !== 'welcome'` → setStep(serverStep) to resume
  - If `serverData` object → setFormData(serverData) to pre-fill
- `initializing = false` on `.finally()`
- Catch: silently swallow (user starts at welcome)

#### Per-step navigation
- User fills form → onChange callbacks accumulate in `formData` object
- **"Continue" / "Get started" button**: calls `handleNext()`
  - Sets `loading = true`
  - POSTs `{ step, data: formData }` to `/api/onboarding/step`
  - Backend returns `{ next_step: string | null }`
    - If `next_step === null` (no more steps): calls `POST /api/onboarding/complete`, then navigates to `/launch/${role}` **[BROKEN: should be `/horizon`]**
    - If `next_step` is truthy: setStep(next_step), form resets (formData persists)
  - On error: setError(err.message) → displays red box mt-4 below form
  - `loading = false`
- **"Back" button** (if !isFirst): finds current step in sequence, setStep to prior step
- **"Skip setup" link**: calls `handleSkip()` → `POST /api/onboarding/skip` (marks skipped=1), then navigate to `/launch/${role}` **[BROKEN: should be `/horizon`]**

#### Completion
- No "complete" step is rendered to user (filtered out of displaySteps)
- Last visible step before complete is checked via `isLastContent = step === steps[steps.length - 2]`
- CTA text: "Finish setup" (instead of "Continue") on isLastContent
- On final Continue, backend returns `next_step: null` → triggers complete flow

---

### KEYBOARD & FOCUS BEHAVIOR

**Focus management** (currently NO focus trap/inert/restore — audit flags):

- **Form inputs**: h-9, standard tab order top-to-bottom
- **Labels**: connected to inputs via `id` and `<label htmlFor>`
- **Checkboxes**: `<input type="checkbox" id={unique}>` with matching `<label htmlFor>`
- **Buttons**: standard button tab order
  - Skip button: first in tab order (left side)
  - Back button: second (if visible)
  - Continue/CTA: third
- **No focus trap**: when at final step, Tab from Continue does not return to beginning

**Keyboard shortcuts**:
- No Cmd+K, no shortcuts defined
- Enter on focused input may trigger submit if inside form (standard browser behavior) — currently No form element wraps the StepComponent, so submit is manual button click only
- Esc: no close behavior (not a modal, full-page)

**Fixed states** (aria attributes):
- No role="dialog" or aria-modal (this is a full-page wizard, not a modal overlay)
- Inputs have `aria-label` if label text is insufficient — currently labels are siblings not programmatic labels
- Button disabled states: `disabled={loading}` during submission

**TODO: Focus restoration** — no current implementation of:
- Focus trap on card
- Inert on background (not needed — bg is blank)
- Focus restore on return from error

---

### RESPONSIVE BEHAVIOR (<760px breakpoint)

**Desktop (≥760px)**:
- max-w-lg = 32rem (512px), centered, full content visible
- Grid2 = 2 columns: `grid-cols-2 gap-x-4 gap-y-3`
- Provinces/checkboxes: 3-col grid on support/regulator/lender-coverage steps
- Range sliders: full width, labels on both sides

**Mobile (<760px)**:
- max-w-lg still applies (max 512px if container allows, else full px-4)
- Tailwind `grid-cols-2` does NOT auto-reflow without explicit `sm:` breakpoint — **currently no mobile breakpoint declared**
  - **Issue**: grid-cols-2 stays 2-col even on phone
  - **Fix needed**: add `grid-cols-1 sm:grid-cols-2` (or equivalent for each grid)
- Progress dots: should wrap if many steps (not an issue — max 6 steps visible)
- Button row: flex items-center justify-between — on mobile, if buttons wrap, "Skip setup" may stack above [Back][Continue]
  - **Current behavior**: flex-wrap not declared, so buttons would stay inline and shrink
  - **Fix needed**: consider flex-wrap or stack Skip to new line if needed
- All cards/text readable at 375px viewport

---

### EMPTY & ERROR STATES

**Empty (first-time visitor)**:
- All form fields are blank (data = {})
- No pre-filled values except dropdowns showing "Select…"
- For esums_owner data_sources step: shows "No data sources added yet" message + empty button state

**Error state**:
- After failed POST, error message appears: `mt-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-[12px] text-red-700`
- Error text comes from backend: `err?.response?.data?.error || err?.message || 'Something went wrong. Please try again.'`
- Form fields retain submitted values (no reset)
- User can correct and try again without re-entering data
- Error clears on next "Continue" attempt (setError('') at handleNext start)

**Loading state**:
- `loading = true` during POST
- Button text: "Saving…" (continue) or same text with opacity-60
- All buttons disabled: `disabled={loading}`
- Form fields remain interactive (user can edit while saving, in case they spot an error)

**Network failure**:
- `.catch()` on api.get/post does not throw UI alert
- Initialization: silently falls back to welcome
- Step submission: displays generic error box
- Skip/complete: best-effort (catch and swallow)

---

### ACCESSIBILITY (a11y) — Current gaps per audit

**Missing**:
- Focus trap on card (no inert on surrounding bg, no focus return on close)
- ARIA labels on inputs — form uses visible labels only, not programmatic aria-label
- aria-live on error messages (low priority — users can see red box)
- aria-busy or aria-disabled during loading (buttons use HTML disabled attribute)
- aria-labelledby for step headings (form fields not labeled by step heading)
- aria-describedby for helper text (e.g., "You can skip this and add data sources later")

**Current**:
- Labels are visible and connected via `<label htmlFor>`
- Button text is clear
- Color is not the only indicator (borders, text, layout distinguish fields)
- Checkboxes have clear text labels

**Secondary text contrast** (audit flag):
- Step subtitle: text-[#6b7685] (gray) — may be <AA on some backgrounds
- Helper text: text-[#9ca3af] (lighter gray) — likely fails WCAG AA
- **Fix needed**: increase contrast or boost font-weight

---

### SPECIFIC FORM INTERACTIONS

#### esums_owner data_sources nested form
- **"+ Add data source"**: appends new entry with `id: String(Date.now())`
- Conditional visibility: TCP/Modbus fields (host, port, unit_id) only show if `isTcp = ['modbus_tcp', 'sunspec', 'modbus_rtu_ip', 'opc_ua'].includes(source_type)`
- MQTT fields appear only if `source_type === 'mqtt'`
- REST fields appear only if `source_type === 'rest_api'`
- Auth token field (API key) appears only if `api_auth_type === 'bearer' || 'api_key'`
- Push ingest: static help text, no input fields
- Remove button (✕): calls `removeEntry(idx)`, triggers re-render of entire sources list
- Helper text at bottom: "You can skip this and add data sources later from the Esums dashboard."

#### checkbox array fields (checkboxes that collect into arrays)
- Provinces, services, brands, technologies, etc.
- `toggleArr(data, key, val, onChange)` — toggles presence in array
- Pre-flight: `getArr(data, key): string[]` safely reads array or returns []
- All checkboxes in a group share same data.key, different data values

#### range sliders (esums alerts, offtaker ppa_prefs)
- HTML5 `<input type="range">` with Tailwind accent-[oklch(...)]
- Live label above showing current value: "Alert threshold: {value}%"
- Min/max labels below: "80%" and "100%"
- Step attribute controls granularity (1 or 5)
- Default values: alerts 90%, offtaker green 0%, offtaker availability 95%

---

### COPY STRINGS (exact as rendered)

| String | Context | Style |
|--------|---------|-------|
| "Welcome to the Consolidated Energy Cockpit, {firstName}" | WelcomeStep heading | h2, text-[22px] |
| "This will take about 2 minutes" | WelcomeStep timing | text-[12px] uppercase |
| "Step {N} of {M}" | Non-welcome step header | 11px uppercase #6b7685 |
| "{stepMeta.title}" | Step title (e.g. "Set up your first site") | h2, text-[20px] font-semibold |
| "{stepMeta.subtitle}" | Step subtitle (e.g. "Tell us about the site you want to monitor.") | text-[13px] #6b7685 |
| "e.g. Stellenbosch Solar Farm" | Placeholder text in site_name field | input::placeholder |
| "No data sources added yet" | esums_owner data_sources empty state | text-[13px] #6b7685 |
| "Add your inverters, meters, MQTT brokers or REST APIs" | esums_owner data_sources empty hint | text-[11px] #9ca3af |
| "+ Add data source" | esums_owner data_sources add button | text-[12px] font-medium |
| "You can skip this and add data sources later from the Esums dashboard." | esums_owner data_sources helper | text-[11px] #9ca3af |
| "{error?.response?.data?.error}" | Error message from server | text-[12px] text-red-700 |
| "Something went wrong. Please try again." | Fallback error message | text-[12px] text-red-700 |
| "Skip setup" | Left button, all steps | text-[12px] #6b7685 underline |
| "Back" | Right button, if !first | text-[13px] #3a4658 |
| "Get started" | Right button, if welcome | text-[13px] font-medium |
| "Continue" | Right button, content steps except last | text-[13px] font-medium |
| "Finish setup" | Right button, if isLastContent | text-[13px] font-medium |
| "Saving…" | Right button, during loading | text-[13px] font-medium |
| "Loading…" | Initialization spinner | text-sm #6b7685 |
| "Asset Owner" | role_label for esums_owner | chip label, 11px |
| "IPP Developer" | role_label for ipp_developer | chip label, 11px |
| (etc. for other 8 roles) | role_label (see ROLE_LABELS) | chip label, 11px |

---

### FIXED ISSUES (vs. audit)

**Exit to retired /launch/:role → now goes /horizon**:
- Line 193 in OnboardingWizard: `navigate(/launch/${role}, { replace: true })` — CHANGE to `/horizon`
- Line 227 (complete flow): `navigate(/launch/${role}, { replace: true })` — CHANGE to `/horizon`
- Line 253 (skip): `navigate(/launch/${role}, { replace: true })` — CHANGE to `/horizon`
- Rationale: /launch/:role redirects to /horizon anyway (App.tsx line 620), so skip the redundant hop

**esco / epc_contractor throw fix**:
- Line 182: `const steps = STEP_SEQUENCES[role] || STEP_SEQUENCES['admin'];`
- Currently: esco/epc not in STEP_SEQUENCES keys → falls back to admin sequence (welcome → complete)
- **No throw**: generic no-op behavior is correct — these roles get minimal onboarding, no error, no special handling needed
- They proceed through welcome-only, can skip, exit to horizon
- To add esco/epc-specific steps in future: add entries to STEP_SEQUENCES

**Focus trap & ARIA fixes** (out of scope for this spec — design-only; implementation deferred):
- Add focus trap hook on card div (on mount, capture first/last focusable, wrap focus)
- Add aria-label to inputs where labels are conditional or absent
- Boost contrast on secondary text (gray helper text)
- Add aria-live="polite" to error message div

---

### BACKEND API CONTRACT

**GET /api/onboarding/state** (auth required)
```json
{
  "success": true,
  "data": {
    "step": "welcome" | "site_setup" | ... | "complete",
    "data": { /* accumulated form data */ },
    "completed": false | true,
    "skipped": false | true,
    "role": "esums_owner" | "ipp_developer" | ... | "admin"
  }
}
```

**POST /api/onboarding/step** (auth required)
Request: `{ "step": "site_setup", "data": { "site_name": "...", ... } }`
Response:
```json
{
  "success": true,
  "data": {
    "ok": true,
    "next_step": "device_config" | null
  }
}
```

**POST /api/onboarding/complete** (auth required)
Response:
```json
{ "success": true, "data": { "ok": true } }
```
Side effect: fires `onboarding.completed` cascade event → provisioning rule creates entity

**POST /api/onboarding/skip** (auth required)
Response:
```json
{ "success": true, "data": { "ok": true } }
```
Side effect: fires `onboarding.skipped` cascade event, marks `onboarding_skipped = 1`

---

### WIZARD CHROME SUMMARY

The OnboardingWizard is a **full-page, centered, role-aware stepper** that guides new participants through platform-specific onboarding in 2–10 minutes depending on role. It collects provisioning data (site name, company profile, PPA prefs, etc.), persists partial progress to the backend, and on completion triggers cascade rules to create starter entities (om_sites, ipp_projects). The card-based layout with role-colored accents provides visual continuity, while keyboard + responsive design ensure accessibility. Exit always targets `/horizon` (Meridian post-Phase-E), not the retired `/launch/:role`. For unmapped roles (esco, epc), fallback to admin minimal sequence without error.
