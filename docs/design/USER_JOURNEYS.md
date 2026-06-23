W53 (Credit facility origination): activate crosses SARB large-exposure when major+systemic
W54 (PPA payment security): forfeit crosses regulator every tier (signature)
W55 (Security remediation): risk_accepted+rolled_back cross regulator critical+high
W56 (Crediting-period renewal): renew crosses regulator when baseline cut >=30%
W57 (SSEG registration): refer_to_licensing crosses W49 (non-Sch-2 hand-up)
W58 (Grid capacity allocation): reject_application crosses regulator every tier (signature)
W59 (PM compliance): skip_pm crosses regulator critical+safety
W60 (Algo certification): invoke_kill_switch crosses regulator every tier (signature)
W61 (Loan transfer): approve_transfer crosses SARB ExCon every tier iff non-resident transferee
W62 (PPA termination): confirm_termination crosses regulator every tier when involuntary (signature)
W63 (Warranty recovery): complete_assessment crosses regulator every tier when systemic (signature)
W64 (Permit-to-work): issue_permit crosses regulator every tier when live-electrical/confined-space; revoke always crosses
W65 (ERPA forward delivery): verify_delivery crosses regulator iff Article 6 OR large
W66 (Complaint resolution): lodge_appeal crosses regulator every tier (signature — self-referential)
W67 (Grid code compliance): escalate_disconnection crosses regulator every tier (signature)
W68 (Counterparty margin): declare_default crosses regulator every tier (signature)
W69 (Security perfection): mark_lapsed crosses regulator every tier (signature)
W70 (REC lifecycle): claw_back crosses regulator every tier (signature)
W71 (Asset prognostics): record_failure crosses regulator when safety||high
W72 (Spare-parts provisioning): flag_backorder/cancel cross regulator on vital+high or catastrophic
W73 (PoA/CPA inclusion): exclude crosses regulator always; include when CA||large/mega
W74 (Levy assessment): enforcement+write_off cross regulator always (signature); final_demand large/major
W75 (Connection energization): issue_cod crosses regulator every tier (signature)
W76 (Trade allocation): flag_break crosses regulator every tier (signature)

---

### 9. Grid Operator (grid_operator)

**Login:** grid@openenergy.co.za / Demo@2024!
**Post-login redirect:** /launch/grid → /grid/workstation

**Launch Board KPIs:**
- Active dispatch nominations awaiting SO accept
- Curtailment events open
- Grid code non-conformances open
- Reserve activations pending settlement
- Connection energization COD events this month
- GCA queue depth (capacity allocations in progress)

**Workstation Tabs:**

| Tab | States | Key Actions | Cascades To |
|-----|--------|-------------|-------------|
| Dispatch Nominations (W13) | nominated → so_accepted → activated → performing → settled / disputed | accept, reject, activate, record_performance, settle, raise_dispute | IPP (performance record), Regulator (dispute escalation) |
| Load Curtailment (W34) | planned → notified → active → restored / escalated | issue_order, confirm_activation, confirm_restoration, escalate | IPP (curtailment claim W46 trigger), Regulator (if load-shed stage 4+) |
| Reserve Activations (W50) | requested → confirmed → activated → ramping → delivering → settle / settle_penalty | confirm, activate, record_ramp, settle, settle_penalty | IPP/Trader (provider), Regulator (severe penalty) |
| Grid Code Compliance (W67) | monitoring → non_conformance_raised → assessment → remediation → closed / escalated_disconnection | raise_non_conformance, assess, issue_remediation_order, close, escalate_disconnection | IPP (facility owner write), Regulator (every tier on escalation) |
| Connection Energization (W75) | applied → technical_review → hold_point_1 → hold_point_2 → connection_ready → energization_approved → energized → commissioned → commercial_operation / suspended / withdrawn | authorize_energization, issue_hold_point_clearance, approve_connection, issue_cod, suspend, resume, withdraw | IPP (facility write), Regulator (issue_cod every tier) |
| Capacity Allocation (W58) | application_received → completeness_check → technical_assessment → queue_position_assigned → capacity_reserved → gca_issued / rejected | assign_queue_position, reserve_capacity, issue_gca, reject_application | IPP (capacity allocation leads to W28 GCA), Regulator (reject every tier) |
| Planned Outage (W18) | submitted → so_review → approved / rejected → active → completed | so_review, approve, reject, activate, complete | IPP (split write — both parties), Regulator (extended outages) |

