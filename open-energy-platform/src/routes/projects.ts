// ═══════════════════════════════════════════════════════════════════════════
// Projects Routes — IPP Project CRUD operations
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';
import { buildFundingOptions } from '../utils/funding-options';
import { badEnum } from '../utils/validation';

const projects = new Hono<HonoEnv>();

// Apply auth middleware to all routes
projects.use('*', authMiddleware);

// GET /projects — List projects for user
projects.get('/', async (c) => {
  const user = getCurrentUser(c);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20'), 100);
  const offset = (page - 1) * pageSize;

  const query = `
    SELECT p.*, dev.name as developer_name
    FROM ipp_projects p
    LEFT JOIN participants dev ON p.developer_id = dev.id
    WHERE p.developer_id = ?
    ORDER BY p.created_at DESC LIMIT ? OFFSET ?
  `;
  const params = [user.id, pageSize, offset];

  const result = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    success: true,
    data: result.results || [],
    pagination: {
      page,
      pageSize,
      total: result.results?.length || 0,
      totalPages: 1,
    },
  });
});

// GET /projects/:id — Get single project
projects.get('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const project = await c.env.DB.prepare(`
    SELECT p.*, dev.name as developer_name
    FROM ipp_projects p
    LEFT JOIN participants dev ON p.developer_id = dev.id
    WHERE p.id = ? AND p.developer_id = ?
  `).bind(id, user.id).first();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  return c.json({ success: true, data: project });
});

// GET /projects/:id/lifecycle — End-to-end lifecycle snapshot for one project.
//
// Solar generators (and other IPP devs) need a single screen that walks their
// project from origination → development → financing → construction →
// commissioning → operation → decommission. The data already exists in the
// schema (migrations 002/024/046), but it was scattered across the
// `/ipp-lifecycle` workbench tabs, detached from the specific project file.
// This endpoint stitches it back together: one project, seven stages, real
// record counts and a derived per-stage status, plus the next blocker for
// AI inline assist on the SPA timeline.
projects.get('/:id/lifecycle', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const project = await c.env.DB.prepare(`
    SELECT p.*, dev.name as developer_name
    FROM ipp_projects p
    LEFT JOIN participants dev ON p.developer_id = dev.id
    WHERE p.id = ? AND (p.developer_id = ? OR ? IN ('admin','support','regulator'))
  `).bind(id, user.id, user.role).first<any>();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Parallel one-shot count queries for every lifecycle-relevant table.
  // The cost is one prepared statement per stage block — kept under the
  // 50ms Workers CPU budget on indexed PKs/FKs. Each query is wrapped in a
  // catch so a missing table on an older deploy doesn't 500 the page.
  const safeCount = async (sql: string, params: unknown[]) =>
    c.env.DB.prepare(sql).bind(...params).first<{ c: number }>().then(r => Number(r?.c || 0)).catch(() => 0);

  const [
    siteAssessments, resourceCampaigns, yieldEstimates,
    permits, envAuths, envCompliance, landParcels, servitudes,
    financialModels, infoMemorandums, drawdownsRequested, drawdownsExecuted,
    epcContracts, epcVariations, epcLDs, milestones, milestonesSatisfied,
    commissioningTests, commissioningPassed, tocIssued,
    nominations, workOrders, sparesInventory,
    decommissioningPlans, insurancePolicies,
  ] = await Promise.all([
    safeCount('SELECT COUNT(*) c FROM ipp_site_assessments WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_resource_campaigns WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_yield_estimates WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_permits WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM environmental_authorisations WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM environmental_compliance WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM land_parcels WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM servitudes WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_financial_models WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_info_memorandums WHERE project_id = ?', [id]),
    safeCount("SELECT COUNT(*) c FROM ipp_drawdown_requests WHERE project_id = ? AND status != 'executed'", [id]),
    safeCount("SELECT COUNT(*) c FROM ipp_drawdown_requests WHERE project_id = ? AND status = 'executed'", [id]),
    safeCount('SELECT COUNT(*) c FROM epc_contracts WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM epc_variations v INNER JOIN epc_contracts e ON e.id = v.epc_contract_id WHERE e.project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM epc_liquidated_damages l INNER JOIN epc_contracts e ON e.id = l.epc_contract_id WHERE e.project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM project_milestones WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM project_milestones WHERE project_id = ? AND satisfied_date IS NOT NULL', [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_commissioning_tests WHERE project_id = ?', [id]),
    safeCount("SELECT COUNT(*) c FROM ipp_commissioning_tests WHERE project_id = ? AND result = 'pass'", [id]),
    safeCount("SELECT COUNT(*) c FROM epc_contracts WHERE project_id = ? AND COALESCE(taking_over_certificate_date,'') != ''", [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_nominations WHERE project_id = ?', [id]),
    safeCount("SELECT COUNT(*) c FROM ipp_work_orders WHERE project_id = ? AND status IN ('open','in_progress')", [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_spares_inventory WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM ipp_decommissioning_plans WHERE project_id = ?', [id]),
    safeCount('SELECT COUNT(*) c FROM insurance_policies WHERE project_id = ?', [id]),
  ]);

  // Project status from the canonical `ipp_projects.status` column. Drives
  // the default per-stage status overlay: stages strictly before the
  // current phase are completed, the current phase is in_progress, later
  // phases are not_started — overridden where the records suggest more.
  const projectPhase: string = String(project.status || 'development');
  const phaseOrder: Record<string, number> = {
    development: 0,
    construction: 3,
    commissioning: 4,
    commercial_operations: 5,
    decommissioned: 6,
  };
  const currentPhaseIdx = phaseOrder[projectPhase] ?? 0;

  type Stage = {
    key: string;
    label: string;
    summary: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
    records: Record<string, number>;
    workflow: { label: string; href: string };
    next_action?: string | null;
  };

  const stageStatus = (idx: number, override?: Stage['status']) => {
    if (override) return override;
    if (idx < currentPhaseIdx) return 'completed';
    if (idx === currentPhaseIdx) return 'in_progress';
    return 'not_started';
  };

  const lifecycleHref = `/ipp-lifecycle`;
  const stages: Stage[] = [
    {
      key: 'origination',
      label: '1 · Origination',
      summary: 'Site screening, resource campaigns, yield estimates.',
      status: stageStatus(
        0,
        siteAssessments + resourceCampaigns + yieldEstimates === 0
          ? 'not_started'
          : yieldEstimates > 0 ? 'completed' : 'in_progress',
      ),
      records: {
        site_assessments: siteAssessments,
        resource_campaigns: resourceCampaigns,
        yield_estimates: yieldEstimates,
      },
      workflow: { label: 'Open origination workbench', href: lifecycleHref },
      next_action:
        siteAssessments === 0
          ? 'Run a site assessment to lock in feasibility.'
          : yieldEstimates === 0
            ? 'Commission a yield estimate before the financial model.'
            : null,
    },
    {
      key: 'development',
      label: '2 · Development & permits',
      summary: 'NEMA s.24, water-use, heritage, land assembly, servitudes.',
      status: stageStatus(
        1,
        envAuths + permits + landParcels === 0
          ? 'not_started'
          : envAuths > 0 && landParcels > 0
            ? (currentPhaseIdx >= 3 ? 'completed' : 'in_progress')
            : 'in_progress',
      ),
      records: {
        permits,
        env_authorisations: envAuths,
        env_compliance: envCompliance,
        land_parcels: landParcels,
        servitudes,
      },
      workflow: { label: 'Open development workbench', href: lifecycleHref },
      next_action:
        envAuths === 0
          ? 'Lodge the NEMA s.24 application — typical decision window is 90–120 days.'
          : landParcels === 0
            ? 'Secure land options or servitudes before financial close.'
            : null,
    },
    {
      key: 'financing',
      label: '3 · Financing',
      summary: 'Financial model, info memorandum, lender appointment, drawdowns.',
      status: stageStatus(
        2,
        financialModels === 0
          ? 'not_started'
          : drawdownsExecuted > 0
            ? 'completed'
            : 'in_progress',
      ),
      records: {
        financial_models: financialModels,
        info_memorandums: infoMemorandums,
        drawdowns_requested: drawdownsRequested,
        drawdowns_executed: drawdownsExecuted,
        insurance_policies: insurancePolicies,
      },
      workflow: { label: 'Open financing workbench', href: lifecycleHref },
      next_action:
        financialModels === 0
          ? 'Build the financial model — needed to issue the info memorandum.'
          : infoMemorandums === 0
            ? 'Issue an information memorandum to begin lender outreach.'
            : drawdownsExecuted === 0 && drawdownsRequested === 0
              ? 'Request the first drawdown after financial close.'
              : null,
    },
    {
      key: 'construction',
      label: '4 · Construction',
      summary: 'EPC contract, variations, milestones, liquidated damages.',
      status: stageStatus(
        3,
        epcContracts === 0
          ? 'not_started'
          : tocIssued > 0
            ? 'completed'
            : 'in_progress',
      ),
      records: {
        epc_contracts: epcContracts,
        variations: epcVariations,
        liquidated_damages: epcLDs,
        milestones,
        milestones_satisfied: milestonesSatisfied,
      },
      workflow: { label: 'Open EPC workbench', href: lifecycleHref },
      next_action:
        epcContracts === 0
          ? 'Register the EPC contract before mobilisation.'
          : milestones === 0
            ? 'Schedule the construction milestone plan (financial close → mobilisation → cold commissioning).'
            : null,
    },
    {
      key: 'commissioning',
      label: '5 · Commissioning',
      summary: 'Hot/cold commissioning, performance tests, takeover certificate.',
      status: stageStatus(
        4,
        tocIssued > 0
          ? 'completed'
          : commissioningTests === 0
            ? 'not_started'
            : 'in_progress',
      ),
      records: {
        commissioning_tests: commissioningTests,
        tests_passed: commissioningPassed,
        toc_issued: tocIssued,
      },
      workflow: { label: 'Open commissioning workbench', href: lifecycleHref },
      next_action:
        tocIssued > 0
          ? null
          : commissioningTests === 0
            ? 'Schedule cold-commissioning tests before grid connection.'
            : commissioningPassed < commissioningTests
              ? `${commissioningTests - commissioningPassed} test${commissioningTests - commissioningPassed === 1 ? '' : 's'} still to pass before takeover.`
              : 'Issue the taking-over certificate.',
    },
    {
      key: 'operation',
      label: '6 · Operation',
      summary: 'Nominations, work orders, spares, generation, settlements.',
      status: stageStatus(
        5,
        currentPhaseIdx >= 5
          ? (workOrders > 0 ? 'in_progress' : 'in_progress')
          : 'not_started',
      ),
      records: {
        nominations,
        work_orders_open: workOrders,
        spares: sparesInventory,
        insurance: insurancePolicies,
      },
      workflow: { label: 'Open Esums workbench', href: '/esums' },
      next_action:
        currentPhaseIdx < 5
          ? null
          : sparesInventory === 0
            ? 'Stock the spares inventory before COD to avoid availability LDs.'
            : null,
    },
    {
      key: 'decommission',
      label: '7 · Decommission',
      summary: 'End-of-life plan, dismantling, site restoration.',
      status: stageStatus(
        6,
        decommissioningPlans > 0
          ? (projectPhase === 'decommissioned' ? 'completed' : 'in_progress')
          : 'not_started',
      ),
      records: {
        decommissioning_plans: decommissioningPlans,
      },
      workflow: { label: 'Open decommissioning workbench', href: lifecycleHref },
      next_action:
        projectPhase === 'commercial_operations' && decommissioningPlans === 0
          ? 'Draft a decommissioning plan ahead of mid-life refinancing.'
          : null,
    },
  ];

  // AI inline assists — surface the first non-null next_action as the
  // top-of-page nudge, plus a generic insurance/financing reminder if
  // they're missing at the current phase. Each suggestion is keyed so a
  // server-side accept-log can audit acceptance.
  type Suggest = { key: string; title: string; why: string; confidence?: number; accept?: { label: string; href: string } };
  const suggestions: Suggest[] = [];
  const firstActionable = stages.find((s) => s.next_action && s.status !== 'completed');
  if (firstActionable && firstActionable.next_action) {
    suggestions.push({
      key: `next_${firstActionable.key}`,
      title: `Next blocker: ${firstActionable.label.replace(/^\d+ · /, '')}`,
      why: firstActionable.next_action,
      confidence: 0.85,
      accept: { label: firstActionable.workflow.label, href: firstActionable.workflow.href },
    });
  }
  if (currentPhaseIdx >= 3 && insurancePolicies === 0) {
    suggestions.push({
      key: 'insurance_missing',
      title: 'No insurance policy on file',
      why: 'EPC contracts and lenders both typically require All Risks and DSU cover from mobilisation. Add a policy before drawdown.',
      confidence: 0.9,
      accept: { label: 'Open insurance register', href: lifecycleHref },
    });
  }

  return c.json({
    success: true,
    data: {
      project,
      phase: projectPhase,
      stages,
      ai_suggestions: suggestions,
    },
  });
});

// GET /projects/:id/file — Full project file aggregator.
//
// The project entity is the holder for everything that happens to a renewable-
// energy IPP: plan, milestones, permits, land, funding, contracts, carbon,
// operations. This endpoint returns a single payload with every section
// already populated, so the project detail page can render as a tabbed
// container (like Esums for an O&M site) instead of cross-linking out to
// half a dozen workbenches.
//
// Section conventions:
//   - Each section is an object on the response with arrays of rows.
//   - Empty sections still return [] so the UI can render "no X yet" consistently.
//   - Per-table queries are wrapped in catch() so a missing table on an older
//     deploy or tenant doesn't 500 the whole page.
//   - Row limit per table is capped at 50 — sufficient for a project file view;
//     deeper drill-down lives in the dedicated workbench.
projects.get('/:id/file', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const project = await c.env.DB.prepare(`
    SELECT p.*, dev.name as developer_name, dev.email as developer_email
    FROM ipp_projects p
    LEFT JOIN participants dev ON p.developer_id = dev.id
    WHERE p.id = ? AND (p.developer_id = ? OR ? IN ('admin','support','regulator','lender','grid_operator'))
  `).bind(id, user.id, user.role).first<any>();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  // Generic safe-rows helper. Cap at 50 rows per table to keep the payload
  // bounded; deeper inspection happens in the per-workbench drill-down.
  const safeAll = async <T = any>(sql: string, params: unknown[]): Promise<T[]> =>
    c.env.DB.prepare(sql).bind(...params).all<T>().then(r => (r.results || []) as T[]).catch(() => [] as T[]);

  // ── Plan & milestones ──────────────────────────────────────────────────
  const [milestones, cpReadiness] = await Promise.all([
    safeAll('SELECT * FROM project_milestones WHERE project_id = ? ORDER BY COALESCE(order_index, 0), target_date LIMIT 50', [id]),
    safeAll('SELECT * FROM project_cp_readiness WHERE project_id = ? ORDER BY target_date LIMIT 50', [id]),
  ]);

  // ── Origination (resource + yield) ─────────────────────────────────────
  const [siteAssessments, resourceCampaigns, yieldEstimates] = await Promise.all([
    safeAll('SELECT * FROM ipp_site_assessments WHERE project_id = ? ORDER BY created_at DESC LIMIT 20', [id]),
    safeAll('SELECT * FROM ipp_resource_campaigns WHERE project_id = ? ORDER BY start_date DESC LIMIT 20', [id]),
    safeAll('SELECT * FROM ipp_yield_estimates WHERE project_id = ? ORDER BY created_at DESC LIMIT 20', [id]),
  ]);

  // ── Permits & environmental ────────────────────────────────────────────
  const [permits, envAuths, envCompliance, landParcels, servitudes] = await Promise.all([
    safeAll('SELECT * FROM ipp_permits WHERE project_id = ? ORDER BY COALESCE(decided_at, applied_at, created_at) DESC LIMIT 50', [id]),
    safeAll('SELECT * FROM environmental_authorisations WHERE project_id = ? ORDER BY COALESCE(decision_date, applied_date, created_at) DESC LIMIT 50', [id]),
    safeAll(
      `SELECT ec.*, ea.authorisation_type, ea.reference_number
       FROM environmental_compliance ec
       INNER JOIN environmental_authorisations ea ON ea.id = ec.authorisation_id
       WHERE ea.project_id = ?
       ORDER BY ec.due_date DESC LIMIT 50`,
      [id],
    ),
    safeAll('SELECT * FROM land_parcels WHERE project_id = ? ORDER BY status, area_hectares DESC LIMIT 50', [id]),
    safeAll('SELECT * FROM servitudes WHERE project_id = ? ORDER BY registration_date DESC LIMIT 50', [id]),
  ]);

  // ── Funding (models, memos, drawdowns, insurance, covenants, reserves) ─
  const [
    financialModels, infoMemorandums, drawdowns,
    insurancePolicies, covenants, covenantTests,
    reserveAccounts, waterfallRuns,
  ] = await Promise.all([
    safeAll('SELECT * FROM ipp_financial_models WHERE project_id = ? ORDER BY created_at DESC LIMIT 10', [id]),
    safeAll('SELECT * FROM ipp_info_memorandums WHERE project_id = ? ORDER BY created_at DESC LIMIT 10', [id]),
    safeAll('SELECT * FROM ipp_drawdown_requests WHERE project_id = ? ORDER BY COALESCE(disbursed_at, requested_at) DESC LIMIT 50', [id]),
    safeAll('SELECT * FROM insurance_policies WHERE project_id = ? ORDER BY period_end DESC LIMIT 20', [id]),
    safeAll('SELECT * FROM covenants WHERE project_id = ? ORDER BY status, covenant_code LIMIT 50', [id]),
    safeAll('SELECT t.* FROM covenant_tests t INNER JOIN covenants c ON c.id = t.covenant_id WHERE c.project_id = ? ORDER BY t.test_period DESC LIMIT 50', [id]),
    safeAll('SELECT * FROM reserve_accounts WHERE project_id = ? ORDER BY reserve_type LIMIT 20', [id]),
    safeAll('SELECT * FROM waterfall_runs WHERE project_id = ? ORDER BY period DESC LIMIT 20', [id]),
  ]);

  // ── Contracts (EPC, term sheets, PPAs, LOIs, redlines) ─────────────────
  const [
    epcContracts, epcVariations, epcLDs,
    contractDocs, lois,
  ] = await Promise.all([
    safeAll('SELECT * FROM epc_contracts WHERE project_id = ? ORDER BY commissioning_date DESC LIMIT 10', [id]),
    safeAll('SELECT v.* FROM epc_variations v INNER JOIN epc_contracts e ON e.id = v.epc_contract_id WHERE e.project_id = ? ORDER BY v.raised_at DESC LIMIT 50', [id]),
    safeAll('SELECT l.* FROM epc_liquidated_damages l INNER JOIN epc_contracts e ON e.id = l.epc_contract_id WHERE e.project_id = ? ORDER BY l.event_date DESC LIMIT 50', [id]),
    safeAll('SELECT cd.*, p.name as counterparty_name FROM contract_documents cd LEFT JOIN participants p ON p.id = cd.counterparty_id WHERE cd.project_id = ? ORDER BY cd.created_at DESC LIMIT 50', [id]),
    safeAll('SELECT * FROM loi_drafts WHERE project_id = ? ORDER BY created_at DESC LIMIT 50', [id]),
  ]);

  // ── Carbon (vintages, RECs, MRV) ───────────────────────────────────────
  // Carbon vintages/MRV link via carbon_projects, which in turn may reference
  // ipp_projects via source_project_id. RECs (offtaker suite) link via
  // counterparty/issuer. Best-effort: include both direct & indirect links.
  const [
    carbonVintages, mrvSubmissions, recCertificates, esgRecCertificates,
  ] = await Promise.all([
    safeAll(
      `SELECT v.* FROM credit_vintages v
       INNER JOIN carbon_projects cp ON cp.id = v.project_id
       WHERE cp.id = ?
       ORDER BY v.vintage_year DESC LIMIT 20`,
      [id],
    ),
    safeAll(
      `SELECT m.* FROM mrv_submissions m
       INNER JOIN carbon_projects cp ON cp.id = m.project_id
       WHERE cp.id = ?
       ORDER BY m.reporting_period_end DESC LIMIT 20`,
      [id],
    ),
    safeAll('SELECT * FROM rec_certificates WHERE project_id = ? ORDER BY generation_period_end DESC LIMIT 20', [id]),
    safeAll('SELECT * FROM esg_rec_certificates WHERE source_project_id = ? ORDER BY issue_date DESC LIMIT 20', [id]),
  ]);

  // ── Operations (Esums + project-side ops) ──────────────────────────────
  // Esums sites store the project's operating data once COD is reached.
  const [
    nominations, workOrders, sparesInventory, commissioningTests,
    omSites, omFaultsOpen, omWorkOrdersOpen,
  ] = await Promise.all([
    safeAll('SELECT * FROM ipp_nominations WHERE project_id = ? ORDER BY delivery_date DESC LIMIT 30', [id]),
    safeAll('SELECT * FROM ipp_work_orders WHERE project_id = ? ORDER BY COALESCE(actual_start, scheduled_start, created_at) DESC LIMIT 30', [id]),
    safeAll('SELECT * FROM ipp_spares_inventory WHERE project_id = ? ORDER BY description LIMIT 30', [id]),
    safeAll('SELECT * FROM ipp_commissioning_tests WHERE project_id = ? ORDER BY COALESCE(executed_at, scheduled_at, created_at) DESC LIMIT 30', [id]),
    safeAll('SELECT * FROM om_sites WHERE project_id = ? ORDER BY name LIMIT 5', [id]),
    safeAll(
      `SELECT f.* FROM om_faults f
       INNER JOIN om_devices d ON d.id = f.device_id
       INNER JOIN om_sites s ON s.id = d.site_id
       WHERE s.project_id = ? AND f.status IN ('open','in_progress')
       ORDER BY f.detected_at DESC LIMIT 20`,
      [id],
    ),
    safeAll(
      `SELECT w.* FROM om_work_orders w
       INNER JOIN om_sites s ON s.id = w.site_id
       WHERE s.project_id = ? AND w.status IN ('created','assigned','en_route','on_site')
       ORDER BY w.sla_deadline LIMIT 20`,
      [id],
    ),
  ]);

  // ── Community & social (REIPPPP ED/SED, stakeholder engagement) ────────
  const [communityStakeholders, communityEngagements, edSedSpend] = await Promise.all([
    safeAll('SELECT * FROM community_stakeholders WHERE project_id = ? ORDER BY stakeholder_type, stakeholder_name LIMIT 50', [id]),
    safeAll('SELECT * FROM community_engagements WHERE project_id = ? ORDER BY engagement_date DESC LIMIT 50', [id]),
    safeAll('SELECT * FROM ed_sed_spend WHERE project_id = ? ORDER BY period DESC LIMIT 30', [id]),
  ]);

  // ── Decommissioning ────────────────────────────────────────────────────
  const decommissioningPlans = await safeAll(
    'SELECT * FROM ipp_decommissioning_plans WHERE project_id = ? ORDER BY created_at DESC LIMIT 10',
    [id],
  );

  // ── Phase + tab status overlays ────────────────────────────────────────
  // Convert counts into per-tab "completion" hints so the SPA can render
  // tab badges (badge counts + status dots) without a second round-trip.
  const completedMilestones = (milestones as Array<{ satisfied_date?: string; status?: string }>).filter(
    (m) => m.satisfied_date || m.status === 'satisfied',
  ).length;
  const executedDrawdowns = (drawdowns as Array<{ status?: string }>).filter(
    (d) => d.status === 'executed' || d.status === 'disbursed',
  ).length;
  const activeCovenants = (covenants as Array<{ status?: string }>).filter((c) => c.status === 'active').length;
  const breachedCovenants = (covenants as Array<{ status?: string }>).filter((c) => c.status === 'breached').length;
  const openFaults = omFaultsOpen.length;
  const totalCarbonIssued = (carbonVintages as Array<{ credits_issued?: number }>).reduce(
    (s, v) => s + (Number(v.credits_issued) || 0),
    0,
  );

  // ── AI inline assists ──────────────────────────────────────────────────
  type Suggest = { key: string; tab: string; title: string; why: string; confidence?: number; accept?: { label: string; href: string } };
  const suggestions: Suggest[] = [];
  if ((envAuths as Array<{ decision?: string }>).every((a) => (a.decision || '').toLowerCase() !== 'granted')) {
    suggestions.push({
      key: 'permits_pending',
      tab: 'permits',
      title: 'NEMA s.24 authorisation not yet granted',
      why: 'No environmental authorisation is in "granted" state. Decision window is typically 90–120 days; chase the competent authority if lodged >60 days ago.',
      confidence: 0.85,
      accept: { label: 'Open permits tab', href: `/projects/${id}?tab=permits` },
    });
  }
  if (financialModels.length === 0 && project.status !== 'commercial_operations') {
    suggestions.push({
      key: 'no_financial_model',
      tab: 'funding',
      title: 'No financial model on file',
      why: 'Lender outreach is gated on a base-case financial model with DSCR ≥ 1.20 and LLCR ≥ 1.40.',
      confidence: 0.9,
      accept: { label: 'Open funding tab', href: `/projects/${id}?tab=funding` },
    });
  }
  if (breachedCovenants > 0) {
    suggestions.push({
      key: 'covenant_breach',
      tab: 'funding',
      title: `${breachedCovenants} covenant${breachedCovenants === 1 ? '' : 's'} in breach`,
      why: 'Notify the lender within the cure period stipulated in the facility agreement. Document remediation plan in the funding tab.',
      confidence: 0.95,
      accept: { label: 'Review covenant tests', href: `/projects/${id}?tab=funding` },
    });
  }
  if (openFaults > 0) {
    suggestions.push({
      key: 'om_faults_open',
      tab: 'operations',
      title: `${openFaults} open O&M fault${openFaults === 1 ? '' : 's'} on linked Esums site`,
      why: 'Open faults eat directly into availability covenant performance. Triage in the Esums work-order queue.',
      confidence: 0.9,
      accept: { label: 'Open operations tab', href: `/projects/${id}?tab=operations` },
    });
  }

  return c.json({
    success: true,
    data: {
      project,
      phase: project.status || 'development',
      summary: {
        milestones_total: milestones.length,
        milestones_completed: completedMilestones,
        permits_total: permits.length + envAuths.length,
        permits_granted: (envAuths as Array<{ decision?: string }>).filter((a) => (a.decision || '').toLowerCase() === 'granted').length,
        land_parcels: landParcels.length,
        drawdowns_executed: executedDrawdowns,
        drawdowns_total: drawdowns.length,
        covenants_active: activeCovenants,
        covenants_breached: breachedCovenants,
        epc_contracts: epcContracts.length,
        lois_total: lois.length,
        contracts_total: contractDocs.length,
        carbon_credits_issued: totalCarbonIssued,
        rec_certificates: recCertificates.length + esgRecCertificates.length,
        om_sites: omSites.length,
        om_faults_open: openFaults,
        om_work_orders_open: omWorkOrdersOpen.length,
      },
      plan: { milestones, cp_readiness: cpReadiness },
      origination: { site_assessments: siteAssessments, resource_campaigns: resourceCampaigns, yield_estimates: yieldEstimates },
      permits: { permits, env_authorisations: envAuths, env_compliance: envCompliance },
      land_community: {
        land_parcels: landParcels,
        servitudes,
        stakeholders: communityStakeholders,
        engagements: communityEngagements,
        ed_sed_spend: edSedSpend,
      },
      funding: {
        financial_models: financialModels,
        info_memorandums: infoMemorandums,
        drawdowns,
        insurance_policies: insurancePolicies,
        covenants,
        covenant_tests: covenantTests,
        reserve_accounts: reserveAccounts,
        waterfall_runs: waterfallRuns,
      },
      contracts: {
        epc: epcContracts,
        epc_variations: epcVariations,
        epc_liquidated_damages: epcLDs,
        documents: contractDocs,
        lois,
      },
      carbon: {
        vintages: carbonVintages,
        mrv_submissions: mrvSubmissions,
        rec_certificates: recCertificates,
        esg_rec_certificates: esgRecCertificates,
      },
      operations: {
        nominations,
        ipp_work_orders: workOrders,
        spares_inventory: sparesInventory,
        commissioning_tests: commissioningTests,
        om_sites: omSites,
        om_faults_open: omFaultsOpen,
        om_work_orders_open: omWorkOrdersOpen,
      },
      decommission: { plans: decommissioningPlans },
      ai_suggestions: suggestions,
    },
  });
});

// POST /projects — Create new project
projects.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const { project_name, structure_type, technology, capacity_mw, location, grid_connection_point, ppa_volume_mwh, ppa_price_per_mwh, ppa_duration_years, construction_start_date, commercial_operation_date } = body;

  if (!project_name || !structure_type || !technology || !capacity_mw || !location) {
    return c.json({ success: false, error: 'Missing required fields: project_name, structure_type, technology, capacity_mw, location' }, 400);
  }

  const badStructure = badEnum('structure_type', structure_type, ['build_operate_transfer', 'build_own_operate', 'private_wire', 'direct_agreement']);
  if (badStructure) return c.json({ success: false, error: badStructure }, 400);

  const projectId = 'ip_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  await c.env.DB.prepare(`
    INSERT INTO ipp_projects (
      id, project_name, developer_id, structure_type, technology, capacity_mw, location,
      grid_connection_point, ppa_volume_mwh, ppa_price_per_mwh, ppa_duration_years,
      construction_start_date, commercial_operation_date, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'development', ?)
  `).bind(
    projectId, project_name, user.id, structure_type, technology, capacity_mw, location,
    grid_connection_point || null, ppa_volume_mwh || null, ppa_price_per_mwh || null, ppa_duration_years || null,
    construction_start_date || null, commercial_operation_date || null, new Date().toISOString()
  ).run();

  const project = await c.env.DB.prepare('SELECT * FROM ipp_projects WHERE id = ?').bind(projectId).first();

  await fireCascade({
    event: 'ipp.project_created',
    actor_id: user.id,
    entity_type: 'ipp_projects',
    entity_id: projectId,
    data: { project_name, technology, capacity_mw, location },
    env: c.env,
  });

  return c.json({ success: true, data: project }, 201);
});

// GET /projects/:id/funding-options — standing carbon-fund + lender offers aimed
// at the IPP, each scored for fit against this project. This is the "pop up
// options when an IPP loads a project for funding" surface: the IPP reviews the
// offers (many funders / carbon funds with different terms) and multi-selects via
// POST /engage. Read-only matcher; no writes.
projects.get('/:id/funding-options', async (c) => {
  getCurrentUser(c);                          // require auth
  const id = c.req.param('id');
  const project = await c.env.DB.prepare(
    'SELECT id, technology, capacity_mw, ppa_volume_mwh FROM ipp_projects WHERE id = ?',
  ).bind(id).first();
  if (!project) return c.json({ success: false, error: 'Project not found' }, 404);

  const options = await buildFundingOptions(c.env, {
    id: String(project.id),
    technology: project.technology != null ? String(project.technology) : null,
    capacity_mw: Number(project.capacity_mw) || 0,
    ppa_volume_mwh: project.ppa_volume_mwh != null ? Number(project.ppa_volume_mwh) : null,
  });
  return c.json({ success: true, data: options });
});

// POST /projects/:id/engage — IPP multi-selects one/some/all offers to kick off
// cross-chain engagement. Inserts an oe_offer_engagements handshake per selected
// offer and fires marketplace.inquired so the project-funding-offers cascade rule
// pushes "New funding request for <project>" into each offeror's IncomingPanel.
// Body: { offer_ids: string[], note?: string }.
projects.post('/:id/engage', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const offerIds: string[] = Array.isArray(body?.offer_ids)
    ? body.offer_ids.filter((x: unknown) => typeof x === 'string' && x).slice(0, 50)
    : [];
  const note = typeof body?.note === 'string' ? body.note.slice(0, 1000) : null;

  const project = await c.env.DB.prepare(
    'SELECT id, project_name, developer_id FROM ipp_projects WHERE id = ?',
  ).bind(id).first();
  if (!project) return c.json({ success: false, error: 'Project not found' }, 404);
  if (project.developer_id !== user.id) return c.json({ success: false, error: 'Not authorized' }, 403);
  if (offerIds.length === 0) return c.json({ success: false, error: 'offer_ids is required' }, 400);

  // Only engage offers that are genuinely active and aimed at this role; bind the
  // ids as placeholders (never interpolate).
  const placeholders = offerIds.map(() => '?').join(',');
  const offers = await c.env.DB.prepare(
    `SELECT id, offeror_participant_id, offeror_role, offer_kind
       FROM oe_counterparty_offers
      WHERE status = 'active' AND target_role = 'ipp_developer' AND id IN (${placeholders})`,
  ).bind(...offerIds).all();

  const label = String(project.project_name ?? id);
  const engaged: string[] = [];
  for (const row of (offers.results ?? []) as Array<Record<string, unknown>>) {
    const offerId = String(row.id);
    const engId = 'eng_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    await c.env.DB.prepare(
      `INSERT INTO oe_offer_engagements
         (id, offer_id, offer_kind, initiator_id, initiator_role, offeror_id, offeror_role,
          entity_type, entity_id, entity_label, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ipp_developer', ?, ?, 'ipp_projects', ?, ?, 'requested', ?, ?, ?)`,
    ).bind(
      engId, offerId, String(row.offer_kind ?? ''), user.id,
      String(row.offeror_participant_id ?? ''), String(row.offeror_role ?? ''),
      id, label, note, new Date().toISOString(), new Date().toISOString(),
    ).run();
    engaged.push(offerId);

    // One cascade per engagement carries the offeror + offer so the rule can
    // target the right IncomingPanel.
    await fireCascade({
      event: 'marketplace.inquired',
      actor_id: user.id,
      entity_type: 'oe_offer_engagements',
      entity_id: engId,
      data: {
        engagement_id: engId,
        offer_id: offerId,
        offer_kind: String(row.offer_kind ?? ''),
        offeror_id: String(row.offeror_participant_id ?? ''),
        offeror_role: String(row.offeror_role ?? ''),
        project_id: id,
        project_name: label,
        note: note ?? '',
      },
      env: c.env,
    });
  }

  if (engaged.length === 0) return c.json({ success: false, error: 'No active offers matched the selection' }, 400);
  return c.json({ success: true, data: { engaged_offer_ids: engaged, count: engaged.length } }, 201);
});

