-- Wave 31 — Regulator Compliance Notice Disposition chain — NERSA Act §10
-- 10 cases spanning all 11 states with cross-wave provenance into prior waves.

INSERT OR IGNORE INTO oe_disposition_cases
  (id, case_number, source_inbox_id, source_event, source_entity_type, source_entity_id, source_wave, source_party,
   notice_subject, severity_tier, assigned_officer, assigned_directorate, investigation_findings, required_action,
   action_evidence_ref, disposition_outcome, referred_authority, referred_ref, council_panel_ref, council_minute_ref,
   section10_report_ref, reason_code, rod_notes, regulator_authority, regulator_ref, chain_status,
   received_at, triaged_at, assigned_at, investigating_at, action_required_at, action_in_progress_at,
   action_completed_at, closed_at, escalated_at, dismissed_at, referred_at,
   sla_deadline_at, last_sla_breach_at, escalation_level, created_by)
VALUES
  -- 1) RECEIVED — fresh inbox crossing from W18 critical planned outage
  ('disp_001', 'DISP-2026-0001', 'rinbox_o_2026_0087', 'outage.commenced',
   'planned_outage', 'po_2026_0087', 'W18', 'Eskom Holdings',
   'Critical outage Camden Unit 6 — 380MW unplanned mobilisation post grid-code C-15 dispatch refusal',
   'critical', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, 'NERSA', NULL, 'received',
   '2026-05-27T22:15:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   '2026-05-28T02:15:00Z', NULL, 0, 'system'),

  -- 2) TRIAGED — W26 cyber major breach awaiting officer assignment
  ('disp_002', 'DISP-2026-0002', 'rinbox_c_2026_0044', 'cyber.escalated',
   'cyber_incident', 'cyb_2026_0044', 'W26', 'Open Energy Trading (Pty) Ltd',
   'Cyber incident — credential stuffing detected on trader workbench; POPIA s22 IR notified',
   'high', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, 'NERSA', NULL, 'triaged',
   '2026-05-27T08:00:00Z', '2026-05-27T18:42:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   '2026-05-30T18:42:00Z', NULL, 0, 'system'),

  -- 3) ASSIGNED — W30 senior_a clawback awaiting investigation
  ('disp_003', 'DISP-2026-0003', 'rinbox_d_2026_0008', 'disbursement.clawback_executed',
   'disbursement_case', 'dsb_008', 'W30', 'Standard Bank ↔ Coega Industrial Solar',
   'Disbursement clawback executed R78.5m senior_a tranche — UOP_DIVERSION; SARB-EXC-2026-0119 + EP-IVT-2026-0044',
   'critical', 'M. Mthembu', 'Electricity Subcommittee — Markets',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, 'NERSA', 'NERSA-DISP-2026-0003', 'assigned',
   '2026-05-26T14:30:00Z', '2026-05-26T17:08:00Z', '2026-05-27T09:15:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   '2026-05-29T09:15:00Z', NULL, 0, 'admin@openenergy.co.za'),

  -- 4) INVESTIGATING — W29 prop tier margin call under desk-level investigation
  ('disp_004', 'DISP-2026-0004', 'rinbox_p_2026_0019', 'poslimit.margin_call_issued',
   'poslimit_case', 'pos_005', 'W29', 'Open Energy Markets (Pty) Ltd',
   'Position limit hard breach — IVT desk REC_2026Q2_ZA at 124% utilisation, R620m margin called',
   'high', 'T. Naidoo', 'Electricity Subcommittee — Trading',
   'Initial desk review: utilisation peak 124.3% at 2026-05-26T11:42 driven by Hartebeespoort BESS forward sell at REC_2026Q2_ZA delivery point. Margin call satisfied within 4h; remediation needed for pre-trade gate calibration.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, 'NERSA', 'NERSA-DISP-2026-0004', 'investigating',
   '2026-05-26T11:50:00Z', '2026-05-26T13:18:00Z', '2026-05-26T16:00:00Z', '2026-05-27T09:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   '2026-06-17T09:00:00Z', NULL, 0, 'admin@openenergy.co.za'),

  -- 5) ACTION_REQUIRED — W23 catastrophic insurance decline requires written reasons
  ('disp_005', 'DISP-2026-0005', 'rinbox_i_2026_0019', 'insurance.claim_declined',
   'insurance_claim', 'ic_008', 'W23', 'AIG South Africa ↔ Hartebeespoort BESS',
   'Insurance claim R95m declined on Section 38 catastrophic policy — written reasons + ombud notice required',
   'high', 'P. Khumalo', 'Insurance Supervisory — FSCA liaison',
   'Investigation complete: decline grounds (transit-period exclusion) plausible but ambiguous in policy wording. Recommendation: require insurer to file written reasons under PPR Rule 17.5(c) + offer ombud route to IPP.',
   'Insurer must file written reasons within 14 days; IPP must be given ombud-route notice under FSCA PPR 17.5(c).',
   NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, 'NERSA', 'NERSA-DISP-2026-0005', 'action_required',
   '2026-05-24T10:00:00Z', '2026-05-24T16:20:00Z', '2026-05-25T08:00:00Z', '2026-05-25T11:30:00Z', '2026-05-27T15:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL,
   '2026-06-03T15:00:00Z', NULL, 0, 'admin@openenergy.co.za'),

  -- 6) ACTION_IN_PROGRESS — W27 high-scoring ED commitment breach mid-remediation
  ('disp_006', 'DISP-2026-0006', 'rinbox_e_2026_0091', 'ed.escalated',
   'ed_commitment', 'ed_006', 'W27', 'Renewable Energy SA (Pty) Ltd',
   'REIPPPP ED commitment breach — ownership shortfall 23% on Round 4 commitment; DMRE 30d cure plan executing',
   'high', 'N. Dlamini', 'DMRE Liaison — REIPPPP',
   'IPP filed cure plan 2026-05-18: 12% additional BBBEE Level 2 ownership via NewCo placement closing 2026-06-15. Verification underway with DTI Codes Council.',
   'IPP must close NewCo ownership placement and file DTI Codes Council verification certificate; IPPO penalty pool R3.2M conditionally suspended pending verification.',
   'CERT-DTI-2026-PEND-0091', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, 'NERSA', 'NERSA-DISP-2026-0006', 'action_in_progress',
   '2026-05-18T09:00:00Z', '2026-05-18T11:00:00Z', '2026-05-18T14:00:00Z', '2026-05-19T09:00:00Z', '2026-05-22T15:00:00Z', '2026-05-25T09:00:00Z', NULL, NULL, NULL, NULL, NULL,
   '2026-06-08T09:00:00Z', NULL, 0, 'admin@openenergy.co.za'),

  -- 7) ACTION_COMPLETED — W21 senior drawdown reject — corrective filings done
  ('disp_007', 'DISP-2026-0007', 'rinbox_d_2026_0019', 'drawdown.rejected',
   'drawdown_case', 'dd_007', 'W21', 'ABSA ↔ Riebeeckstad Solar',
   'Senior drawdown rejected R220m — CP fail on cession of receivables; SARB large-exposure notified',
   'high', 'A. van der Merwe', 'Electricity Subcommittee — Markets',
   'IPP cured CP defects (cession of receivables filed at CIPC + lender accepted re-submission 2026-05-22). Tranche re-released 2026-05-23 under amended facility schedule.',
   'IPP filed cured cession + lender confirmed release; both filed within DG 30d window. No further action required.',
   'CIPC-CESSION-2026-0019', NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, 'NERSA', 'NERSA-DISP-2026-0007', 'action_completed',
   '2026-05-15T11:00:00Z', '2026-05-15T13:30:00Z', '2026-05-15T16:00:00Z', '2026-05-16T10:00:00Z', '2026-05-18T09:00:00Z', '2026-05-20T09:00:00Z', '2026-05-25T14:00:00Z', NULL, NULL, NULL, NULL,
   '2026-05-30T14:00:00Z', NULL, 0, 'admin@openenergy.co.za'),

  -- 8) CLOSED — W22 strategic PPA termination resolved
  ('disp_008', 'DISP-2026-0008', 'rinbox_pp_2026_0044', 'ppa.contract_terminated',
   'ppa_contract', 'ppa_008', 'W22', 'Eskom Holdings ↔ Hartebeespoort BESS',
   'Strategic PPA terminated 2026-04-29 — termination fee R420m disputed; Section 34 disposition required',
   'critical', 'M. Mthembu', 'Electricity Subcommittee — Markets',
   'Parties agreed accelerated mediation under Section 34(5). Mediator (Justice Madonsela ret.) recommended R310m settlement; both parties accepted. Council Section 10 minute filed.',
   'Parties to execute settlement + notify NERSA within 14 days of payment.',
   'NERSA-S34-2026-0044-SETTLE',
   'Closed — strategic PPA termination disputes resolved per Section 34(5); settlement R310m executed 2026-05-20; Section 10 report filed 2026-05-25.',
   NULL, NULL, 'COUNCIL-PANEL-2026-0044', 'COUNCIL-MIN-2026-0044',
   'NERSA-S10-REP-2026-05', NULL, NULL, 'NERSA', 'NERSA-DISP-2026-0008', 'closed',
   '2026-04-29T14:00:00Z', '2026-04-29T17:00:00Z', '2026-04-30T09:00:00Z', '2026-05-02T10:00:00Z', '2026-05-10T15:00:00Z', '2026-05-12T09:00:00Z', '2026-05-20T16:00:00Z', '2026-05-25T11:00:00Z', NULL, NULL, NULL,
   NULL, NULL, 0, 'admin@openenergy.co.za'),

  -- 9) ESCALATED — W25 fatal HSE escalated to NERSA Council senior panel
  ('disp_009', 'DISP-2026-0009', 'rinbox_h_2026_0007', 'hse.fatal_escalated',
   'hse_incident', 'hse_001', 'W25', 'Eskom Holdings — Camden Unit 3',
   'Fatal arc-flash incident — Camden Unit 3 isolation procedure failure; DEL Section 30 prohibition issued',
   'critical', 'M. Mthembu', 'Electricity Subcommittee — Markets',
   'DEL prohibition active. Investigation found root cause: lock-out / tag-out procedure defect plus delayed inspection schedule. Cross-utility implications require Council senior-panel review under Section 10(3)(b).',
   'Escalate to NERSA Council senior panel for cross-utility safety directive; coordinate DMRE + DEL joint disposition.',
   NULL, NULL, NULL, NULL,
   'COUNCIL-PANEL-2026-0007-SENIOR', 'COUNCIL-MIN-2026-0007',
   'NERSA-S10-REP-2026-05', 'OHSA_S24_FATAL', 'DEL prohibition active; cross-utility directive in preparation. Section 10 report flagged DG.',
   'NERSA', 'NERSA-DISP-2026-0009', 'escalated',
   '2026-05-12T08:00:00Z', '2026-05-12T10:30:00Z', '2026-05-12T13:00:00Z', '2026-05-13T09:00:00Z', '2026-05-15T15:00:00Z', '2026-05-18T09:00:00Z', '2026-05-22T14:00:00Z', NULL, '2026-05-25T16:00:00Z', NULL, NULL,
   NULL, NULL, 1, 'admin@openenergy.co.za'),

  -- 10) REFERRED — W26 catastrophic cyber referred to SAPS Cybercrime Unit
  ('disp_010', 'DISP-2026-0010', 'rinbox_c_2026_0019', 'cyber.escalated',
   'cyber_incident', 'cyb_008', 'W26', 'Open Energy Markets (Pty) Ltd',
   'Cyber incident — catastrophic data exfiltration suspected (180GB market book leak); criminal investigation required',
   'critical', 'P. Khumalo', 'Insurance Supervisory — FSCA liaison',
   'Forensic findings indicate organised exfiltration vector via compromised vendor SSH key. Criminal nexus exceeds Regulator jurisdiction. Refer to SAPS Cybercrime Unit per Cybercrimes Act s54(3).',
   NULL, NULL, NULL,
   'SAPS — Cybercrime Unit, Pretoria HQ',
   'SAPS-CYBER-2026-0019', NULL, NULL,
   NULL, 'CYBERCRIMES_S54_REFERRAL', 'Referred SAPS Cybercrime Unit + FSCA Market Conduct. POPIA s22 IR continues to monitor.',
   'NERSA', 'NERSA-DISP-2026-0010', 'referred',
   '2026-05-08T10:00:00Z', '2026-05-08T11:00:00Z', NULL, '2026-05-09T09:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-20T15:00:00Z',
   NULL, NULL, 0, 'admin@openenergy.co.za');