**Primary Journeys:**

**Journey G-1: Dispatch Nomination Acceptance**
Trigger: BRP (IPP or Trader) submits nomination for next delivery window
Steps:
1. Nomination arrives in Dispatch Nominations tab: state = nominated
2. SO reviews generation unit availability, system balance requirements
3. Action: accept → state = so_accepted; cascade to IPP IncomingPanel (prepare to dispatch)
4. Grid operator activates at delivery window start: activate → state = activated
5. Record real-time performance data against nominated volume: record_performance
6. At window close, settle MWh delivered vs nominated: settle → state = settled
7. If under-performance: settle_penalty applied; cascade to reserve activation W50 for deficit
Outcome: Delivered MWh confirmed; financial settlement record created
Cross-role: IPP executes dispatch; Trader tracks position; settlement books MWh vs contract
Regulation: Grid Code Schedule 3 BRP obligations; NERSA dispatch protocols

**Journey G-2: Load Curtailment Order (Stage 4+ Load Shedding)**
Trigger: NTCSA declares load-shed stage 4+; curtailment schedule issued
Steps:
1. Load curtailment case opened: state = planned
2. Issue curtailment order to affected connections: issue_order → state = notified
3. Confirm facility acknowledgment: confirm_activation → state = active
4. Monitor reduced load; record MW curtailed per interval
5. Restore when stage drops: confirm_restoration → state = restored
6. If stage escalates further or restoration refused: escalate → state = escalated → crosses Regulator
7. Curtailment record triggers W46 deemed-energy claim in IPP/Offtaker IncomingPanels
Outcome: Curtailment event documented; cross-role claim chain initiated
Cross-role: IPP files deemed-energy compensation claim (W46); Offtaker PPA curtailment clause triggered
Regulation: Grid Code CSC-1; ERA Section 21 grid security obligations

**Journey G-3: Reserve Activation & Settlement**
Trigger: System imbalance; frequency deviation beyond threshold
Steps:
1. Reserve activation request raised: state = requested
2. Confirm provider availability: confirm → state = confirmed
3. Issue activation instruction: activate → state = activated
4. Track MW ramp against required ramp rate: record_ramp → state = ramping → state = delivering
5. At activation close: settle (on-spec) or settle_penalty (under-spec) → state = settled
6. Cascade to Trader (ancillary product position), IPP (generation unit record)
Outcome: Ancillary service settled; frequency-response record in audit chain
Cross-role: IPP generator delivers; Trader ancillary desk tracks; Regulator receives on penalty
Regulation: Grid Code Schedule 5 ancillary services; NTCSA SOC reserve requirements

**Journey G-4: Grid Code Non-Conformance (W67)**
Trigger: Automated telemetry alarm or manual detection of facility non-conformance
Steps:
1. Non-conformance raised in Grid Code Compliance tab: state = non_conformance_raised
2. Technical assessment: record fault type, voltage/frequency deviation, protection settings
3. Issue remediation order to facility owner (IPP): state = remediation; cascade to IPP IncomingPanel
4. IPP responds with remediation plan; SO monitors compliance
5. On satisfactory correction: close → state = closed
6. If facility fails to comply within SLA: escalate_disconnection → state = escalated_disconnection → crosses Regulator every tier
Outcome: Grid code conformance restored; evidence chain for NERSA audit
Cross-role: IPP facility owner must implement remediation (split write); Regulator receives escalation
Regulation: NERSA Grid Code NRS 097; Grid Code C-2 connection compliance

