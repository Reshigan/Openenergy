// ESG Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const esg = new Hono<HonoEnv>();
esg.use('*', authMiddleware);

// GET /esg/metrics - List ESG metrics
esg.get('/metrics', async (c) => {
  const metrics = await c.env.DB.prepare('SELECT * FROM esg_metrics ORDER BY category, metric_name').all();
  return c.json({ success: true, data: metrics.results || [] });
});

// GET /esg/data - Get user's ESG data
esg.get('/data', async (c) => {
  const user = getCurrentUser(c);
  const data = await c.env.DB.prepare(`
    SELECT ed.*, em.metric_name, em.category, em.unit 
    FROM esg_data ed 
    JOIN esg_metrics em ON ed.metric_id = em.id 
    WHERE ed.participant_id = ? 
    ORDER BY ed.reporting_period DESC
  `).bind(user.id).all();
  return c.json({ success: true, data: data.results || [] });
});

// POST /esg/data - Add ESG data
esg.post('/data', async (c) => {
  const user = getCurrentUser(c);
  const { metric_id, reporting_period, value, quality_evidence } = await c.req.json();
  
  const id = 'esgd_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO esg_data (id, participant_id, metric_id, reporting_period, value, quality_evidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, metric_id, reporting_period, value, quality_evidence, new Date().toISOString()).run();
  
  return c.json({ success: true, data: { id } }, 201);
});

// GET /esg/score - Get ESG score
esg.get('/score', async (c) => {
  const user = getCurrentUser(c);
  const scores = await c.env.DB.prepare(`
    SELECT * FROM esg_data 
    WHERE participant_id = ? AND metric_id LIKE 'esg_met_%' 
    ORDER BY reporting_period DESC LIMIT 12
  `).bind(user.id).all();
  
  // Calculate aggregate score
  const totalEmissions = (scores.results || []).reduce((sum: number, s: any) => sum + (s.value || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - (totalEmissions / 100)));
  
  return c.json({ success: true, data: { score: Math.round(score), totalEmissions, periods: scores.results?.length || 0 } });
});

// GET /esg/reports - List reports
esg.get('/reports', async (c) => {
  const user = getCurrentUser(c);
  const reports = await c.env.DB.prepare('SELECT * FROM esg_reports WHERE participant_id = ? ORDER BY created_at DESC').bind(user.id).all();
  return c.json({ success: true, data: reports.results || [] });
});

// POST /esg/reports - Create report
esg.post('/reports', async (c) => {
  const user = getCurrentUser(c);
  const { report_type, reporting_period } = await c.req.json();
  
  const id = 'esgr_' + Date.now().toString(36);
  await c.env.DB.prepare(`
    INSERT INTO esg_reports (id, participant_id, report_type, reporting_period, status, created_at)
    VALUES (?, ?, ?, ?, 'draft', ?)
  `).bind(id, user.id, report_type, reporting_period, new Date().toISOString()).run();
  
  await fireCascade({ event: 'esg.report_published', actor_id: user.id, entity_type: 'esg_reports', entity_id: id, data: { report_type, reporting_period }, env: c.env });
  
  return c.json({ success: true, data: { id } }, 201);
});

// GET /esg/decarbonisation - Get decarbonisation actions
esg.get('/decarbonisation', async (c) => {
  const user = getCurrentUser(c);
  const actions = await c.env.DB.prepare('SELECT * FROM decarb_actions WHERE participant_id = ? ORDER BY created_at DESC').bind(user.id).all();
  return c.json({ success: true, data: actions.results || [] });
});

export default esg;