// GET /projects/:id/milestones — list milestones for a project
projects.get('/:id/milestones', async (c) => {
  getCurrentUser(c);                          // require auth
  const id = c.req.param('id');
  const project = await c.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(id).first();
  if (!project) return c.json({ success: false, error: 'Project not found' }, 404);

  const milestones = await c.env.DB.prepare(
    'SELECT * FROM project_milestones WHERE project_id = ? ORDER BY order_index ASC'
  ).bind(id).all();
  return c.json({ success: true, data: milestones.results || [] });
});

// POST /projects/:id/milestones — create a milestone (developer only)
projects.post('/:id/milestones', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const { milestone_name, milestone_type, order_index, target_date, notes } = await c.req.json();

  const project = await c.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(id).first();
  if (!project) return c.json({ success: false, error: 'Project not found' }, 404);
  if (project.developer_id !== user.id) return c.json({ success: false, error: 'Not authorized' }, 403);
  if (!milestone_name || !milestone_type || !target_date) return c.json({ success: false, error: 'milestone_name, milestone_type, target_date are required' }, 400);

  const badMilestone = badEnum('milestone_type', milestone_type, ['financial_close', 'construction_start', 'construction_complete', 'commissioning', 'cod', 'operational', 'termination']);
  if (badMilestone) return c.json({ success: false, error: badMilestone }, 400);

  const mid = 'ms_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  await c.env.DB.prepare(`
    INSERT INTO project_milestones (id, project_id, milestone_name, milestone_type, order_index, target_date, status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(mid, id, milestone_name, milestone_type, order_index ?? 0, target_date, notes || null, new Date().toISOString()).run();

  return c.json({ success: true, data: { id: mid } }, 201);
});

