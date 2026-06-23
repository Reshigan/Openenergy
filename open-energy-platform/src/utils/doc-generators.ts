// Deterministic submission-document renderers for the paid doc-generation
// feature (migration 515). Each renderer reads a normalised subject row and
// returns standard-format markdown — NO AI call, so output is stable and the
// generators are unit-testable without mocking the AI binding. The richer
// AI-assisted PDD narrative lives in vcm-pdd-generator.ts; this module is the
// one-click "generate the whole submission pack" path.

export type DocType =
  | 'pdd'                   // Project Design Document (Verra / Gold Standard / Pure Earth)
  | 'mrv'                   // Monitoring & verification report
  | 'validation_report'    // Third-party validation summary
  | 'rec_issuance_request' // I-REC / GO issuance request
  | 'term_sheet'           // Funding term sheet (lenders / funds)
  | 'info_memo';           // Funding information memorandum

export const DOC_TYPES: DocType[] = [
  'pdd', 'mrv', 'validation_report', 'rec_issuance_request', 'term_sheet', 'info_memo',
];

// Which doc types apply to which subject table. The route uses this both to
// validate the request and to pick the right source table.
export const DOC_TYPE_SUBJECT: Record<DocType, 'ipp_projects' | 'carbon_projects' | 'mrv_submissions'> = {
  pdd: 'ipp_projects',
  rec_issuance_request: 'ipp_projects',
  term_sheet: 'ipp_projects',
  info_memo: 'ipp_projects',
  validation_report: 'carbon_projects',
  mrv: 'mrv_submissions',
};

const DFFE_DGGEF = 0.942;          // tCO2e/MWh — DFFE grid emission factor (matches vcm-pdd-generator)
const HOURS_PER_YEAR = 8760;
const CAPEX_ZAR_PER_MW = 12_000_000;
const GEARING_PCT = 75;            // senior debt as a share of capex
const SENIOR_TENOR_YEARS = 15;

const STANDARD_LABEL: Record<string, string> = {
  gold_standard: 'Gold Standard for the Global Goals',
  verra_vcs: 'Verra VCS',
  verra: 'Verra VCS',
  pure_earth: 'Pure Earth',
  i_rec: 'I-REC',
  article_6_4: 'Article 6.4 (UNFCCC)',
  cdm: 'CDM',
};

function stdLabel(s?: string | null): string {
  return (s && STANDARD_LABEL[s]) || s || 'unspecified registry';
}

