-- Wave 28 seed: 10 Grid Connection Agreement cases — one per state in canonical
-- lifecycle order across 3 tiers (transmission/distribution/embedded) at Eskom
-- substations. Demonstrates 24-month transmission construction window vs 3-month
-- embedded; NERSA C-1 references on transmission tier.

INSERT OR IGNORE INTO oe_gca_connections (id, case_number, project_id, project_name, ipp_party, network_party, connection_tier, voltage_kv, poc_substation, capacity_mw, technology, gia_ref, cost_estimate_zar, cost_accepted_zar, ungca_ref, energisation_date_planned, regulator_authority, regulator_ref, chain_status, application_filed_at, sla_deadline_at, created_by) VALUES
('gca_001', 'GCA-TX-2026-0001', 'proj_jeffreys_bay_2', 'Mainstream Jeffreys Bay 2 Wind 200MW',  'Mainstream RE SA',  'Eskom_Transmission', 'transmission', 400, 'Grassridge MTS',  200, 'wind',     NULL,                 NULL,        NULL,        NULL,                  '2028-09-15T00:00:00Z', 'NERSA',    NULL,                       'application_filed',            '2026-05-15T08:00:00Z', '2026-06-14T08:00:00Z', 'ipp_developer'),
('gca_002', 'GCA-DX-2026-0002', 'proj_bw5_kouga',       'Red Cap Kouga Phase 2 Wind 110MW',      'Red Cap',           'Eskom_Distribution', 'distribution',  88, 'Kouga MTS',         110, 'wind',     'GIA-ESK-2026-0142',  NULL,        NULL,        NULL,                  '2027-12-01T00:00:00Z', 'NERSA',    NULL,                       'studies_required',             '2026-04-20T09:00:00Z', '2026-06-19T09:00:00Z', 'ipp_developer'),
('gca_003', 'GCA-TX-2026-0003', 'proj_kruisvallei_2',   'Kruisvallei Hydro Phase 2 75MW',         'BioTherm Energy',   'Eskom_Transmission', 'transmission', 132, 'Wilge MTS',         75, 'hydro',    'GIA-ESK-2026-0089',  NULL,        NULL,        NULL,                  '2028-04-01T00:00:00Z', 'NERSA',    NULL,                       'studies_executing',            '2026-03-10T10:00:00Z', '2026-09-06T10:00:00Z', 'ipp_developer'),
('gca_004', 'GCA-DX-2026-0004', 'proj_loeriesfontein_3','Loeriesfontein 3 Wind 144MW',            'Mainstream RE SA',  'Eskom_Distribution', 'distribution', 132, 'Aries MTS',        144, 'wind',     'GIA-ESK-2026-0204',  845000000,   NULL,        NULL,                  '2027-08-15T00:00:00Z', 'NERSA',    NULL,                       'cost_estimate_issued',         '2026-02-05T11:00:00Z', '2026-07-04T11:00:00Z', 'ipp_developer'),
('gca_005', 'GCA-TX-2026-0005', 'proj_xina_solar_2',    'Xina Solar 2 CSP 100MW',                 'Abengoa',           'Eskom_Transmission', 'transmission', 400, 'Pofadder MTS',     100, 'csp',      'GIA-ESK-2026-0301',  1240000000,  1240000000,  NULL,                  '2029-01-15T00:00:00Z', 'NERSA',    NULL,                       'cost_accepted',                '2025-11-20T12:00:00Z', '2026-08-18T12:00:00Z', 'ipp_developer'),
('gca_006', 'GCA-DX-2026-0006', 'proj_aggeneys',        'Aggeneys Wind 80MW',                     'Genesis Eco-Energy','Eskom_Distribution', 'distribution', 132, 'Aggeneys MTS',      80, 'wind',     'GIA-ESK-2025-0512',  412000000,   398000000,   NULL,                  '2027-05-01T00:00:00Z', 'NERSA',    NULL,                       'connection_agreement_drafted', '2025-09-15T13:00:00Z', '2026-06-18T13:00:00Z', 'ipp_developer'),
('gca_007', 'GCA-TX-2026-0007', 'proj_roggeveld_2',     'Roggeveld Phase 2 Wind 147MW',           'G7 Renewable',      'Eskom_Transmission', 'transmission', 400, 'Komsberg MTS',     147, 'wind',     'GIA-ESK-2025-0489',  1820000000,  1820000000,  'UNGCA-ESK-2026-0017', '2028-06-30T00:00:00Z', 'NERSA',    'NERSA-C1-2026-0142',       'executed',                     '2025-07-10T14:00:00Z', '2026-06-11T14:00:00Z', 'ipp_developer'),
('gca_008', 'GCA-DX-2026-0008', 'proj_aggeneys_solar',  'Aggeneys Solar 75MW',                    'Globeleq SA',       'Eskom_Distribution', 'distribution', 132, 'Aggeneys MTS',      75, 'solar_pv', 'GIA-ESK-2025-0367',  385000000,   381000000,   'UNGCA-ESK-2025-0089', '2027-03-15T00:00:00Z', 'NERSA',    NULL,                       'construction',                 '2025-03-22T15:00:00Z', '2027-03-15T15:00:00Z', 'ipp_developer'),
('gca_009', 'GCA-TX-2026-0009', 'proj_garob',           'Garob Wind 140MW',                       'Mainstream RE SA',  'Eskom_Transmission', 'transmission', 400, 'Helios MTS',       140, 'wind',     'GIA-ESK-2024-0241',  1690000000,  1690000000,  'UNGCA-ESK-2024-0061', '2026-08-01T00:00:00Z', 'NERSA',    'NERSA-C1-2026-0089',       'energised',                    '2024-08-15T16:00:00Z', '2026-06-26T16:00:00Z', 'ipp_developer'),
('gca_010', 'GCA-EM-2026-0010','proj_ssel_kuruman',     'Kuruman SSEG Solar 2.5MW',               'Soulful Energy',    'Eskom_Distribution', 'embedded',      22, 'Kuruman SS',       2.5, 'solar_pv', NULL,                 6800000,     6800000,     'UNGCA-ESK-2025-1142', '2025-11-15T00:00:00Z', 'NERSA',    NULL,                       'in_service',                   '2025-04-10T08:00:00Z', NULL,                   'ipp_developer');

