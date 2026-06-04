-- W144: IPP Site/Engineer's Instruction Register
-- JBCC 6.2 cl.18 (Architect's/Engineer's Instructions) + NEC4 PMI + OHSA Const.Regs s.8

CREATE TABLE IF NOT EXISTS oe_ipp_site_instructions (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,
  project_name          TEXT,
  participant_id        TEXT NOT NULL,
  instruction_type      TEXT NOT NULL CHECK (instruction_type IN (
                          'safety_directive','variation_instruction','defect_rectification',
                          'design_clarification','testing_instruction','administrative')),
  si_ref                TEXT,                -- e.g. SI-2026-001
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                          'draft','issued','acknowledged','in_execution','completed',
                          'ie_verified','closed','disputed','dispute_resolved','superseded','voided')),
  issued_date           TEXT NOT NULL,       -- ISO date YYYY-MM-DD
  description           TEXT NOT NULL,
  scope_narrative       TEXT,
  work_location         TEXT,
  ie_signatory          TEXT,               -- IE/PA who issued the instruction
  contractor_signatory  TEXT,               -- contractor who acknowledged
  -- Floor flags (caller-supplied)
  is_safety_directive   INTEGER NOT NULL DEFAULT 0,   -- OHSA s.8 stop-work power
  is_contract_variation INTEGER NOT NULL DEFAULT 0,   -- triggers valuation/dispute route
  value_zar             REAL,                          -- estimated cost of variation
  requires_ie_witness   INTEGER NOT NULL DEFAULT 0,   -- testing or hold-point
  -- Cross-chain refs
  ncr_ref               TEXT,    -- NCR that triggered defect rectification
  dfr_ref               TEXT,    -- Daily Field Report reference
  diary_ref             TEXT,    -- Site Diary reference (W143)
  superseded_by         TEXT,    -- ref to superseding SI
  -- SLA
  sla_hours             INTEGER NOT NULL,
  sla_deadline          TEXT NOT NULL,
  is_sla_breached       INTEGER NOT NULL DEFAULT 0,
  -- Reporting
  is_reportable         INTEGER NOT NULL DEFAULT 0,
  regulator_ref         TEXT,
  -- Timestamps per status
  draft_at              TEXT,
  issued_at             TEXT,
  acknowledged_at       TEXT,
  in_execution_at       TEXT,
  completed_at          TEXT,
  ie_verified_at        TEXT,
  closed_at             TEXT,
  disputed_at           TEXT,
  dispute_resolved_at   TEXT,
  superseded_at         TEXT,
  voided_at             TEXT,
  -- Metadata
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ipp_si_project    ON oe_ipp_site_instructions(project_id);
CREATE INDEX IF NOT EXISTS idx_ipp_si_status     ON oe_ipp_site_instructions(status);
CREATE INDEX IF NOT EXISTS idx_ipp_si_participant ON oe_ipp_site_instructions(participant_id);
CREATE INDEX IF NOT EXISTS idx_ipp_si_type       ON oe_ipp_site_instructions(instruction_type);
CREATE INDEX IF NOT EXISTS idx_ipp_si_sla        ON oe_ipp_site_instructions(sla_deadline, is_sla_breached);