// POST /projects/:id/milestones/:mid/satisfy — fires ipp.milestone_satisfied cascade
projects.post('/:id/milestones/:mid/satisfy', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const mid = c.req.param('mid');
  const { evidence_keys, notes } = await c.req.json().catch(() => ({}));

  const project = await c.env.DB.prepare('SELECT id, project_name, developer_id FROM ipp_projects WHERE id = ?').bind(id).first();
  if (!project) return c.json({ success: false, error: 'Project not found' }, 404);
  if (project.developer_id !== user.id) return c.json({ success: false, error: 'Only the developer can satisfy milestones' }, 403);

  const milestone = await c.env.DB.prepare('SELECT id, milestone_name, milestone_type, status FROM project_milestones WHERE id = ? AND project_id = ?').bind(mid, id).first();
  if (!milestone) return c.json({ success: false, error: 'Milestone not found' }, 404);
  if (milestone.status === 'satisfied') return c.json({ success: false, error: 'Already satisfied' }, 400);

  await c.env.DB.prepare(`
    UPDATE project_milestones SET status = 'satisfied', satisfied_date = ?, evidence_keys = ?, notes = COALESCE(?, notes)
    WHERE id = ?
  `).bind(new Date().toISOString(), evidence_keys ? JSON.stringify(evidence_keys) : null, notes || null, mid).run();

  await fireCascade({
    event: 'ipp.milestone_satisfied',
    actor_id: user.id,
    entity_type: 'project_milestones',
    entity_id: mid,
    data: {
      project_id: id,
      project_name: project.project_name,
      milestone_name: milestone.milestone_name,
      milestone_type: milestone.milestone_type,
    },
    env: c.env,
  });

  return c.json({ success: true, data: { id: mid, status: 'satisfied' } });
});