-- Update terminal-state timestamps + lifecycle timestamps
UPDATE oe_gca_connections SET studies_required_at='2026-04-25T09:00:00Z' WHERE id='gca_002';
UPDATE oe_gca_connections SET studies_required_at='2026-03-15T10:00:00Z', studies_executing_at='2026-05-01T10:00:00Z' WHERE id='gca_003';
UPDATE oe_gca_connections SET studies_required_at='2026-02-10T11:00:00Z', studies_executing_at='2026-03-01T11:00:00Z', cost_estimate_issued_at='2026-05-15T11:00:00Z' WHERE id='gca_004';
UPDATE oe_gca_connections SET studies_required_at='2025-11-25T12:00:00Z', studies_executing_at='2025-12-15T12:00:00Z', cost_estimate_issued_at='2026-03-20T12:00:00Z', cost_accepted_at='2026-05-20T12:00:00Z' WHERE id='gca_005';
UPDATE oe_gca_connections SET studies_required_at='2025-09-20T13:00:00Z', studies_executing_at='2025-10-15T13:00:00Z', cost_estimate_issued_at='2026-01-10T13:00:00Z', cost_accepted_at='2026-03-15T13:00:00Z', connection_agreement_drafted_at='2026-05-18T13:00:00Z' WHERE id='gca_006';
UPDATE oe_gca_connections SET studies_required_at='2025-07-15T14:00:00Z', studies_executing_at='2025-08-15T14:00:00Z', cost_estimate_issued_at='2025-12-01T14:00:00Z', cost_accepted_at='2026-02-10T14:00:00Z', connection_agreement_drafted_at='2026-04-20T14:00:00Z', executed_at='2026-05-28T14:00:00Z' WHERE id='gca_007';
UPDATE oe_gca_connections SET studies_required_at='2025-04-01T15:00:00Z', studies_executing_at='2025-04-25T15:00:00Z', cost_estimate_issued_at='2025-09-10T15:00:00Z', cost_accepted_at='2025-11-15T15:00:00Z', connection_agreement_drafted_at='2026-01-15T15:00:00Z', executed_at='2026-02-15T15:00:00Z', construction_at='2026-03-15T15:00:00Z' WHERE id='gca_008';
UPDATE oe_gca_connections SET studies_required_at='2024-08-25T16:00:00Z', studies_executing_at='2024-09-15T16:00:00Z', cost_estimate_issued_at='2025-02-10T16:00:00Z', cost_accepted_at='2025-04-15T16:00:00Z', connection_agreement_drafted_at='2025-07-01T16:00:00Z', executed_at='2025-08-01T16:00:00Z', construction_at='2025-09-01T16:00:00Z', energised_at='2026-05-26T16:00:00Z' WHERE id='gca_009';
UPDATE oe_gca_connections SET studies_required_at='2025-04-15T08:00:00Z', studies_executing_at='2025-05-01T08:00:00Z', cost_estimate_issued_at='2025-06-15T08:00:00Z', cost_accepted_at='2025-07-15T08:00:00Z', connection_agreement_drafted_at='2025-08-10T08:00:00Z', executed_at='2025-08-25T08:00:00Z', construction_at='2025-09-01T08:00:00Z', energised_at='2025-11-10T08:00:00Z', in_service_at='2025-11-20T08:00:00Z' WHERE id='gca_010';

