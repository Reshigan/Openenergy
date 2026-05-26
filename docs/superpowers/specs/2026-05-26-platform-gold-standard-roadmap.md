# Platform Gold-Standard Roadmap

**Date:** 2026-05-26
**Status:** Approved scope; per-wave specs follow

**Wave progress (live):**
- Wave 1 — IPP Project Management to P6-grade — **shipped 2026-05-26.** 23 schedule routes, CPM + leveling utilities, SVG Gantt + WBS + resource panel + baselines UI, AI assists (criticality + slip forecast), 53-activity seed for `ip_001`. 647/647 unit tests, type-check clean. Migrations 092 + 093 live on prod.

## Intent

Every headline feature on the Open Energy Platform held to the gold-standard depth of its real-world discipline — "P6-grade for IPP project management" as the worked example, with the equivalent reference applied to every other workflow. Delivered in sequenced waves, one feature/discipline per wave, each wave with its own brainstorm → spec → plan → implementation cycle.

This document is the master plan. It is **not** an implementation spec. Each wave gets its own spec when we reach it.

## Discipline depth-bar matrix

Twelve disciplines, each mapped to its industry reference and the concrete capabilities that define "gold-standard depth" for the platform's purposes. Current-depth assessments are best-estimate from the L1–L5 rubric in `CLAUDE.md`; a per-wave audit refines them at wave start.

| # | Discipline | Role(s) | Reference standard | Concrete capability bar | Current | Target |
|---|---|---|---|---|---|---|
| 1 | **IPP project management** | `ipp_developer` | Primavera P6 / Asta Powerproject | WBS hierarchy; activities with FS/SS/FF/SF + lag; computed critical path + total/free float; baselines with variance; resources + calendars + leveling (resource-limited and time-limited); milestones linked to commercial events; status date / data date | L3 (flat milestones only) | Gold |
| 2 | **Trading & risk** | `trader` | CME / Eurex Trader Workstation + Bloomberg AIM | Order types (limit, market, iceberg, peg, stop, ToT); pre-trade risk (credit, exposure, mark age, halt, KYC); post-trade risk + position keeping; depth/microstructure analytics; algo execution containers; kill-switch with audit; FIX-style certified trade tape | L4 | Gold |
| 3 | **Carbon registry** | `carbon_fund` | Verra VCS + Gold Standard | Project methodology → MRV → issuance with vintage cohorts; transfer; retirement with beneficiary attribution; double-count guards across registries; ex-post vs ex-ante; chain-of-custody on every credit; certified retirement statements | L3 | Gold |
| 4 | **Lender credit & workout** | `lender` | Moody's MAPI + Bloomberg AIM credit | Covenant library + automated testing on every reporting cycle; breach detection + cure plans; restructure scenario modeling; waterfall (senior → mezzanine → equity); recovery analytics; NPL pipeline; collateral revaluation | L3 | Gold |
| 5 | **Offtaker procurement & contracts** | `offtaker` | SAP Ariba + Coupa + Icertis | e-RFx (RFI/RFP/RFQ); scoring matrices; award with audit; CLM lifecycle (draft → negotiate → execute → renew → expire); contract → invoice → dispute → resolution; supplier risk monitoring; spend analytics | L3 | Gold |
| 6 | **Grid operations** | `grid_operator` | SCADA/EMS (Hitachi / GE / Siemens) | Security-constrained economic dispatch (SCED); reserves + ancillary services; balancing market settlement; congestion management; outage scheduling with N-1 / N-1-1 contingency; topology-aware imbalance | L3 | Gold |
| 7 | **Regulator surveillance** | `regulator` | SEC MIDAS + Nasdaq SMARTS + Eventus Validus | Cross-market surveillance; MAR pattern engine (spoofing, layering, marking-the-close, wash trades, momentum ignition); case mgmt; certified report packs (NERSA); enforcement workflow; SAR equivalents | L3 | Gold |
| 8 | **ESG & sustainability** | cross-cutting | CDP + GRI + TCFD + ISSB | Double-materiality assessment; scope 1/2/3 ledger with lineage; TCFD scenario analysis; third-party assurance pack; evidence chain on every disclosed metric; CSRD/ESRS taxonomy | L4 | Gold |
| 9 | **Asset O&M (Esums)** | `wind_operator` | IBM Maximo + SAP PM + AVEVA | Work-order lifecycle (open → assigned → in-progress → completed → closed); PM schedules; technician dispatch routing; spare parts inventory; RCA workflow; MTBF/MTTR/availability; warranty claims | L4 | Gold |
| 10 | **Admin & platform ops** | `admin`, `support` | Datadog + Splunk + Okta + ServiceNow | Tenant isolation + per-tenant SLI/SLO; fine-grained RBAC + ABAC + just-in-time elevation; audit explorer with tamper-evident chain; incident response runbooks; key/secret rotation cadence; SCIM | L3 | Gold |
| 11 | **Fund / capital** | cross (`lender`, `ipp_developer`) | eFront + Investran | LP commitments; capital calls + drawdowns; distributions; IRR/MOIC/TVPI/DPI; NAV with waterfall; vintage analysis; J-curve; GP carry; LP reporting packs | L2 | Gold |
| 12 | **AI assists (cross-cutting)** | all roles | Bloomberg AI + Palantir Foundry | Inline-only (no tabs/popups) with provenance, cited evidence, undo, kill-switches; eval harness; drift detection; cost ledger; per-role/per-surface assist registry | L3 | Gold |

## Wave sequence

Twelve waves, one discipline per wave. Sequencing balances three forces: (a) user-stated priority (IPP PM first), (b) cross-wave dependencies (trading risk infra feeds regulator surveillance; carbon retirement needs trading liquidity; ESG draws from carbon + O&M), and (c) blast-radius (revenue motion and risk-of-loss surfaces earlier).