// PUT /projects/:id — Update project
projects.put('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await c.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }
  if (existing.developer_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized to update this project' }, 403);
  }

  const { project_name, structure_type, technology, capacity_mw, status, location } = body;

  // Guard the two CHECK-constrained columns only when supplied (COALESCE keeps
  // the existing value otherwise) so a bad value returns 400, not a DB 500.
  const badStructure = badEnum('structure_type', structure_type, ['build_operate_transfer', 'build_own_operate', 'private_wire', 'direct_agreement']);
  if (badStructure) return c.json({ success: false, error: badStructure }, 400);
  const badStatus = badEnum('status', status, ['development', 'construction', 'commissioning', 'commercial_operations', 'decommissioned']);
  if (badStatus) return c.json({ success: false, error: badStatus }, 400);

  await c.env.DB.prepare(`
    UPDATE ipp_projects SET
      project_name = COALESCE(?, project_name),
      structure_type = COALESCE(?, structure_type),
      technology = COALESCE(?, technology),
      capacity_mw = COALESCE(?, capacity_mw),
      status = COALESCE(?, status),
      location = COALESCE(?, location),
      updated_at = ?
    WHERE id = ?
  `).bind(project_name, structure_type, technology, capacity_mw, status, location, new Date().toISOString(), id).run();

  const project = await c.env.DB.prepare('SELECT * FROM ipp_projects WHERE id = ?').bind(id).first();

  // Only fire `ipp.performance_reported` when fields that actually affect
  // generation / economics changed (capacity, status, technology). Plain
  // metadata edits fire the low-noise `ipp.project_updated` event instead so
  // we don't spam lenders with notifications on every rename.
  const fields = Object.keys(body);
  const performanceFields = new Set(['capacity_mw', 'status', 'technology']);
  const isPerformanceUpdate = fields.some((f) => performanceFields.has(f));

  await fireCascade({
    event: isPerformanceUpdate ? 'ipp.performance_reported' : 'ipp.project_updated',
    actor_id: user.id,
    entity_type: 'ipp_projects',
    entity_id: id,
    data: { fields, project_name: project?.project_name },
    env: c.env,
  });

  return c.json({ success: true, data: project });
});

// DELETE /projects/:id — Delete project
projects.delete('/:id', async (c) => {
  const user = getCurrentUser(c);
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT developer_id FROM ipp_projects WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }
  if (existing.developer_id !== user.id) {
    return c.json({ success: false, error: 'Not authorized to delete this project' }, 403);
  }

  await c.env.DB.prepare('DELETE FROM ipp_projects WHERE id = ?').bind(id).run();
  return c.json({ success: true, data: { message: 'Project deleted' } });
});

export default projects;
