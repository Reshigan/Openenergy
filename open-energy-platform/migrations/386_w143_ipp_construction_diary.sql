-- Wave 143: IPP Daily Construction Diary (Site Diary)
-- JBCC 6.2 cl.8.13 + NEC4 cl.25 + CIDB BPG#A1 + OHSA Const.Regs 2014
-- URGENT SLA: critical_delay 12h | daily_operational 24h | shutdown_partial 48h | no_work 96h
-- SIGNATURE: miss_diary EVERY tier; dispute_diary on delay+critical_delay; submit_diary on safety_incident

CREATE TABLE IF NOT EXISTS oe_ipp_construction_diary (
  id                        TEXT PRIMARY KEY,
  project_id                TEXT NOT NULL,
  project_name              TEXT,
  diary_date                TEXT NOT NULL,         -- ISO date YYYY-MM-DD
  diary_ref                 TEXT,                  -- contractor reference number
  chain_status              TEXT NOT NULL DEFAULT 'open',
  day_type                  TEXT NOT NULL DEFAULT 'daily_operational',
    -- critical_delay | daily_operational | shutdown_partial | no_work

  -- Weather & conditions
  weather_am                TEXT,                  -- clear|overcast|rain|thunder|high_wind
  weather_pm                TEXT,
  temperature_max_c         REAL,
  temperature_min_c         REAL,
  work_stoppages_minutes    INTEGER DEFAULT 0,

  -- Workforce & plant
  workforce_total           INTEGER,
  workforce_breakdown       TEXT,                  -- JSON: {civil:12, steel:8, electrical:5}
  plant_equipment           TEXT,                  -- narrative: TLB x2, crane x1

  -- Materials & work
  materials_delivered       TEXT,                  -- narrative
  work_areas_active         TEXT,                  -- narrative: Grid foundations A1-A6, cable trenching B
  progress_narrative        TEXT,

  -- Contract-administrative entries
  instructions_issued       TEXT,                  -- formal instructions given on site
  visitors                  TEXT,                  -- visiting parties & purpose
  safety_observations       TEXT,

  -- Delay event (compensable time under NEC4)
  delay_description         TEXT,
  delay_duration_hours      REAL,

  -- Resolution / correction trail
  correction_notes          TEXT,
  dispute_reason            TEXT,
  resolution_notes          TEXT,
  void_reason               TEXT,

  -- Signatories
  contractor_signatory      TEXT,
  employer_signatory        TEXT,
  ie_reviewer               TEXT,

  -- Cross-chain references
  regulator_ref             TEXT,                  -- W143-DIARY-MISS-YYYY-XXXXXXX
  risk_ref                  TEXT,                  -- links to oe_ipp_risks (W133)
  ncr_ref                   TEXT,                  -- links to oe_ipp_ncrs (W136)
  ms_ref                    TEXT,                  -- links to oe_ipp_method_statements (W137)
  incident_ref              TEXT,                  -- links to oe_hse_incidents (W25)

  -- Floor flags (caller-supplied — NEVER auto-derived)
  floor_has_delay_event       INTEGER NOT NULL DEFAULT 0,
  floor_has_safety_incident   INTEGER NOT NULL DEFAULT 0,
  floor_has_instruction_issued INTEGER NOT NULL DEFAULT 0,
  floor_has_weather_stoppage  INTEGER NOT NULL DEFAULT 0,

  -- SLA
  sla_target_hours          INTEGER,               -- derived from day_type at create
  sla_deadline_at           TEXT,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  sla_breach_count          INTEGER NOT NULL DEFAULT 0,
  is_reportable             INTEGER NOT NULL DEFAULT 0,

  -- Timestamps per status
  submitted_at              TEXT,
  late_submission_at        TEXT,
  employer_noted_at         TEXT,
  ie_reviewed_at            TEXT,
  disputed_at               TEXT,
  resolution_pending_at     TEXT,
  correction_accepted_at    TEXT,
  countersigned_at          TEXT,
  archived_at               TEXT,
  missed_at                 TEXT,
  voided_at                 TEXT,

  created_by                TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_diary_project_date ON oe_ipp_construction_diary(project_id, diary_date);
CREATE INDEX IF NOT EXISTS idx_ipp_diary_status ON oe_ipp_construction_diary(chain_status);
CREATE INDEX IF NOT EXISTS idx_ipp_diary_day_type ON oe_ipp_construction_diary(day_type);

-- ─── Seed: 12 demo diary records across 3 projects ───────────────────────────
-- 4 rows per project: normal day (countersigned), delay day (disputed),
--                     late submission (open), and a missed entry.
-- Covers all critical states for evaluator demonstration.

INSERT OR IGNORE INTO oe_ipp_construction_diary (
  id, project_id, diary_date, diary_ref, chain_status, day_type,
  weather_am, weather_pm, temperature_max_c, temperature_min_c,
  work_stoppages_minutes, workforce_total, plant_equipment, materials_delivered,
  work_areas_active, progress_narrative, instructions_issued, visitors,
  contractor_signatory, employer_signatory, ie_reviewer,
  floor_has_delay_event, floor_has_safety_incident, floor_has_instruction_issued, floor_has_weather_stoppage,
  sla_target_hours, sla_deadline_at, sla_breached, sla_breach_count, is_reportable,
  submitted_at, employer_noted_at, ie_reviewed_at, countersigned_at, archived_at,
  created_by, created_at, updated_at
) VALUES
-- 1. Kakamas 500MW — normal working day, fully archived (happy path)
('diary-001', 'proj-kakamas-500mw', '2026-05-30', 'KAK-DIARY-2026-0150', 'archived', 'daily_operational',
 'clear', 'clear', 32.1, 18.4,
 0, 87, 'TLB x2, Crane 50T x1, Concrete mixer x3', 'Precast pile caps (batch 34/80), cable conduit 110mm',
 'Turbine foundations T1-T6 pile installation; cable trenching sectors A4-A6',
 'Turbine T1-T4 pile cap formwork complete. T5-T6 rebar placement ongoing. Sector A4 cable trench backfilled and compacted.',
 NULL, 'NERSA Site Inspector J. Dlamini (monitoring)',
 'A. Nortje (Construction Manager)', 'B. Mokoena (Employer RE)', 'P. Smit (IE)',
 0, 0, 0, 0,
 24, '2026-05-31T06:00:00Z', 0, 0, 0,
 '2026-05-30T17:45:00Z', '2026-05-31T08:12:00Z', '2026-05-31T10:30:00Z', '2026-06-01T09:00:00Z', '2026-06-02T14:00:00Z',
 'id_7c352b86da89907a85266a250e15db95', '2026-05-30T06:00:00Z', '2026-06-02T14:00:00Z'),

-- 2. Kakamas 500MW — critical delay day, disputed by employer
('diary-002', 'proj-kakamas-500mw', '2026-06-02', 'KAK-DIARY-2026-0153', 'disputed', 'critical_delay',
 'overcast', 'rain', 19.2, 11.8,
 240, 52, 'TLB x1 (other 2 stood down — rain), No craning', 'No concrete pours — weather stoppage',
 'Turbine T7-T9 — rain delay declared 09:00-13:00 h; cable trenching sector B1 held',
 'Declared force-majeure weather delay from 09:00. Written instruction issued to stand down crane operations. Workforce reduced to minimum — cover to plant and materials.',
 'Instruction SI-KAK-2026-042: stand down crane operations due to wind >15 m/s and active lightning',
 NULL,
 'A. Nortje (Construction Manager)', 'B. Mokoena (Employer RE)', NULL,
 1, 0, 1, 1,
 12, '2026-06-02T18:00:00Z', 1, 1, 1,
 '2026-06-02T14:30:00Z', '2026-06-02T16:00:00Z', NULL, NULL, NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-06-02T06:00:00Z', '2026-06-03T10:00:00Z'),

-- 3. Kakamas 500MW — diary submitted late (flagged by cron)
('diary-003', 'proj-kakamas-500mw', '2026-06-03', 'KAK-DIARY-2026-0154', 'late_submission', 'daily_operational',
 'clear', 'clear', 28.7, 14.2,
 0, 79, 'TLB x2, Crane 50T x1', 'Steel sections (batch 12/30), earthing cable 50mm2',
 'Turbine T7 substructure; MV switchgear room slab poured',
 'T7 pile cap concrete pour completed 14:30 (C40/20). MV room slab poured and vibrated.',
 NULL, NULL,
 'A. Nortje (Construction Manager)', NULL, NULL,
 0, 0, 0, 0,
 24, '2026-06-04T06:00:00Z', 1, 1, 0,
 '2026-06-04T08:15:00Z', NULL, NULL, NULL, NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-06-03T06:00:00Z', '2026-06-04T08:15:00Z'),

-- 4. Kakamas 500MW — missed diary (cron escalation, SIGNATURE)
('diary-004', 'proj-kakamas-500mw', '2026-05-27', 'KAK-DIARY-2026-0147', 'missed', 'daily_operational',
 NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 0, 0, 0, 0,
 24, '2026-05-28T06:00:00Z', 1, 1, 1,
 NULL, NULL, NULL, NULL, NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-05-27T06:00:00Z', '2026-05-30T06:00:00Z'),

-- 5. Saldanha Bay Wind — normal day, countersigned
('diary-005', 'proj-saldanha-wind', '2026-06-01', 'SAL-DIARY-2026-0120', 'countersigned', 'daily_operational',
 'clear', 'overcast', 22.1, 12.4,
 0, 43, 'Man lift x2, Torque wrench set', 'Hub flange bolts M56 (lot 4/6), Nacelle pre-assemb. parts',
 'Tower section install T2; nacelle assembly bay',
 'Tower T2 sections 1-3 installed. Hub assembly 60% complete in yard. Interconnect cable pulled.',
 NULL, 'Lender representative C. Joubert (equity monitoring)',
 'K. Swanepoel (Site Agent)', 'T. Dlamini (Client PM)', 'R. van der Berg (IE)',
 0, 0, 0, 0,
 24, '2026-06-02T06:00:00Z', 0, 0, 0,
 '2026-06-01T17:30:00Z', '2026-06-02T07:45:00Z', '2026-06-02T11:00:00Z', '2026-06-03T09:30:00Z', NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-06-01T06:00:00Z', '2026-06-03T09:30:00Z'),

-- 6. Saldanha Bay Wind — partial shutdown (annual equipment service)
('diary-006', 'proj-saldanha-wind', '2026-05-28', 'SAL-DIARY-2026-0116', 'archived', 'shutdown_partial',
 'clear', 'clear', 20.4, 10.1,
 480, 12, 'Man lift x1 (maintenance)', NULL,
 'Equipment service yard only — all tower/foundation work stood down',
 'Planned maintenance day: man lift service, torque tool calibration, rigging inspection. No tower works.',
 'Instruction SI-SAL-2026-018: planned equipment maintenance shutdown approved',
 NULL,
 'K. Swanepoel (Site Agent)', 'T. Dlamini (Client PM)', 'R. van der Berg (IE)',
 0, 0, 1, 0,
 48, '2026-05-30T06:00:00Z', 0, 0, 0,
 '2026-05-28T15:00:00Z', '2026-05-29T08:00:00Z', '2026-05-29T10:30:00Z', '2026-05-30T09:00:00Z', '2026-06-01T12:00:00Z',
 'id_7c352b86da89907a85266a250e15db95', '2026-05-28T06:00:00Z', '2026-06-01T12:00:00Z'),

-- 7. Saldanha Bay Wind — no work day (public holiday)
('diary-007', 'proj-saldanha-wind', '2026-05-29', 'SAL-DIARY-2026-0117', 'archived', 'no_work',
 'rain', 'rain', 14.2, 8.1,
 0, 0, NULL, NULL,
 'All works stood down — public holiday (Workers Day observed)',
 'Confirmed no-work day. Site secured. Security patrol maintained.',
 NULL, NULL,
 'K. Swanepoel (Site Agent)', 'T. Dlamini (Client PM)', NULL,
 0, 0, 0, 0,
 96, '2026-06-02T06:00:00Z', 0, 0, 0,
 '2026-05-30T08:00:00Z', '2026-05-30T09:00:00Z', NULL, '2026-06-01T09:00:00Z', '2026-06-02T12:00:00Z',
 'id_7c352b86da89907a85266a250e15db95', '2026-05-29T06:00:00Z', '2026-06-02T12:00:00Z'),

-- 8. Saldanha Bay Wind — safety incident day (OHSA notification required)
('diary-008', 'proj-saldanha-wind', '2026-06-03', 'SAL-DIARY-2026-0122', 'ie_reviewed', 'daily_operational',
 'clear', 'clear', 23.4, 13.7,
 120, 38, 'Man lift x2', 'No materials received',
 'Tower T3 cable installation; nacelle assembly',
 'T3 cable installation halted 10:30 following first-aid incident. Works resumed 12:45 after site safety review.',
 'Instruction SI-SAL-2026-021: site safety review and corrective action following first-aid incident',
 'OHSA Inspector visiting (unannounced)',
 'K. Swanepoel (Site Agent)', 'T. Dlamini (Client PM)', 'R. van der Berg (IE)',
 0, 1, 1, 0,
 24, '2026-06-04T06:00:00Z', 0, 0, 1,
 '2026-06-03T18:00:00Z', '2026-06-03T18:30:00Z', '2026-06-04T09:00:00Z', NULL, NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-06-03T06:00:00Z', '2026-06-04T09:00:00Z'),

-- 9. Lesotho Highlands Hydro — employer_noted, regular day
('diary-009', 'proj-lesotho-hydro', '2026-06-01', 'LES-DIARY-2026-0088', 'employer_noted', 'daily_operational',
 'clear', 'overcast', 18.4, 8.2,
 0, 64, 'Excavator x3, Concrete pump x1', 'Portland cement 40T, rebar 12mm 5T',
 'Penstock tunnelling sector 2; powerhouse concrete works level 3',
 'Penstock TBM advance 6.4m on shift. Powerhouse level 3 column pours C4-C6 completed.',
 NULL, 'Financier site visit — African Development Bank',
 'M. Sithole (Project Engineer)', 'L. Mokoena (Client RE)', NULL,
 0, 0, 0, 0,
 24, '2026-06-02T06:00:00Z', 0, 0, 0,
 '2026-06-01T17:00:00Z', '2026-06-02T08:30:00Z', NULL, NULL, NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-06-01T06:00:00Z', '2026-06-02T08:30:00Z'),

-- 10. Lesotho Highlands Hydro — delay day (geological obstruction)
('diary-010', 'proj-lesotho-hydro', '2026-05-30', 'LES-DIARY-2026-0086', 'resolution_pending', 'critical_delay',
 'clear', 'clear', 16.8, 6.1,
 360, 41, 'Excavator x2 (1 stood down for rock assessment)', NULL,
 'Penstock tunnelling sector 2 — unforeseen rock encounter',
 'Unforeseen hard rock intrusion at chaingage 2+450m halted TBM advance. Geotechnical assessment commenced.',
 'Instruction SI-LES-2026-034: halt TBM advance pending rock-class assessment; variation order VO-012 initiated',
 NULL,
 'M. Sithole (Project Engineer)', 'L. Mokoena (Client RE)', 'J. Botha (IE)',
 1, 0, 1, 0,
 12, '2026-05-30T18:00:00Z', 1, 1, 1,
 '2026-05-30T17:00:00Z', '2026-05-30T17:45:00Z', '2026-05-31T09:00:00Z', NULL, NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-05-30T06:00:00Z', '2026-06-02T14:00:00Z'),

-- 11. Lesotho Highlands Hydro — open diary (today, not yet submitted)
('diary-011', 'proj-lesotho-hydro', '2026-06-04', 'LES-DIARY-2026-0091', 'open', 'daily_operational',
 NULL, NULL, NULL, NULL,
 NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
 NULL, NULL, NULL,
 0, 0, 0, 0,
 24, '2026-06-05T06:00:00Z', 0, 0, 0,
 NULL, NULL, NULL, NULL, NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-06-04T06:00:00Z', '2026-06-04T06:00:00Z'),

-- 12. Lesotho Highlands Hydro — voided (confirmed no-work, admin void)
('diary-012', 'proj-lesotho-hydro', '2026-05-25', 'LES-DIARY-2026-0080', 'voided', 'no_work',
 NULL, NULL, NULL, NULL,
 NULL, 0, NULL, NULL, NULL,
 'No-work day confirmed — Heritage Day national holiday.',
 NULL, NULL,
 NULL, NULL, NULL,
 0, 0, 0, 0,
 96, '2026-05-29T06:00:00Z', 0, 0, 0,
 NULL, NULL, NULL, NULL, NULL,
 'id_7c352b86da89907a85266a250e15db95', '2026-05-25T06:00:00Z', '2026-05-26T09:00:00Z');
