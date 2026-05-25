// ═══════════════════════════════════════════════════════════════════════════
// Projects Routes — IPP Project CRUD operations
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

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

// POST /projects — Create new project
projects.post('/', async (c) => {
  const user = getCurrentUser(c);
  const body = await c.req.json();

  const { project_name, structure_type, technology, capacity_mw, location, grid_connection_point, ppa_volume_mwh, ppa_price_per_mwh, ppa_duration_years, construction_start_date, commercial_operation_date } = body;

  if (!project_name || !structure_type || !technology || !capacity_mw || !location) {
    return c.json({ success: false, error: 'Missing required fields: project_name, structure_type, technology, capacity_mw, location' }, 400);
  }

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