-- Events (timeline audit, one per transition)
INSERT OR IGNORE INTO oe_gca_events (id, gca_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
('gca_evt_001a', 'gca_001', 'application_filed', NULL, 'application_filed', 'ipp_developer', '400kV interconnection application at Grassridge MTS for 200MW BW6 wind', '2026-05-15T08:00:00Z'),

('gca_evt_002a', 'gca_002', 'application_filed', NULL,                'application_filed', 'ipp_developer', NULL, '2026-04-20T09:00:00Z'),
('gca_evt_002b', 'gca_002', 'studies_required',  'application_filed', 'studies_required',  'grid_operator', 'Load-flow + fault-level studies requested', '2026-04-25T09:00:00Z'),

('gca_evt_003a', 'gca_003', 'application_filed', NULL,                'application_filed', 'ipp_developer', NULL, '2026-03-10T10:00:00Z'),
('gca_evt_003b', 'gca_003', 'studies_required',  'application_filed', 'studies_required',  'grid_operator', NULL, '2026-03-15T10:00:00Z'),
('gca_evt_003c', 'gca_003', 'studies_executing', 'studies_required',  'studies_executing', 'grid_operator', 'GIA-ESK-2026-0089 in flight — 132kV connection at Wilge MTS', '2026-05-01T10:00:00Z'),

('gca_evt_004a', 'gca_004', 'application_filed',     NULL,                  'application_filed',     'ipp_developer', NULL, '2026-02-05T11:00:00Z'),
('gca_evt_004b', 'gca_004', 'studies_required',      'application_filed',   'studies_required',      'grid_operator', NULL, '2026-02-10T11:00:00Z'),
('gca_evt_004c', 'gca_004', 'studies_executing',     'studies_required',    'studies_executing',     'grid_operator', NULL, '2026-03-01T11:00:00Z'),
('gca_evt_004d', 'gca_004', 'cost_estimate_issued',  'studies_executing',   'cost_estimate_issued',  'grid_operator', 'CCE R845m issued for Aries MTS connection works + 132kV cut-in', '2026-05-15T11:00:00Z'),

('gca_evt_005a', 'gca_005', 'application_filed',     NULL,                  'application_filed',     'ipp_developer', NULL, '2025-11-20T12:00:00Z'),
('gca_evt_005b', 'gca_005', 'studies_required',      'application_filed',   'studies_required',      'grid_operator', NULL, '2025-11-25T12:00:00Z'),
('gca_evt_005c', 'gca_005', 'studies_executing',     'studies_required',    'studies_executing',     'grid_operator', NULL, '2025-12-15T12:00:00Z'),
('gca_evt_005d', 'gca_005', 'cost_estimate_issued',  'studies_executing',   'cost_estimate_issued',  'grid_operator', 'CCE R1.24bn for 400kV Pofadder bus + CSP-grade reactive compensation', '2026-03-20T12:00:00Z'),
('gca_evt_005e', 'gca_005', 'cost_accepted',         'cost_estimate_issued','cost_accepted',         'ipp_developer', 'R1.24bn accepted; performance bond R124m posted', '2026-05-20T12:00:00Z'),

('gca_evt_006a', 'gca_006', 'application_filed',             NULL,                          'application_filed',             'ipp_developer', NULL, '2025-09-15T13:00:00Z'),
('gca_evt_006b', 'gca_006', 'studies_required',              'application_filed',           'studies_required',              'grid_operator', NULL, '2025-09-20T13:00:00Z'),
('gca_evt_006c', 'gca_006', 'studies_executing',             'studies_required',            'studies_executing',             'grid_operator', NULL, '2025-10-15T13:00:00Z'),
('gca_evt_006d', 'gca_006', 'cost_estimate_issued',          'studies_executing',           'cost_estimate_issued',          'grid_operator', NULL, '2026-01-10T13:00:00Z'),
('gca_evt_006e', 'gca_006', 'cost_accepted',                 'cost_estimate_issued',        'cost_accepted',                 'ipp_developer', NULL, '2026-03-15T13:00:00Z'),
('gca_evt_006f', 'gca_006', 'connection_agreement_drafted',  'cost_accepted',               'connection_agreement_drafted',  'grid_operator', 'UNGCA draft circulated for IPP legal review', '2026-05-18T13:00:00Z'),

('gca_evt_007a', 'gca_007', 'application_filed',             NULL,                          'application_filed',             'ipp_developer', NULL, '2025-07-10T14:00:00Z'),
('gca_evt_007b', 'gca_007', 'studies_required',              'application_filed',           'studies_required',              'grid_operator', NULL, '2025-07-15T14:00:00Z'),
('gca_evt_007c', 'gca_007', 'studies_executing',             'studies_required',            'studies_executing',             'grid_operator', NULL, '2025-08-15T14:00:00Z'),
('gca_evt_007d', 'gca_007', 'cost_estimate_issued',          'studies_executing',           'cost_estimate_issued',          'grid_operator', NULL, '2025-12-01T14:00:00Z'),
('gca_evt_007e', 'gca_007', 'cost_accepted',                 'cost_estimate_issued',        'cost_accepted',                 'ipp_developer', 'R1.82bn accepted; R182m bond posted', '2026-02-10T14:00:00Z'),
('gca_evt_007f', 'gca_007', 'connection_agreement_drafted',  'cost_accepted',               'connection_agreement_drafted',  'grid_operator', NULL, '2026-04-20T14:00:00Z'),
('gca_evt_007g', 'gca_007', 'executed',                      'connection_agreement_drafted','executed',                      'ipp_developer', 'UNGCA-ESK-2026-0017 signed; NERSA-C1-2026-0142 acknowledged', '2026-05-28T14:00:00Z'),

('gca_evt_008a', 'gca_008', 'application_filed',             NULL,                          'application_filed',             'ipp_developer', NULL, '2025-03-22T15:00:00Z'),
('gca_evt_008b', 'gca_008', 'studies_required',              'application_filed',           'studies_required',              'grid_operator', NULL, '2025-04-01T15:00:00Z'),
('gca_evt_008c', 'gca_008', 'studies_executing',             'studies_required',            'studies_executing',             'grid_operator', NULL, '2025-04-25T15:00:00Z'),
('gca_evt_008d', 'gca_008', 'cost_estimate_issued',          'studies_executing',           'cost_estimate_issued',          'grid_operator', NULL, '2025-09-10T15:00:00Z'),
('gca_evt_008e', 'gca_008', 'cost_accepted',                 'cost_estimate_issued',        'cost_accepted',                 'ipp_developer', NULL, '2025-11-15T15:00:00Z'),
('gca_evt_008f', 'gca_008', 'connection_agreement_drafted',  'cost_accepted',               'connection_agreement_drafted',  'grid_operator', NULL, '2026-01-15T15:00:00Z'),
('gca_evt_008g', 'gca_008', 'executed',                      'connection_agreement_drafted','executed',                      'ipp_developer', NULL, '2026-02-15T15:00:00Z'),
('gca_evt_008h', 'gca_008', 'construction',                  'executed',                    'construction',                  'ipp_developer', 'Aggeneys cut-in construction mobilised; 12-month build', '2026-03-15T15:00:00Z'),

('gca_evt_009a', 'gca_009', 'application_filed',             NULL,                          'application_filed',             'ipp_developer', NULL, '2024-08-15T16:00:00Z'),
('gca_evt_009b', 'gca_009', 'studies_required',              'application_filed',           'studies_required',              'grid_operator', NULL, '2024-08-25T16:00:00Z'),
('gca_evt_009c', 'gca_009', 'studies_executing',             'studies_required',            'studies_executing',             'grid_operator', NULL, '2024-09-15T16:00:00Z'),
('gca_evt_009d', 'gca_009', 'cost_estimate_issued',          'studies_executing',           'cost_estimate_issued',          'grid_operator', NULL, '2025-02-10T16:00:00Z'),
('gca_evt_009e', 'gca_009', 'cost_accepted',                 'cost_estimate_issued',        'cost_accepted',                 'ipp_developer', NULL, '2025-04-15T16:00:00Z'),
('gca_evt_009f', 'gca_009', 'connection_agreement_drafted',  'cost_accepted',               'connection_agreement_drafted',  'grid_operator', NULL, '2025-07-01T16:00:00Z'),
('gca_evt_009g', 'gca_009', 'executed',                      'connection_agreement_drafted','executed',                      'ipp_developer', 'UNGCA-ESK-2024-0061 signed', '2025-08-01T16:00:00Z'),
('gca_evt_009h', 'gca_009', 'construction',                  'executed',                    'construction',                  'ipp_developer', NULL, '2025-09-01T16:00:00Z'),
('gca_evt_009i', 'gca_009', 'energised',                     'construction',                'energised',                     'grid_operator', 'Synchronised to Helios 400kV bus; ramp-up testing', '2026-05-26T16:00:00Z'),

('gca_evt_010a', 'gca_010', 'application_filed',             NULL,                          'application_filed',             'ipp_developer', NULL, '2025-04-10T08:00:00Z'),
('gca_evt_010b', 'gca_010', 'studies_required',              'application_filed',           'studies_required',              'grid_operator', NULL, '2025-04-15T08:00:00Z'),
('gca_evt_010c', 'gca_010', 'studies_executing',             'studies_required',            'studies_executing',             'grid_operator', NULL, '2025-05-01T08:00:00Z'),
('gca_evt_010d', 'gca_010', 'cost_estimate_issued',          'studies_executing',           'cost_estimate_issued',          'grid_operator', NULL, '2025-06-15T08:00:00Z'),
('gca_evt_010e', 'gca_010', 'cost_accepted',                 'cost_estimate_issued',        'cost_accepted',                 'ipp_developer', NULL, '2025-07-15T08:00:00Z'),
('gca_evt_010f', 'gca_010', 'connection_agreement_drafted',  'cost_accepted',               'connection_agreement_drafted',  'grid_operator', NULL, '2025-08-10T08:00:00Z'),
('gca_evt_010g', 'gca_010', 'executed',                      'connection_agreement_drafted','executed',                      'ipp_developer', NULL, '2025-08-25T08:00:00Z'),
('gca_evt_010h', 'gca_010', 'construction',                  'executed',                    'construction',                  'ipp_developer', NULL, '2025-09-01T08:00:00Z'),
('gca_evt_010i', 'gca_010', 'energised',                     'construction',                'energised',                     'grid_operator', NULL, '2025-11-10T08:00:00Z'),
('gca_evt_010j', 'gca_010', 'in_service',                    'energised',                   'in_service',                    'grid_operator', 'Kuruman SSEG commercial operation; 22kV embedded generation', '2025-11-20T08:00:00Z');