**Journey G-5: New Connection Energization to COD (W75)**
Trigger: W58 capacity allocation confirmed + W28 GCA executed; facility ready for energization
Steps:
1. Energization application received: state = applied
2. Technical review against grid code: technical_review → hold_point_1 (protection settings witnessed)
3. Hold point 1 clearance issued: hold_point_2 (metering commission witnessed)
4. Connection ready certificate: state = connection_ready
5. Authorize energization: authorize_energization → state = energization_approved; crosses Regulator (transmission+bulk tiers)
6. Energize facility under SO supervision: state = energized
7. Commission tests pass: state = commissioned
8. Issue Commercial Operation Date certificate: issue_cod → state = commercial_operation; crosses Regulator every tier (signature)
Outcome: Facility enters commercial operation; COD certificate issued; revenue clock starts
Cross-role: IPP facility owner (split write); Regulator receives COD notification; Lender drawdown conditions met
Regulation: NERSA Grid Code C-5; DMRE COD certificate requirements; ERA Section 21

**Journey G-6: Planned Outage Approval (W18)**
Trigger: IPP submits planned outage notification for maintenance window
Steps:
1. IPP files outage request: state = submitted (IPP write)
2. SO reviews system impact: dispatch adequacy, reserve margin, competing outages
3. Approve or reject: approve/reject → state = approved/rejected; cascade to IPP IncomingPanel
4. At maintenance start: activate → state = active (joint IPP+SO record)
5. On restoration: complete → state = completed
6. Extended outages (>72h) cross Regulator for grid security monitoring
Outcome: Planned outage executed safely; system adequacy maintained
Cross-role: IPP split-write (W18 first IPP↔Grid role-split write); Regulator on extended
Regulation: NERSA Grid Code D-2 planned outage notification; ERA Section 21

**Incoming Panel (actions arriving from other roles):**
W13 nominations from IPP/Trader BRP
W28 GCA execution confirmation from IPP triggers energization readiness
W34 curtailment triggers W46 deemed-energy at IPP/Offtaker
W46 PPA curtailment claims from Offtaker reference curtailment events
W50 reserve activation requests from Trader ancillary desk
W58 capacity allocation feeds queue before GCA
W67 non-conformance remediation responses from IPP
W75 energization split writes with IPP

---

### 10. Support (support)

**Login:** support@openenergy.co.za / Demo@2024!
**Post-login redirect:** /launch/support → /support/workstation

**Launch Board KPIs:**
- Open P1 tickets (SLA ≤60min first response)
- Open P2 tickets (SLA ≤4h)
- Breach count last 7 days
- RMAs awaiting return shipment
- Active problem records (ITIL W41)
- Pending RFC approvals (W47 CAB)
- Security vulnerabilities CVSS ≥7.0 unpatched (W55)
- Work orders dispatched today (W16)

**Workstation Tabs:**

| Tab | States | Key Actions | Cascades To |
|-----|--------|-------------|-------------|
| Tickets (W14) | open → triaged → assigned → in_progress → resolved → closed / breached | triage, assign, escalate_p1, resolve, close | IPP/Esums owner (asset affected), Regulator (P1 safety breach) |
| Work Orders (W16) | raised → planned → parts_checked → dispatched → on_site → completed / failed | plan, check_parts, dispatch, record_on_site, complete, fail_safe | IPP site (WO affects asset), W59 PM schedule |
| RMA / Warranty Claims (W15) | filed → oem_acknowledged → diagnosis → repair_or_replace → return_shipped → received → closed / escalated | acknowledge, diagnose, approve_repair, approve_replace, ship_return, receive | OEM (external), IPP (asset return) |
| Problem Management (W41) | detected → logging → categorisation → investigation → root_cause_identified → workaround → rfC_raised → resolved → closed | log, categorise, investigate, identify_root_cause, raise_change, close | W47 RFC (raise_change handoff), Regulator (major problems) |
| Change Enablement (W47) | requested → assessment → cab_review → approved → scheduled → implementing → implemented → pir → closed / emergency / rolled_back / cancelled | assess, schedule_cab, approve, schedule, implement, pir_review, close, emergency_approve, roll_back | W41 (receives raise_change), W55 (security patches), Regulator (emergency roll_back) |
| Security Remediation (W55) | disclosed → triage → assessment → remediation_plan → remediation_in_progress → testing → deployed / risk_accepted / rolled_back | triage, assess, plan_remediation, implement, test, deploy, accept_risk, roll_back | W47 RFC (patch deployment), Regulator (CVSS critical+high on risk_accepted/rolled_back) |
| Asset Prognostics (W71) | collecting → anomaly_detected → diagnosed → prognosticated → work_planned → work_executing → work_complete / failure_recorded | detect_anomaly, diagnose, prognosticate, plan_work, execute, close, record_failure | W16 WO (work_planned triggers dispatch), W59 PM (update schedule), Regulator (safety/high on failure) |
| Spare Parts (W72) | demand_identified → requisitioned → po_raised → backorder / in_transit → received → qa_passed → in_stock → reserved → issued | requisition, raise_po, flag_backorder, receive, pass_qa, reserve, issue | W16 WO (parts required), Regulator (vital+high backorder), IPP (site delivery) |