| Wave | Discipline | Why this position | Dependencies satisfied by previous waves |
|---|---|---|---|
| 1 | IPP project management | User-pinned; spine for all schedule/baseline patterns reused by Lender covenant tracking + Fund deployment | — |
| 2 | Trading & risk | Highest-volume revenue motion; risk infrastructure is needed by regulator surveillance (Wave 7) | — (independent of Wave 1) |
| 3 | Carbon registry | Regulatory exposure (Carbon Tax Act); cleaner to land before trading meets retirement | Wave 2 risk + audit patterns |
| 4 | Lender credit & workout | Reuses Wave 1 schedule + baseline patterns for covenant testing on construction milestones | Wave 1 (schedule), Wave 3 (carbon collateral) |
| 5 | Offtaker procurement & contracts | Revenue side complement to Wave 4 lender; reuses contract-state machine from existing contracts module | Wave 4 (covenant patterns for term sheets) |
| 6 | Grid operations | Operational integration; balancing settlement bridges trading (Wave 2) and metering | Wave 2 (risk/position infra) |
| 7 | Regulator surveillance | Oversight layer; depends on trading + grid for cross-market data | Waves 2, 6 |
| 8 | ESG & sustainability | Cross-cutting; draws data from carbon (Wave 3) + Esums O&M (Wave 9, but already L4) + admin audit (Wave 10) | Waves 3, 9 |
| 9 | Asset O&M (Esums) | Already L4; lift to gold focuses on PM schedules + technician dispatch + inventory + warranty | — |
| 10 | Admin & platform ops | Tenant + RBAC + audit explorer overlay; can land in parallel with Waves 8/9/11 | All prior (audit data) |
| 11 | Fund / capital | Reuses Wave 4 lender waterfall + Wave 1 IPP schedule | Waves 1, 4 |
| 12 | AI assists (cross-cutting) | Overlay; lands last because the gold-standard inline assists need each surface's gold-standard data model to draw from | All prior |

### Cross-wave dependencies (Mermaid)

```
W1 IPP-PM ─────────────┐
                       ├─→ W4 Lender ──→ W11 Fund
W2 Trading ────────────┤
                       ├─→ W6 Grid ───→ W7 Regulator
W3 Carbon ─────────────┘                      ↑
                                              │
W2 Trading ───────────────────────────────────┘
W3 Carbon ────→ W8 ESG
W9 Esums ─────→ W8 ESG
Waves 1-11 ───→ W12 AI (overlay)
```

## Sizing & sequencing rules

Each wave is **4–8 weeks of focused work**, assuming one engineer + Claude with continuous review. Faster if parallelised across worktrees; slower if interrupted.

**Per-wave shape** (every wave repeats this):

1. **Audit** (½ day) — measure current depth against the gold-standard capability bar; produce gap list
2. **Brainstorm** (½ day) — invoke `superpowers:brainstorming`; clarify constraints; produce wave spec
3. **Plan** (½ day) — invoke `superpowers:writing-plans`; produce checkpoint-able implementation plan
4. **Execute** (3–7 weeks) — TDD per `superpowers:test-driven-development`; verify per `superpowers:verification-before-completion`
5. **Review** (½ day) — `superpowers:requesting-code-review`; address feedback; merge
6. **Ship** (½ day) — deploy via existing CI; smoke on prod; mark wave complete

**Wave exit criteria** (every wave must satisfy these before next wave starts):

- All gold-standard capabilities from the depth-bar row are end-to-end functional in the UI
- L5 rubric satisfied (tamper-evident audit, certified exports where relevant, cross-system reconciliation)
- Unit tests green; new tests cover every state machine transition; mutation tests on core algorithm if applicable (CPM, leveling, dispatch, surveillance)
- Playwright `tests/video/` updated so the role's product film shows the new depth
- Cascade events fired for every mutation per existing `fireCascade()` pattern
- Smoke (`scripts/smoke-crud.sh` + `scripts/smoke-roles.sh`) green
- Migration is idempotent and follows the discipline rules in `CLAUDE.md`
- Docs updated: per-role README in `pages/src/components/pages/` if a new pattern lands

**Sequencing rules:**

- One wave in flight at a time. Parallel waves require explicit user approval and isolated worktrees.
- Wave N+1 brainstorm does not start until Wave N exits.
- Audit at Wave N start can re-prioritise: if Wave N's gap is smaller than Wave M's gap and Wave M is unblocked, swap them.
- AI assist (Wave 12) hooks into every surface as the LAST step of each wave; the inline assist for that wave's surface goes in before exit.

## Out of scope (this roadmap)

- New disciplines beyond the 12 listed (e.g., insurance, weather/forecasting, demand response). If new disciplines emerge, add a wave.
- Mobile app parity. Desktop SPA is canonical.
- Multi-region deploy beyond `oe.vantax.co.za`.
- White-label / multi-tenant rebranding beyond what `roleThemes` already supports.

## Open questions

- **Auditor / external reviewer role:** the canonical DB CHECK has 8 roles + `wind_operator` + `support`. If auditors need their own surface (Verra verifier, NERSA inspector), add as Wave 13.
- **OEM portal depth bar:** `EsumsOmFieldWosPage` hints at OEM/field tech UX. Decide whether OEM is a sub-role of `wind_operator` or its own role; resolve at Wave 9 start.
- **Liquidity provision separation:** Wave 2 trading covers proprietary + customer flow uniformly. If a market-maker / LP surface needs separation, fork at Wave 2 design.

## Next action

Proceed to **Wave 1: IPP Project Management to P6-grade**. Spec lives in `docs/superpowers/specs/2026-05-26-wave1-ipp-pm-design.md`.