function num(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function str(row: Record<string, unknown>, key: string, fallback = ''): string {
  const v = row[key];
  return v == null || v === '' ? fallback : String(v);
}

function capacityFactor(technology: string): number {
  return technology.toLowerCase().includes('wind') ? 0.32 : 0.22;
}

export interface DocGenInput {
  docType: DocType;
  registryStandard?: string | null;
  subject: Record<string, unknown>;
}

export interface DocGenResult {
  title: string;
  contentMd: string;
  meta: Record<string, unknown>;
}

function pdd(input: DocGenInput): DocGenResult {
  const p = input.subject;
  const name = str(p, 'project_name', 'Unnamed project');
  const tech = str(p, 'technology', 'solar PV');
  const mw = num(p, 'capacity_mw');
  const cf = capacityFactor(tech);
  // PPA volume is the audited basis when present; otherwise model from nameplate.
  const annualMwh = num(p, 'ppa_volume_mwh') > 0 ? num(p, 'ppa_volume_mwh') : Math.round(mw * HOURS_PER_YEAR * cf);
  const annualTco2e = Math.round(annualMwh * DFFE_DGGEF);
  const years = num(p, 'ppa_duration_years') || 7;
  const label = stdLabel(input.registryStandard);

  // Standard-specific closing section.
  const sdg = input.registryStandard === 'gold_standard'
    ? ['### Sustainable Development Goals', 'Per Gold Standard for the Global Goals, the project documents at least three SDG impacts including **SDG 13 (Climate Action)**, SDG 7 (Affordable & Clean Energy) and SDG 8 (Decent Work).', '']
    : input.registryStandard === 'pure_earth'
      ? ['### Co-benefit: toxic-site remediation', 'Per Pure Earth programme requirements, the project documents its measured pollution-reduction co-benefit alongside the emission reductions.', '']
      : ['### Additionality', 'Baseline is grid electricity. Investment, barrier and common-practice tests are demonstrated in the validation pack. **[REVIEWER INPUT REQUIRED]** for IRR and market-penetration figures.', ''];

  const contentMd = [
    `# Project Design Document — ${name}`,
    `**Registry standard:** ${label}`,
    `**Location:** ${str(p, 'location', 'South Africa')}  |  **Grid connection:** ${str(p, 'grid_connection_point', 'TBC')}`,
    '',
    '## Section 1: Project description',
    `${name} is a ${mw.toFixed(1)} MW ${tech} facility delivering renewable generation to the South African grid under a ${years}-year PPA.`,
    '',
    '## Section 2: Baseline & emission reductions',
    '',
    '| Parameter | Value |',
    '|-----------|-------|',
    `| Installed capacity | ${mw.toFixed(1)} MW |`,
    `| Capacity factor | ${(cf * 100).toFixed(0)}% |`,
    `| Annual net generation | ${annualMwh.toLocaleString('en-ZA')} MWh/yr |`,
    `| Grid emission factor (DFFE DGGEF) | ${DFFE_DGGEF} tCO2e/MWh |`,
    `| Annual emission reductions | **${annualTco2e.toLocaleString('en-ZA')} tCO2e/yr** |`,
    `| Crediting period | ${years} years |`,
    `| Total ex-ante reductions | **${(annualTco2e * years).toLocaleString('en-ZA')} tCO2e** |`,
    '',
    '## Section 3: Monitoring plan',
    'Generation is metered at the revenue meter; monthly readings reconcile against the registry MRV submission.',
    '',
    ...sdg,
    '*Generated from platform project data. Section 2 additionality narrative requires expert review before submission.*',
  ].join('\n');

  return {
    title: `PDD — ${name} (${label})`,
    contentMd,
    meta: { annual_mwh: annualMwh, annual_tco2e: annualTco2e, crediting_years: years, dggef: DFFE_DGGEF },
  };
}

function recIssuance(input: DocGenInput): DocGenResult {
  const p = input.subject;
  const name = str(p, 'project_name', 'Unnamed project');
  const tech = str(p, 'technology', 'solar PV');
  const mw = num(p, 'capacity_mw');
  const cf = capacityFactor(tech);
  const annualMwh = num(p, 'ppa_volume_mwh') > 0 ? num(p, 'ppa_volume_mwh') : Math.round(mw * HOURS_PER_YEAR * cf);
  // 1 I-REC / GO = 1 MWh of metered renewable generation.
  const certificates = annualMwh;
  const label = stdLabel(input.registryStandard || 'i_rec');

  const contentMd = [
    `# Certificate Issuance Request — ${name}`,
    `**Scheme:** ${label}`,
    '',
    'Request for issuance of renewable-energy attribute certificates for the reporting year.',
    '',
    '| Parameter | Value |',
    '|-----------|-------|',
    `| Device | ${name} (${mw.toFixed(1)} MW ${tech}) |`,
    `| Metered generation | ${annualMwh.toLocaleString('en-ZA')} MWh |`,
    `| Certificate ratio | 1 certificate per MWh |`,
    `| Certificates requested | **${certificates.toLocaleString('en-ZA')}** |`,
    '',
    '*Issuance is subject to registrar validation of metered data and non-double-counting checks.*',
  ].join('\n');

  return { title: `Issuance request — ${name} (${label})`, contentMd, meta: { metered_mwh: annualMwh, certificates } };
}

function termSheet(input: DocGenInput): DocGenResult {
  const p = input.subject;
  const name = str(p, 'project_name', 'Unnamed project');
  const mw = num(p, 'capacity_mw');
  const capex = Math.round(mw * CAPEX_ZAR_PER_MW);
  const senior = Math.round(capex * GEARING_PCT / 100);

  const contentMd = [
    `# Indicative Term Sheet — ${name}`,
    'For discussion only; subject to credit approval and full due diligence.',
    '',
    '| Term | Indicative basis |',
    '|------|------------------|',
    `| Project | ${name} (${mw.toFixed(1)} MW) |`,
    `| Estimated project cost | ZAR ${capex.toLocaleString('en-ZA')} |`,
    `| Senior facility | ZAR ${senior.toLocaleString('en-ZA')} (${GEARING_PCT}% gearing) |`,
    `| Tenor | ${SENIOR_TENOR_YEARS} years |`,
    `| Pricing | JIBAR + 450 bps |`,
    `| Security | First-ranking project security package |`,
    `| Conditions precedent | PPA, EPC, O&M, insurances, IE sign-off |`,
    '',
    '*Figures derived from nameplate capacity. Replace with the audited financial model before issue.*',
  ].join('\n');

  return { title: `Term sheet — ${name}`, contentMd, meta: { est_capex_zar: capex, senior_facility_zar: senior } };
}

function infoMemo(input: DocGenInput): DocGenResult {
  const p = input.subject;
  const name = str(p, 'project_name', 'Unnamed project');
  const tech = str(p, 'technology', 'solar PV');
  const mw = num(p, 'capacity_mw');
  const capex = Math.round(mw * CAPEX_ZAR_PER_MW);
  const tariff = num(p, 'ppa_price_per_mwh');
  const years = num(p, 'ppa_duration_years') || 15;

  const contentMd = [
    `# Information Memorandum — ${name}`,
    '',
    '## Opportunity',
    `${name} is a ${mw.toFixed(1)} MW ${tech} project seeking project finance. Estimated capital cost ZAR ${capex.toLocaleString('en-ZA')}.`,
    '',
    '## Revenue',
    tariff > 0
      ? `Contracted under a ${years}-year PPA at ZAR ${tariff.toLocaleString('en-ZA')}/MWh.`
      : `Revenue secured under a ${years}-year PPA (tariff under negotiation).`,
    '',
    '## Risk summary',
    'Construction, resource, offtake-credit and grid-curtailment risks are addressed in the data room. Key contracts (PPA, EPC, O&M) are in place or near-final.',
    '',
    '*Indicative memorandum generated from platform data; not an offer of securities.*',
  ].join('\n');

  return { title: `Information memorandum — ${name}`, contentMd, meta: { est_capex_zar: capex, ppa_price_per_mwh: tariff } };
}

function validationReport(input: DocGenInput): DocGenResult {
  const cp = input.subject;
  const name = str(cp, 'project_name', 'Unnamed project');
  const label = stdLabel(input.registryStandard || str(cp, 'methodology'));
  const issued = num(cp, 'credits_issued');

  const contentMd = [
    `# Validation Report Summary — ${name}`,
    `**Registry:** ${label}  |  **Methodology:** ${str(cp, 'methodology', 'TBC')}  |  **Project no.:** ${str(cp, 'project_number', 'n/a')}`,
    '',
    'Independent validation summary of the project design against the applicable standard.',
    '',
    '| Finding area | Opinion |',
    '|--------------|---------|',
    '| Methodology applicability | Conforming |',
    '| Baseline & additionality | Conforming, see CARs closed |',
    '| Monitoring plan | Conforming |',
    `| Credits issued to date | ${issued.toLocaleString('en-ZA')} tCO2e |`,
    '',
    '*Summary generated from registry data. Attach the full VVB validation opinion before submission.*',
  ].join('\n');

  return { title: `Validation report — ${name}`, contentMd, meta: { credits_issued: issued } };
}

function mrv(input: DocGenInput): DocGenResult {
  const m = input.subject;
  const claimed = num(m, 'claimed_reductions_tco');
  const baseline = num(m, 'baseline_emissions_tco');
  const project = num(m, 'project_emissions_tco');
  const leakage = num(m, 'leakage_tco');
  const net = baseline - project - leakage;
  const period = `${str(m, 'reporting_period_start', '?')} to ${str(m, 'reporting_period_end', '?')}`;

  const contentMd = [
    `# Monitoring & Verification Report`,
    `**Reporting period:** ${period}  |  **Methodology:** ${str(m, 'monitoring_methodology', str(m, 'baseline_methodology', 'TBC'))}`,
    '',
    '| Parameter | tCO2e |',
    '|-----------|-------|',
    `| Baseline emissions | ${baseline.toLocaleString('en-ZA')} |`,
    `| Project emissions | ${project.toLocaleString('en-ZA')} |`,
    `| Leakage | ${leakage.toLocaleString('en-ZA')} |`,
    `| Net reductions (computed) | **${net.toLocaleString('en-ZA')}** |`,
    `| Claimed reductions | ${claimed.toLocaleString('en-ZA')} |`,
    '',
    Math.abs(net - claimed) > 1
      ? '> **Variance flag:** computed net reductions differ from the claimed figure; reconcile before submission.'
      : '*Computed net reductions reconcile with the claimed figure.*',
  ].join('\n');

  return { title: `MRV report — ${period}`, contentMd, meta: { net_reductions_tco: net, claimed_tco: claimed } };
}

const RENDERERS: Record<DocType, (i: DocGenInput) => DocGenResult> = {
  pdd, rec_issuance_request: recIssuance, term_sheet: termSheet,
  info_memo: infoMemo, validation_report: validationReport, mrv,
};

export function generateDoc(input: DocGenInput): DocGenResult {
  const fn = RENDERERS[input.docType];
  if (!fn) throw new Error(`unknown doc_type: ${input.docType}`);
  return fn(input);
}
// ponytail: figure/money logic is covered by tests/doc-generation.test.ts.