**Primary Journeys:**

**Journey S-1: P1 Incident → Problem → Change (ITIL Full Chain)**
Trigger: Inverter fault causing site outage; multiple tickets received from same asset cluster
Steps:
1. P1 ticket created: state = open; SLA clock starts (60min first response, 120min resolution, 240min close)
2. Triage confirms safety impact: escalate_p1 → assign to senior engineer
3. Workaround deployed remotely; ticket resolved within SLA
4. Pattern detected across 3 sites → Problem record raised (W41): state = detected → logging → investigation
5. Root cause identified (firmware defect): identify_root_cause → state = root_cause_identified
6. raise_change handoff to W47 RFC: state = rfc_raised in W41; RFC state = requested in W47
7. CAB reviews firmware patch: cab_review → approved → scheduled
8. W55 security remediation also opened if CVSS ≥7.0
9. Patch deployed via W47: implement → pir_review → closed
10. W41 problem record closed; all linked tickets auto-resolved
Outcome: Systemic fault root-caused and patched; ITIL evidence chain complete
Cross-role: IPP site receives firmware update; Regulator receives if CVSS critical (W55)
Regulation: OHSA safety notification; Cybercrimes Act s54 if cyber-vector (W26)

**Journey S-2: Work Order Dispatch with Predictive Trigger (W71→W16)**
Trigger: W71 asset prognostics detects anomaly (Mahalanobis distance >3σ) on wind turbine
Steps:
1. W71: anomaly_detected → diagnose (ML fault fingerprint matches bearing degradation)
2. RUL computed: 14 days to failure; W71 state = prognosticated
3. plan_work → W16 work order raised: state = raised
4. Spare parts check (W72): bearing in stock → reserved → issued to technician
5. W16: dispatch technician → on_site → bearing replaced → complete
6. W71: work_complete closes prognostic cycle; next anomaly baseline reset
7. Savings-vs-NTT ledger updated (quantified avoided-failure cost)
Outcome: Proactive maintenance executed; unplanned downtime avoided; W71 beats NTT benchmark
Cross-role: IPP site asset; W59 PM schedule updated to reflect actual condition
Regulation: IEC 61724 O&M records; W51 availability guarantee SLA protected

**Journey S-3: RMA / Warranty Claim Lifecycle (W15)**
Trigger: Faulty inverter identified; within OEM warranty period
Steps:
1. RMA filed by support/IPP: state = filed
2. OEM acknowledged; diagnosis window opens
3. diagnose → defect confirmed: approve_repair or approve_replace
4. Ship return to OEM: ship_return → state = return_shipped
5. OEM repairs/replaces; ships back
6. Receive and inspect: receive → state = received → closed
7. If systemic defect across fleet: escalate to W63 warranty recovery (cost-recovery against supplier)
Outcome: Faulty unit replaced; warranty evidence documented for W63 if systemic
Cross-role: IPP site (asset offline during RMA); W63 triggered if systemic
Regulation: CPA §56/§61 warranty rights; OEM contract terms