-- Seed: 12 instructions across 3 GoldRush-scale projects covering all statuses
INSERT INTO oe_ipp_site_instructions VALUES
  -- proj-kakamas-500mw (4 rows)
  ('si-001','proj-kakamas-500mw','Kakamas 500MW Solar','id_7c352b86da89907a85266a250e15db95',
   'safety_directive','SI-2026-001','issued','2026-05-01',
   'Immediate cessation of trenching works in Grid Zone C pending ground stability assessment',
   'All cable trenching in Grid Zone C to halt. IE inspection required before resuming.',
   'Grid Zone C — south trench alignment',
   'Prof. A. Naidoo (IE)','M. van Wyk (Contractor PM)',
   1,0,NULL,1,
   NULL,NULL,NULL,NULL,
   4,'2026-05-01T04:00:00.000Z',1,
   1,'W144-SI-ISSUE-20260501',
   NULL,'2026-05-01T06:00:00.000Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   '2026-05-01T06:00:00.000Z','2026-05-01T06:30:00.000Z'),

  ('si-002','proj-kakamas-500mw','Kakamas 500MW Solar','id_7c352b86da89907a85266a250e15db95',
   'variation_instruction','SI-2026-002','closed','2026-04-10',
   'Additional earthing pits — increase from 45 to 52 units per revised SANS 10142',
   'SANS 10142-2:2022 amendment requires additional earthing density for string inverters >150kW.',
   'Inverter plant area — all strings',
   'Prof. A. Naidoo (IE)','M. van Wyk (Contractor PM)',
   0,1,285000.00,0,
   NULL,NULL,NULL,NULL,
   24,'2026-04-11T00:00:00.000Z',0,
   0,NULL,
   '2026-04-10T08:00:00.000Z','2026-04-10T10:30:00.000Z','2026-04-10T14:00:00.000Z',
   '2026-04-11T07:00:00.000Z','2026-04-25T16:00:00.000Z','2026-04-28T11:00:00.000Z',
   '2026-04-29T09:00:00.000Z',NULL,NULL,NULL,NULL,
   '2026-04-10T08:00:00.000Z','2026-04-29T09:00:00.000Z'),

  ('si-003','proj-kakamas-500mw','Kakamas 500MW Solar','id_7c352b86da89907a85266a250e15db95',
   'defect_rectification','SI-2026-003','in_execution','2026-05-20',
   'Rectify non-compliant mounting structure welds identified in NCR-2026-018',
   'Visual inspection revealed 7 substandard butt welds on Row G tracker frames. Full re-weld required.',
   'Row G — tracker mounting frames 1–7',
   'Prof. A. Naidoo (IE)','M. van Wyk (Contractor PM)',
   0,0,NULL,1,
   'ncr-018',NULL,NULL,NULL,
   48,'2026-05-22T00:00:00.000Z',0,
   0,NULL,
   '2026-05-20T09:00:00.000Z','2026-05-20T11:30:00.000Z','2026-05-21T08:00:00.000Z',
   '2026-05-21T10:00:00.000Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   '2026-05-20T09:00:00.000Z','2026-05-21T10:00:00.000Z'),

  ('si-004','proj-kakamas-500mw','Kakamas 500MW Solar','id_7c352b86da89907a85266a250e15db95',
   'design_clarification','SI-2026-004','disputed','2026-05-15',
   'Clarification on cable derating factor in RTS drawing E-003 Rev 3',
   'Contractor disputes 0.65 derating factor citing ambient temp data. IE to confirm or revise.',
   'HV cable runs — Blocks D and E',
   'Prof. A. Naidoo (IE)','M. van Wyk (Contractor PM)',
   0,0,NULL,0,
   NULL,'dfr-2026-115',NULL,NULL,
   48,'2026-05-17T00:00:00.000Z',1,
   0,'W144-SI-SLA-20260517',
   '2026-05-15T10:00:00.000Z','2026-05-15T14:00:00.000Z','2026-05-16T07:30:00.000Z',
   NULL,NULL,NULL,NULL,'2026-05-17T09:00:00.000Z',NULL,NULL,NULL,
   '2026-05-15T10:00:00.000Z','2026-05-17T09:00:00.000Z'),

  -- proj-saldanha-wind (4 rows)
  ('si-005','proj-saldanha-wind','Saldanha Wind 200MW','id_7c352b86da89907a85266a250e15db95',
   'testing_instruction','SI-2026-005','ie_verified','2026-03-05',
   'Witness pre-commissioning insulation resistance tests — WTG 7 to WTG 12',
   'IE presence required for megger tests on collector cable risers before energisation.',
   'Offshore feeder cables WTG 7–12',
   'Dr. L. Botha (IE)','T. Olivier (Site Electrical)',
   0,0,NULL,1,
   NULL,NULL,NULL,NULL,
   72,'2026-03-08T00:00:00.000Z',0,
   0,NULL,
   '2026-03-05T08:00:00.000Z','2026-03-05T09:15:00.000Z','2026-03-06T07:00:00.000Z',
   '2026-03-06T09:00:00.000Z','2026-03-08T15:30:00.000Z','2026-03-09T11:00:00.000Z',
   NULL,NULL,NULL,NULL,NULL,
   '2026-03-05T08:00:00.000Z','2026-03-09T11:00:00.000Z'),

  ('si-006','proj-saldanha-wind','Saldanha Wind 200MW','id_7c352b86da89907a85266a250e15db95',
   'variation_instruction','SI-2026-006','acknowledged','2026-05-28',
   'Supply and install additional bird-strike deterrents on WTG 1–6 as per DEA condition 14(b)',
   'DFFE post-audit requires UV-reflective blade markings + acoustic deterrents per WO-2024-ENV-07.',
   'All turbines — blade root and nacelle area',
   'Dr. L. Botha (IE)','T. Olivier (Site Electrical)',
   0,1,540000.00,0,
   NULL,NULL,NULL,NULL,
   24,'2026-05-29T00:00:00.000Z',0,
   0,NULL,
   '2026-05-28T07:00:00.000Z','2026-05-28T09:00:00.000Z','2026-05-28T16:45:00.000Z',
   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   '2026-05-28T07:00:00.000Z','2026-05-28T16:45:00.000Z'),

  ('si-007','proj-saldanha-wind','Saldanha Wind 200MW','id_7c352b86da89907a85266a250e15db95',
   'administrative','SI-2026-007','closed','2026-02-14',
   'Relocate site office to Block B compound to allow crane access route through current site office area',
   'Craneage schedule revised; current site office obstructs 400t crane swing radius. Move within 5 days.',
   'Site compound — main entrance area',
   'Dr. L. Botha (IE)','T. Olivier (Site Electrical)',
   0,0,NULL,0,
   NULL,NULL,NULL,NULL,
   168,'2026-02-21T00:00:00.000Z',0,
   0,NULL,
   '2026-02-14T08:00:00.000Z','2026-02-14T10:00:00.000Z','2026-02-15T07:00:00.000Z',
   '2026-02-15T08:30:00.000Z','2026-02-18T17:00:00.000Z','2026-02-19T09:00:00.000Z',
   '2026-02-19T14:00:00.000Z',NULL,NULL,NULL,NULL,
   '2026-02-14T08:00:00.000Z','2026-02-19T14:00:00.000Z'),

  ('si-008','proj-saldanha-wind','Saldanha Wind 200MW','id_7c352b86da89907a85266a250e15db95',
   'safety_directive','SI-2026-008','superseded','2026-04-02',
   'Halt crane lifts pending updated wind speed limit protocol (superseded by SI-2026-011)',
   'Wind readings exceeded 12 m/s. Initial protocol referenced outdated BS 7121-2012. Superseded.',
   'All crane operations on site',
   'Dr. L. Botha (IE)','T. Olivier (Site Electrical)',
   1,0,NULL,0,
   NULL,NULL,NULL,'si-011',
   4,'2026-04-02T04:00:00.000Z',0,
   1,NULL,
   '2026-04-02T06:00:00.000Z','2026-04-02T06:30:00.000Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   '2026-04-02T09:00:00.000Z',NULL,
   '2026-04-02T06:00:00.000Z','2026-04-02T09:00:00.000Z'),

  -- proj-lesotho-hydro (4 rows)
  ('si-009','proj-lesotho-hydro','Lesotho Highlands Hydro','id_7c352b86da89907a85266a250e15db95',
   'design_clarification','SI-2026-009','closed','2026-01-20',
   'Confirm turbine runner clearance tolerance for 95th percentile sediment load conditions',
   'Hydrology report update shows higher-than-design sediment peak. Turbine OEM to revise runner gap.',
   'Turbine hall — Unit 1 and Unit 2',
   'Ing. J. Moletsane (IE)','K. Thabo (Mechanical)',
   0,0,NULL,1,
   NULL,NULL,NULL,NULL,
   48,'2026-01-22T00:00:00.000Z',0,
   0,NULL,
   '2026-01-20T09:00:00.000Z','2026-01-20T11:00:00.000Z','2026-01-21T07:30:00.000Z',
   '2026-01-21T09:00:00.000Z','2026-01-28T16:00:00.000Z','2026-01-29T10:00:00.000Z',
   '2026-01-30T09:30:00.000Z',NULL,NULL,NULL,NULL,
   '2026-01-20T09:00:00.000Z','2026-01-30T09:30:00.000Z'),

  ('si-010','proj-lesotho-hydro','Lesotho Highlands Hydro','id_7c352b86da89907a85266a250e15db95',
   'defect_rectification','SI-2026-010','completed','2026-04-08',
   'Replace non-spec grout at penstock anchor block 3 — failed density test per IS:456',
   'Core samples show grout density 14% below spec. Full replacement of anchor block 3 grout required.',
   'Penstock — anchor block 3, Ch.850+00',
   'Ing. J. Moletsane (IE)','K. Thabo (Mechanical)',
   0,0,NULL,1,
   'ncr-031',NULL,NULL,NULL,
   48,'2026-04-10T00:00:00.000Z',0,
   0,NULL,
   '2026-04-08T08:00:00.000Z','2026-04-08T10:00:00.000Z','2026-04-09T07:00:00.000Z',
   '2026-04-09T09:00:00.000Z','2026-04-22T17:00:00.000Z',NULL,NULL,NULL,NULL,NULL,NULL,
   '2026-04-08T08:00:00.000Z','2026-04-22T17:00:00.000Z'),

  ('si-011','proj-lesotho-hydro','Lesotho Highlands Hydro','id_7c352b86da89907a85266a250e15db95',
   'variation_instruction','SI-2026-011','dispute_resolved','2026-05-02',
   'Increase penstock wall thickness from 16mm to 20mm on sections Ch.200–Ch.400 per revised hydraulic transient analysis',
   'Contractor disputed cost. Dispute resolved at R1.4M per QS Agreed Value Protocol.',
   'Penstock — sections Ch.200 to Ch.400',
   'Ing. J. Moletsane (IE)','K. Thabo (Mechanical)',
   0,1,1400000.00,0,
   NULL,NULL,NULL,NULL,
   24,'2026-05-03T00:00:00.000Z',0,
   0,NULL,
   '2026-05-02T08:00:00.000Z','2026-05-02T10:00:00.000Z','2026-05-02T14:00:00.000Z',
   NULL,NULL,NULL,NULL,'2026-05-03T09:00:00.000Z','2026-05-10T14:00:00.000Z',NULL,NULL,
   '2026-05-02T08:00:00.000Z','2026-05-10T14:00:00.000Z'),

  ('si-012','proj-lesotho-hydro','Lesotho Highlands Hydro','id_7c352b86da89907a85266a250e15db95',
   'safety_directive','SI-2026-012','issued','2026-06-03',
   'STOP WORK — Confined space entry moratorium pending gas monitoring equipment calibration certificate renewal',
   'Current confined space gas monitors expired 2026-06-01. No entry to turbine pit, intake, or penstock until recertified.',
   'All confined spaces on site',
   'Ing. J. Moletsane (IE)','K. Thabo (Mechanical)',
   1,0,NULL,0,
   NULL,NULL,NULL,NULL,
   4,'2026-06-03T12:00:00.000Z',1,
   1,'W144-SI-ISSUE-20260603',
   NULL,'2026-06-03T08:00:00.000Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   '2026-06-03T08:00:00.000Z','2026-06-03T08:00:00.000Z');