-- Audit events covering each forward transition + branch terminals
INSERT OR IGNORE INTO oe_disposition_events
  (id, disposition_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  -- disp_002 (triaged)
  ('disp_evt_002a', 'disp_002', 'triaged', 'received', 'triaged', 'system', 'Severity classification: high (POPIA s22 IR notified)', '2026-05-27T18:42:00Z'),

  -- disp_003 (assigned)
  ('disp_evt_003a', 'disp_003', 'triaged',  'received', 'triaged',  'admin@openenergy.co.za', 'Severity: critical (R78.5m clawback + SARB cross + EP secretariat)', '2026-05-26T17:08:00Z'),
  ('disp_evt_003b', 'disp_003', 'assigned', 'triaged',  'assigned', 'admin@openenergy.co.za', 'Assigned M. Mthembu — Electricity Subcommittee Markets', '2026-05-27T09:15:00Z'),

  -- disp_004 (investigating)
  ('disp_evt_004a', 'disp_004', 'triaged',       'received',      'triaged',       'admin@openenergy.co.za', 'Severity: high (R620m margin call prop tier)', '2026-05-26T13:18:00Z'),
  ('disp_evt_004b', 'disp_004', 'assigned',      'triaged',       'assigned',      'admin@openenergy.co.za', 'Assigned T. Naidoo — Trading Subcommittee', '2026-05-26T16:00:00Z'),
  ('disp_evt_004c', 'disp_004', 'investigating', 'assigned',      'investigating', 'admin@openenergy.co.za', 'Desk-level investigation opened; pre-trade gate audit underway', '2026-05-27T09:00:00Z'),

  -- disp_005 (action_required)
  ('disp_evt_005a', 'disp_005', 'triaged',         'received',        'triaged',         'admin@openenergy.co.za', 'Severity: high (Section 38 + R95m + FSCA PPR liaison)', '2026-05-24T16:20:00Z'),
  ('disp_evt_005b', 'disp_005', 'assigned',        'triaged',         'assigned',        'admin@openenergy.co.za', 'Assigned P. Khumalo — Insurance Supervisory', '2026-05-25T08:00:00Z'),
  ('disp_evt_005c', 'disp_005', 'investigating',   'assigned',        'investigating',   'admin@openenergy.co.za', 'Investigation opened; FSCA PPR 17.5(c) ambiguity flagged', '2026-05-25T11:30:00Z'),
  ('disp_evt_005d', 'disp_005', 'action_required', 'investigating',   'action_required', 'admin@openenergy.co.za', 'Insurer to file written reasons + ombud notice within 14 days', '2026-05-27T15:00:00Z'),

  -- disp_006 (action_in_progress)
  ('disp_evt_006a', 'disp_006', 'triaged',            'received',           'triaged',            'admin@openenergy.co.za', 'Severity: high (REIPPPP ED ownership breach 23%)', '2026-05-18T11:00:00Z'),
  ('disp_evt_006b', 'disp_006', 'assigned',           'triaged',            'assigned',           'admin@openenergy.co.za', 'Assigned N. Dlamini — DMRE Liaison', '2026-05-18T14:00:00Z'),
  ('disp_evt_006c', 'disp_006', 'investigating',     'assigned',           'investigating',      'admin@openenergy.co.za', 'Investigation opened; IPPO 30d cure plan filing accepted', '2026-05-19T09:00:00Z'),
  ('disp_evt_006d', 'disp_006', 'action_required',   'investigating',      'action_required',    'admin@openenergy.co.za', 'IPP NewCo placement + DTI Codes Council cert required', '2026-05-22T15:00:00Z'),
  ('disp_evt_006e', 'disp_006', 'action_in_progress','action_required',    'action_in_progress', 'admin@openenergy.co.za', 'Placement opened 2026-05-25; DTI Codes Council verification underway', '2026-05-25T09:00:00Z'),

  -- disp_007 (action_completed)
  ('disp_evt_007a', 'disp_007', 'triaged',            'received',           'triaged',            'admin@openenergy.co.za', 'Severity: high (SARB large-exposure cross + R220m senior tranche)', '2026-05-15T13:30:00Z'),
  ('disp_evt_007b', 'disp_007', 'assigned',           'triaged',            'assigned',           'admin@openenergy.co.za', 'Assigned A. van der Merwe — Markets', '2026-05-15T16:00:00Z'),
  ('disp_evt_007c', 'disp_007', 'investigating',      'assigned',           'investigating',      'admin@openenergy.co.za', 'Investigation opened; CP cure path established', '2026-05-16T10:00:00Z'),
  ('disp_evt_007d', 'disp_007', 'action_required',    'investigating',      'action_required',    'admin@openenergy.co.za', 'IPP to file cured cession at CIPC + lender re-issue tranche', '2026-05-18T09:00:00Z'),
  ('disp_evt_007e', 'disp_007', 'action_in_progress', 'action_required',    'action_in_progress', 'admin@openenergy.co.za', 'CIPC cession filing initiated 2026-05-20', '2026-05-20T09:00:00Z'),
  ('disp_evt_007f', 'disp_007', 'action_completed',   'action_in_progress', 'action_completed',   'admin@openenergy.co.za', 'CIPC cession accepted + tranche re-released 2026-05-23', '2026-05-25T14:00:00Z'),

  -- disp_008 (closed — full lifecycle)
  ('disp_evt_008a', 'disp_008', 'triaged',            'received',           'triaged',            'admin@openenergy.co.za', 'Severity: critical (R420m termination dispute + Section 34)', '2026-04-29T17:00:00Z'),
  ('disp_evt_008b', 'disp_008', 'assigned',           'triaged',            'assigned',           'admin@openenergy.co.za', 'Assigned M. Mthembu — Markets', '2026-04-30T09:00:00Z'),
  ('disp_evt_008c', 'disp_008', 'investigating',      'assigned',           'investigating',      'admin@openenergy.co.za', 'Investigation opened; Section 34 mediation route selected', '2026-05-02T10:00:00Z'),
  ('disp_evt_008d', 'disp_008', 'action_required',    'investigating',      'action_required',    'admin@openenergy.co.za', 'Mediation panel + settlement framework required', '2026-05-10T15:00:00Z'),
  ('disp_evt_008e', 'disp_008', 'action_in_progress', 'action_required',    'action_in_progress', 'admin@openenergy.co.za', 'Justice Madonsela (ret.) mediating; framework filed 2026-05-12', '2026-05-12T09:00:00Z'),
  ('disp_evt_008f', 'disp_008', 'action_completed',   'action_in_progress', 'action_completed',   'admin@openenergy.co.za', 'Settlement R310m accepted by both parties 2026-05-20', '2026-05-20T16:00:00Z'),
  ('disp_evt_008g', 'disp_008', 'closed',             'action_completed',   'closed',             'admin@openenergy.co.za', 'Section 10 report filed 2026-05-25; council minute COUNCIL-MIN-2026-0044', '2026-05-25T11:00:00Z'),

  -- disp_009 (escalated)
  ('disp_evt_009a', 'disp_009', 'triaged',            'received',           'triaged',            'admin@openenergy.co.za', 'Severity: critical (fatal arc-flash + DEL Section 30 prohibition)', '2026-05-12T10:30:00Z'),
  ('disp_evt_009b', 'disp_009', 'assigned',           'triaged',            'assigned',           'admin@openenergy.co.za', 'Assigned M. Mthembu — Markets', '2026-05-12T13:00:00Z'),
  ('disp_evt_009c', 'disp_009', 'investigating',      'assigned',           'investigating',      'admin@openenergy.co.za', 'Investigation opened; LOTO procedure defect identified', '2026-05-13T09:00:00Z'),
  ('disp_evt_009d', 'disp_009', 'action_required',    'investigating',      'action_required',    'admin@openenergy.co.za', 'Cross-utility safety directive required', '2026-05-15T15:00:00Z'),
  ('disp_evt_009e', 'disp_009', 'action_in_progress', 'action_required',    'action_in_progress', 'admin@openenergy.co.za', 'Directive drafted; DMRE+DEL joint review opened', '2026-05-18T09:00:00Z'),
  ('disp_evt_009f', 'disp_009', 'action_completed',   'action_in_progress', 'action_completed',   'admin@openenergy.co.za', 'Directive ready for senior panel ratification', '2026-05-22T14:00:00Z'),
  ('disp_evt_009g', 'disp_009', 'escalated',          'action_completed',   'escalated',          'admin@openenergy.co.za', 'Escalated NERSA Council senior panel — cross-utility safety directive', '2026-05-25T16:00:00Z'),

  -- disp_010 (referred)
  ('disp_evt_010a', 'disp_010', 'triaged', 'received',      'triaged',       'admin@openenergy.co.za', 'Severity: critical (180GB market book leak suspected)', '2026-05-08T11:00:00Z'),
  ('disp_evt_010b', 'disp_010', 'investigating', 'triaged', 'investigating', 'admin@openenergy.co.za', 'Forensic investigation opened; criminal nexus identified', '2026-05-09T09:00:00Z'),
  ('disp_evt_010c', 'disp_010', 'referred',      'investigating', 'referred','admin@openenergy.co.za', 'Referred SAPS Cybercrime Unit + FSCA Market Conduct per Cybercrimes Act s54(3)', '2026-05-20T15:00:00Z');