**Journey S-4: Security Vulnerability Triage to Patch (W55)**
Trigger: CVE published for OT SCADA software in use across wind sites; CVSS 8.5
Steps:
1. W55 disclosed: state = disclosed; triage computes CVSS tier = critical
2. SLA clock: critical CVSS → tight remediation window
3. triage → assess: scope of affected assets, attack vector (network vs local)
4. plan_remediation: patch schedule; W47 RFC raised (emergency fast-path if ≥critical)
5. ECAB emergency approval in W47: emergency_approve → scheduled → implementing
6. Deploy patch across OT assets: W55 state = deployed
7. Post-implementation review in W47: pir_review → closed
8. If patch causes instability → roll_back in W55/W47: crosses Regulator (CVSS critical+high)
Outcome: Critical vulnerability remediated within SLA; no regulatory crossing required if deployed successfully
Cross-role: IPP site OT systems; Grid (if SCADA touches grid interface W67)
Regulation: Cybercrimes Act s54; POPIA s22 (if data exfiltration risk W26)

**Journey S-5: PM Schedule Compliance (W59)**
Trigger: Scheduled preventive maintenance due per IEC 62446 RCM tiers; site PM overdue
Steps:
1. PM compliance record: state = work_assigned (auto-triggered by calendar)
2. Site conditions prevent execution: deferral request submitted
3. If safety-critical tier: reject_deferral → work_assigned (cannot defer); skip_pm crosses Regulator
4. If non-critical tier: approve_deferral → state = deferred
5. W16 work order dispatched for rescheduled date
6. PM executed: complete → state = completed
7. W51 availability guarantee: PM completion resets availability baseline
Outcome: PM compliance documented; SLA-driven deferral decisions auditable
Cross-role: IPP site; W51 availability guarantee; W71 prognostics (real condition vs scheduled)
Regulation: IEC 62446 §6 periodic inspection; W51 OEM contract

**Journey S-6: Spare Parts Shortage — Vital Part Backorder (W72)**
Trigger: W71 RUL triggers demand for vital spare (transformer); supplier cannot fulfil
Steps:
1. demand_identified (source: predictive_rul from W71) → requisitioned → po_raised
2. Supplier confirms 8-week lead time: flag_backorder → state = backorder; crosses Regulator (vital tier)
3. Alternative supplier search; split PO
4. Partial stock arrives: receive → qa_passed → in_stock (partial)
5. Reserve critical quantity for highest-risk asset (VED vital score): reserve
6. Issue to technician: issue → W16 WO proceeds
7. Remaining backorder monitored; weekly dunning to supplier until fulfilled
Outcome: Vital spare secured; asset risk mitigated; regulatory backorder notification on file
Cross-role: W16 WO unblocked; W71 prognostic risk score updated; IPP site availability protected
Regulation: IEC 62402 obsolescence management; W51 availability guarantee contractual exposure

**Incoming Panel (actions arriving from other roles):**
W13 dispatch performance shortfalls → support alerted for technical investigation
W16 WO completion feeds W71 prognostic reset
W18 planned outage windows inform WO scheduling
W25 HSE incidents (W25 cross-mounts with Esums + IPP) → support safety follow-up
W41 problem records may originate from IPP-reported faults
W64 permit-to-work issued by grid/IPP → support technician holds until permit granted

---

## 5. Cross-Role Journey Sequences

### 5.1 Power Trade Lifecycle (Trader → Grid → Settlement)

End-to-end flow from order placement through physical delivery to financial settlement.

| Step | Role | Action | State / Event | Cascades To |
|------|------|--------|---------------|-------------|
| 1 | Trader | Pre-trade guards evaluated (credit, exposure, KYC, mark age, halt) | Guard PASS | — |
| 2 | Trader | Submit limit order to OrderBook DO | order_placed | OrderBook shard (energy_type × delivery_day) |
| 3 | Trader | Matching engine matches contra order | trade_matched | Both traders, Settlement, Grid |
| 4 | Grid Operator | Dispatch nomination submitted by BRP | nominated | Grid SO inbox |
| 5 | Grid Operator | SO accepts nomination | so_accepted | IPP (generate), Trader (position update) |
| 6 | Grid Operator | Physical delivery window | activated → performing | MWh metering records |
| 7 | Grid Operator | Delivery recorded; performance confirmed | settled (W13) | Settlement module |
| 8 | Settlement | DvP atomic settlement: Trader books P&L | settled (W3) | Trader P&L, Admin revenue |
| 9 | Settlement | CPMI-IOSCO Cover-1 margin gate passed | margin_released | Lender (collateral return) |
| 10 | Trader | OTC trade repository report filed (W44) | submitted → accepted | FSCA (regulatory crossing if breach) |
| 11 | Admin | Commercial intercept: fee split applied | fee_event fired | Admin revenue dashboard |

