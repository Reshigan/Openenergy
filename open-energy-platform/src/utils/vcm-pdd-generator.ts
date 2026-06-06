// ═══════════════════════════════════════════════════════════════════════════════
// VCM PDD Section AI Generator
// Generates Gold Standard GS4GG / Verra VCS PDD sections using Workers AI.
// S3 (ER calculation) is fully deterministic. S2 (additionality) always flags
// for human review. All generated content stored in oe_vcm_pdd_sections.
// ═══════════════════════════════════════════════════════════════════════════════

import { ask } from './ai';

export type PddSectionCode =
  | 'S1_description'   // Project description, location, technology
  | 'S2_additionality' // Baseline + additionality — HUMAN REVIEW REQUIRED
  | 'S3_er_calc'       // Emission reduction calculation — DETERMINISTIC
  | 'S4_monitoring'    // Monitoring plan + parameters
  | 'S5_safeguards'    // Environmental/social safeguards
  | 'S6_sdg';          // SDG impact assessment (GS4GG: ≥3 SDGs incl. SDG13)

export interface PddGenerationInput {
  projectName: string;
  technology: string;
  installedCapacityKw: number;
  methodology: string;
  registryStandard: string;
  locationDescription: string;
  gpsLat: number;
  gpsLng: number;
  reippppBidRef?: string | null;
  nersaLicenceRef?: string | null;
  dffeDggef: number;           // default 0.942 tCO2e/MWh
  creditingPeriodYears: number;
  capacityFactor?: number;     // default 0.22 solar, 0.32 wind
}

export interface PddGenerationResult {
  sectionCode: PddSectionCode;
  contentMd: string;
  humanReviewRequired: boolean;
  dataInputs: Record<string, unknown>;
}

function resolveCapacityFactor(input: PddGenerationInput): number {
  if (input.capacityFactor != null) return input.capacityFactor;
  return input.technology.toLowerCase().includes('wind') ? 0.32 : 0.22;
}

function generateS3ErCalc(input: PddGenerationInput): string {
  const cf = resolveCapacityFactor(input);
  const mwInstalled = input.installedCapacityKw / 1000;
  const annualMwh = mwInstalled * 8760 * cf;
  const annualTco2e = annualMwh * input.dffeDggef;
  const totalCredits = annualTco2e * input.creditingPeriodYears;

  return [
    '## Section 3: Emission Reductions & Calculation',
    '',
    '### Baseline Scenario',
    `The project displaces electricity that would otherwise be sourced from the South African national grid.`,
    `The baseline emission factor used is the **DFFE DGGEF (${input.dffeDggef} tCO2e/MWh)**,`,
    `published annually by the Department of Forestry, Fisheries and the Environment.`,
    '',
    '### Ex-Ante Emission Reduction Calculation',
    '',
    `| Parameter | Value |`,
    `|-----------|-------|`,
    `| Installed capacity | ${mwInstalled.toFixed(1)} MW |`,
    `| Technology | ${input.technology} |`,
    `| Capacity factor | ${(cf * 100).toFixed(0)}% |`,
    `| Annual net generation | ${annualMwh.toFixed(0)} MWh/yr |`,
    `| Grid emission factor (DFFE DGGEF) | ${input.dffeDggef} tCO2e/MWh |`,
    `| Annual emission reductions | **${annualTco2e.toFixed(0)} tCO2e/yr** |`,
    `| Crediting period | ${input.creditingPeriodYears} years |`,
    `| Total ex-ante reductions | **${totalCredits.toFixed(0)} tCO2e** |`,
    '',
    '*Actual reductions will be verified by the VVB against monitored generation data.*',
  ].join('\n');
}

