// ═══════════════════════════════════════════════════════════════════════════
// Unified O&M module — one mountable app that composes the formerly-scattered
// esums routers (telemetry/ingest, portal, projects, data-sources, solax,
// manufacturers, accruals, commissioning, intel, analysis) under a single
// `/api/om` namespace. The device model (utils/om-devices.ts) makes meters
// first-class and independent of solar (electricity/water/waste/gas/…).
//
// Additive: the legacy `/api/esums/*` mounts stay for backward compatibility;
// `/api/om/*` is the canonical home the SPA migrates to. This is the "one O&M
// module" entry point — the sub-routers keep their own logic, composed here.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import esumsCommissioningRoutes from './esums-commissioning';
import esumsOmRoutes from './esums-om';
import esumsOmIntelRoutes from './esums-om-intel';
import esumsOmAnalysisRoutes from './esums-om-analysis';
import esumsIngestRoutes from './esums-ingest';
import esumsDataSourcesRoutes from './esums-data-sources';
import esumsProjectsRoutes from './esums-projects';
import esumsOmSolaxRoutes from './esums-solax';
import esumsManufacturersRoutes from './esums-manufacturers';
import esumsAccrualsRoutes, { esumsInvoiceRoutes, esumsCreditRoutes } from './esums-accruals';

const om = new Hono<HonoEnv>();

// Same sub-paths as the legacy /api/esums/* mounts, now under one module.
om.route('/commissioning', esumsCommissioningRoutes);
om.route('/ingest', esumsIngestRoutes);
om.route('/', esumsOmRoutes);
om.route('/', esumsOmIntelRoutes);
om.route('/', esumsOmAnalysisRoutes);
om.route('/data-sources', esumsDataSourcesRoutes);
om.route('/projects', esumsProjectsRoutes);
om.route('/solax', esumsOmSolaxRoutes);
om.route('/manufacturers', esumsManufacturersRoutes);
om.route('/accruals', esumsAccrualsRoutes);
om.route('/settlement-invoices', esumsInvoiceRoutes);
om.route('/carbon-credits', esumsCreditRoutes);

export default om;