Key god nodes: fireCascade() fans out every state transition; OrderBook DO serialises matching; locks.ts prevents double-match; getCurrentUser() enforces tenant isolation throughout.

---

### 5.2 IPP Project to COD (IPP → Lender → Regulator → Grid)

Full project lifecycle from REIPPPP award through commercial operation.

| Step | Role | Action | Chain | Key Output |
|------|------|--------|-------|------------|
| 1 | IPP | REIPPPP procurement award; project created (W19) | nominated → awarded | Lender IncomingPanel: project bankable |
| 2 | Lender | Credit facility application (W53) | requested → credit_approved | SARB large-exposure crossing (major+systemic) |
| 3 | IPP | Construction commences (W20) | under_construction → milestone_1 | IE certificate gates |
| 4 | Lender | Drawdown against construction milestone (W21) | drawdown_requested → disbursed | IE+CP gate; two-party split write |
| 5 | Regulator | Licence application adjudicated (W49) | completeness → council_decision → granted | ERA s8-11; grant crosses Regulator major-only |
| 6 | IPP | Security/collateral perfected (W69) | filed → perfected | Lender (perfection confirms security package) |
| 7 | Grid | Capacity allocation in queue (W58) | application_received → capacity_reserved | IPP (gca_ref issued) |
| 8 | Grid | GCA executed (W28) | offer → signed | 3-terminal: IPP↔Grid; NERSA Grid Code C-1 |
| 9 | IPP+Grid | Energization hold points witnessed (W75) | hold_point_1 → connection_ready | Split write; Regulator (authorize_energization) |
| 10 | Grid | COD certificate issued (W75) | commercial_operation | Regulator every tier (signature); Lender drawdown conditions met |
| 11 | IPP | Bond/insurance active (W10) | tracked → expiry warnings | Countdown not counter pattern |
| 12 | IPP | ED commitment (REIPPPP, W27) | committed → reporting | DMRE penalty + DTI escalation if breach |

---

### 5.3 Carbon Credit to Tax Offset (Carbon Fund → Regulator → IPP → Admin)

Full carbon lifecycle from project registration through retirement to tax claim.

| Step | Role | Action | Chain | Key Output |
|------|------|--------|-------|------------|
| 1 | Carbon Fund | Project registered + PDD submitted (W37) | preparation → dna_approved | Gold Standard/Verra/Art 6.4 + DFFE DNA |
| 2 | Carbon Fund | MRV verification (W11) | validation → site_audit → cra → issuance | 14-state UNFCCC verification; credits issued |
| 3 | Carbon Fund | If PoA: CPA inclusion (W73) | eligibility_screen → inclusion | Programme-cap headroom + geo-overlap check |
| 4 | Carbon Fund | Forward ERPA (W65) | negotiating → executed → delivery_confirmed | INVERTED SLA; Article 6 crosses Regulator |
| 5 | Carbon Fund | ITMO corresponding adjustment (W4) | pending → adjusted | UNFCCC Art 6 ledger; country-level crossing |
| 6 | Carbon Fund | Credits retired (W17) | pending_retirement → retired | 7-state; per-scope SLAs; Article 6 24h |
| 7 | IPP | REC/GO certificate lifecycle (W70) | issued → retired | Scope-2 claim; claw_back crosses Regulator |
| 8 | IPP | Carbon offset claim against tax liability (W48) | submitted → assessed → granted | Carbon Tax Act §13; offset cap 10% annex_2 |
| 9 | Admin | SARS crossing on major; levy reconciled (W74) | — | Regulator levy assessment closed |
| 10 | Regulator | Disposition of any regulatory crossings (W31) | received → disposition | NERSA §10; INVERTED SLA |