export async function generatePddSection(
  sectionCode: PddSectionCode,
  input: PddGenerationInput,
  env: any,
): Promise<PddGenerationResult> {
  if (sectionCode === 'S3_er_calc') {
    const cf = resolveCapacityFactor(input);
    return {
      sectionCode,
      contentMd: generateS3ErCalc(input),
      humanReviewRequired: false,
      dataInputs: {
        dggef: input.dffeDggef,
        capacity_kw: input.installedCapacityKw,
        capacity_factor: cf,
        crediting_years: input.creditingPeriodYears,
      },
    };
  }

  const humanReviewRequired = sectionCode === 'S2_additionality';

  const cf = resolveCapacityFactor(input);
  const annualMwh = (input.installedCapacityKw / 1000) * 8760 * cf;

  const prompts: Record<PddSectionCode, string> = {
    S1_description: `Write Section 1 (Project Description) for a carbon credit PDD.
Project: ${input.projectName}
Technology: ${input.technology}, ${(input.installedCapacityKw / 1000).toFixed(1)} MW
Location: ${input.locationDescription} (GPS: ${input.gpsLat}, ${input.gpsLng})
Registry: ${input.registryStandard} | Methodology: ${input.methodology}
REIPPPP ref: ${input.reippppBidRef ?? 'N/A'} | NERSA licence: ${input.nersaLicenceRef ?? 'pending'}

Write a professional project description of 300–400 words covering:
1. Project overview and objectives
2. Technology description and configuration
3. Geographic context and grid connection point
4. Crediting period and project timeline
5. Reference to the applicable methodology

Format as markdown with ### subheadings.`,

    S2_additionality: `Write Section 2 (Baseline Scenario & Additionality) DRAFT for a carbon credit PDD.
Project: ${input.projectName}, ${input.technology}, ${(input.installedCapacityKw / 1000).toFixed(1)} MW
Registry: ${input.registryStandard} | Methodology: ${input.methodology}

THIS IS A DRAFT requiring mandatory human expert review before submission.

Write structured additionality demonstration covering:
1. Baseline scenario identification (SA grid electricity = baseline)
2. Investment barrier test — flag IRR data as [REVIEWER INPUT REQUIRED]
3. Regulatory surplus test (REIPPPP licence required but does not guarantee commercial viability)
4. Common practice test — flag market penetration data as [REVIEWER INPUT REQUIRED]
5. Conclusion statement pending reviewer validation

Mark all data-dependent claims with [REVIEWER INPUT REQUIRED].
Format as markdown.`,

    S3_er_calc: '',

    S4_monitoring: `Write Section 4 (Monitoring Plan) for a carbon credit PDD.
Technology: ${input.technology}, ${(input.installedCapacityKw / 1000).toFixed(1)} MW
Methodology: ${input.methodology} | Registry: ${input.registryStandard}

Write a monitoring plan covering:
1. Parameters to monitor (net MWh generated, operating hours, capacity factor)
2. Monitoring frequency (monthly meter readings, quarterly SCADA audit)
3. Data quality assurance (cross-check utility meter vs inverter API telemetry)
4. Responsible party for monitoring
5. Data retention period (minimum 10 years per registry requirements)

Include a monitoring parameter table with columns: Parameter, Unit, Source, Frequency, QA Method.
Format as markdown.`,

    S5_safeguards: `Write Section 5 (Environmental & Social Safeguards) for a carbon credit PDD.
Project: ${input.projectName}, ${input.technology}
Location: ${input.locationDescription}

Write safeguards assessment covering:
1. Environmental impact summary — reference DFFE EA authorisation [EA DATA REQUIRED]
2. Community benefit assessment
3. No-harm verification (biodiversity, water resources, land rights)
4. Grievance mechanism description
5. Labour practices compliance (SA Labour Relations Act, BCEA, OHSA)

Flag sections requiring EA document data with [EA DATA REQUIRED].
Format as markdown.`,

    S6_sdg: `Write Section 6 (SDG Impact Assessment) for a GS4GG carbon credit project.
Project: ${input.projectName}, ${input.technology}, ${(input.installedCapacityKw / 1000).toFixed(1)} MW
Annual generation: approximately ${annualMwh.toFixed(0)} MWh/yr

Write SDG impact assessment covering MINIMUM 3 SDGs including SDG13:
- SDG13 (Climate Action): ${(annualMwh * input.dffeDggef).toFixed(0)} tCO2e/yr avoided; contribution to SA NDC 2030 trajectory
- SDG7 (Affordable & Clean Energy): estimate households powered (SA average: 3,500 kWh/yr per household)
- SDG8 (Decent Work): construction and O&M jobs (estimate: 0.5 FTE/MW for O&M)
- Optional: SDG3 (Health) from reduced coal combustion, SDG11 (Sustainable Cities)

For each SDG: quantified impact, evidence basis, and contribution to SA NDC.
Include an SDG impact summary table.
Format as markdown.`,
  };

  const prompt = prompts[sectionCode];
  const contentMd = await ask(env, { intent: 'generic.ask', prompt })
    .then(r => r.text)
    .catch(() => `<!-- AI generation failed — manual input required for ${sectionCode} -->`);

  return {
    sectionCode,
    contentMd,
    humanReviewRequired,
    dataInputs: { project_name: input.projectName, technology: input.technology, capacity_kw: input.installedCapacityKw },
  };
}