---

### 5.4 PPA Dispute (Offtaker → Regulator → IPP)

Under-delivery dispute triggering cure window, arbitration, and regulatory escalation.

| Step | Role | Action | Chain | Key Output |
|------|------|--------|-------|------------|
| 1 | Offtaker | Monthly delivery shortfall detected | ppa-delivery-shortfall event | IPP IncomingPanel: claim raised |
| 2 | Offtaker | Take-or-pay claim opened (W32) | raised → quantum_assessed | IFRS 16 + NERSA s34; INVERTED SLA |
| 3 | IPP | Respond to take-or-pay claim | acknowledge → dispute or accept | Counter-evidence submitted |
| 4 | Offtaker | PPA tariff CPI indexation reviewed (W39) | under_review → agreed | Annual repricing; MIXED SLA |
| 5 | Offtaker | Curtailment claim if SO-caused (W46) | raised → quantum → settled | Supply-side mirror; seller-write split |
| 6 | Offtaker | Regulator complaint filed if dispute unresolved (W66) | lodged → under_review | ERA s30; URGENT SLA |
| 7 | Regulator | Complaint assigned; disposition process (W31+W66) | investigation → proposed_decision | lodge_appeal crosses Regulator every tier |
| 8 | Regulator | Compliance inspection triggered (W40) | planned → findings_issued | NERSA §10+§34; PROACTIVE |
| 9 | IPP | Forced to comply or face penalty | remediation | Regulator penalty notice |
| 10 | Offtaker | PPA termination if cure period expires (W62) | assessment → confirm_termination | confirm_termination crosses Regulator every tier when involuntary |

---

### 5.5 Loan Default + Step-In (Lender → Regulator → IPP)

Covenant breach escalating through dunning cycles to enforcement and step-in.

| Step | Role | Action | Chain | Key Output |
|------|------|--------|-------|------------|
| 1 | Lender | Covenant certificate due; IPP fails to deliver (W38) | overdue → breach | Dunning cycle 1 triggered |
| 2 | Lender | Watchlist entry; acceleration notice (W38 → W45) | accelerated | W45 picks up; W38 terminates at acceleration |
| 3 | Lender | Loan default declared (W45) | default_declared → event_of_default | URGENT SLA; two-party split write |
| 4 | Lender | Enforcement options evaluated: step-in / receivership / restructure | enforcement | SARB impairment hard line |
| 5 | Lender | Step-in notice issued to IPP | step_in_notice → stepping_in | IPP IncomingPanel: control transfer notice |
| 6 | IPP | Step-in acknowledged; operational handover | acknowledge_step_in | Lender takes operational control |
| 7 | Regulator | W6 dunning cycle-3 auto-escalates to Regulator inbox | cycle_3_escalated | NERSA review of licence status |
| 8 | Regulator | Compliance notice issued to project (W40) | notice_issued | ERA §34/§35 enforcement |
| 9 | Lender | Write-off if restructure fails (W45) | written_off | Crosses ALL tiers (SARB impairment signature); SARB large-exposure report |
| 10 | Regulator | Licence suspension/revocation review (W33) | suspension_review | ERA s14-16; may trigger W49 for new applicant |

---

## 6. Feature Depth Reference

### L1-L5 Rubric

| Level | Definition | Acceptable For |
|-------|-----------|----------------|
| **L1** | Mock UI only — static screens, no backend | Prototyping only |
| **L2** | CRUD endpoints + list/form UI | Not acceptable for new features |
| **L3** | State machine + server-side validation + audit on transitions | Minimum for any new feature |
| **L4** | Full workflow: pre-trade gating, downstream cascades, calendar/timer-driven, structured reason codes, dunning/escalation, evidence chain | Default target for all new work |
| **L5** | Regulator-grade: tamper-evident audit chain, certified exports (NERSA/EMIR), reconciliation against external systems | Required for regulatory-facing chains |

### Examples by Role

**Trader — L4 examples:**
- W29 Position Limit: state machine (none→warning→breach→escalated) + pre-trade guard integration + forced-liquidation crossing ALL tiers + FSCA notification
- W36 Best Execution/RFQ: 11-state + MIXED SLA + post-trade recon against W44 OTC repository
- W52 Market Abuse Surveillance: file_stor crosses FSCA every tier (signature) + tamper-evident case record (L5 boundary)

**IPP Developer — L4/L5 examples:**
- W20 Construction/COD: 10-state + IE certification gate + INVERTED tier SLA + NERSA §C-5 COD certificate (L5 element)
- W19 REIPPPP Procurement: 12-state + INVERTED SLA (R500m+ gets more time) + DMRE/DTI crossings
- W131 Stage Gates DG0–DG4: Phase-E CPM/Gantt milestone chain + INVERTED SLA + signature reject_gate

**Lender — L4/L5 examples:**
- W45 Loan Default: picks up from W38 acceleration → enforcement/step-in/restructure/write-off + write_off crosses ALL tiers (SARB signature) (L5)
- W53 Credit Origination: INVERTED SLA + SARB large-exposure at activate (not approval)
- W69 Security Perfection: Deeds/Movable/STRATE + mark_lapsed crosses Regulator every tier

**Offtaker — L4 examples:**
- W32 Take-or-Pay: IFRS 16 + NERSA s34 + INVERTED SLA (quantum anchors 90d) + arbitration crosses ALL
- W46 Curtailment Claim: supply-side mirror + seller-write split + settles vs W22 PPA at W39 tariff
- W62 PPA Termination: ETA buy-out basis CAUSE-driven + involuntary confirm_termination crosses Regulator every tier

**Carbon Fund — L4/L5 examples:**
- W11 MRV Chain: 14-state UNFCCC verification (L5 — external registry reconciliation)
- W4 Article 6 ITMO: corresponding-adjustment ledger (L5 — UNFCCC bilateral agreement)
- W48 Carbon Offset Claim: SARS reconciliation + offset cap enforcement (L5 boundary)

**Regulator — L5 throughout:**
- W31 Disposition: NERSA §10 + INVERTED SLA + receives from every other role's regulator crossings
- W40 Compliance Inspection: PROACTIVE + TWO closed terminals (clean vs enforced) + NERSA §34/§35
- W43 MYPD Tariff Determination: §15-16 + MYPD + 12-state economic price control

**Grid Operator — L4/L5 examples:**
- W75 Connection Energization: split write IPP↔SO + issue_cod crosses Regulator every tier (L5 COD certificate)
- W67 Grid Code Compliance: escalate_disconnection crosses Regulator every tier + split write operator↔facility
- W34 Load Curtailment: NERSA §CSC-1 + URGENT SLA (higher load-shed stage = tighter)

**Support — L4 examples:**
- W71 Asset Prognostics: 6-method anomaly ensemble + RUL + 12-mode physics fault fingerprinting + NTT-beating savings ledger (L4/L5 boundary)
- W47 Change Enablement: ECAB emergency fast-path + roll_back crosses Regulator + receives W41 raise_change
- W55 Security Remediation: CVSS tiering re-derived at /triage + risk_accepted crosses Regulator critical+high

**Admin — L4/L5 examples:**
- Cascade Registry: evaluates 74+ chain events → fires follow-on actions to counterparty IncomingPanels
- Commercial Intercept (W4 Layer B): payer_resolution + fee splits + admin-revenue route + Layer D metrics-rollup cron
- SLA Escalation Chain: auto-escalates SLA-breached chains to Regulator inbox without manual trigger

### Anti-patterns (what L2 looks like in this codebase)

- A tab that lists records and has a "New" modal with no state machine behind it
- An action button that writes one database row with no fireCascade() call
- A form submission with no audit row in `oe_audit_events`
- A cross-role notification that is not delivered via cascade_registry rules (hardcoded IF statements instead)
- An AI suggestion without a `ai_decisions` table row for the audit trail

Every new surface added to this platform must pass the L3 minimum bar at merge time: state machine defined, transitions validated server-side, audit row written, fireCascade called with correct entity_type and event.
