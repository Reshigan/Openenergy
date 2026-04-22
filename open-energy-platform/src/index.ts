// Open Energy Platform — Main Entry Point
import { Hono } from 'hono';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger } from './middleware/security';
import { HonoEnv } from './utils/types';

// Route imports
import authRoutes from './routes/auth';
import ssoRoutes from './routes/sso';
import cockpitRoutes from './routes/cockpit';
import participantsRoutes from './routes/participants';
import contractsRoutes from './routes/contracts';
import invoicesRoutes from './routes/invoices';
import projectsRoutes from './routes/projects';
import tradingRoutes from './routes/trading';
import settlementRoutes from './routes/settlement';
import carbonRoutes from './routes/carbon';
import esgRoutes from './routes/esg';
import esgReportsRoutes from './routes/esg-reports';
import gridRoutes from './routes/grid';
import procurementRoutes from './routes/procurement';
import dealroomRoutes from './routes/dealroom';
import modulesRoutes from './routes/modules';
import popiaRoutes from './routes/popia';
import intelligenceRoutes from './routes/intelligence';
import briefingRoutes from './routes/briefing';
import meteringRoutes from './routes/metering';
import onaRoutes from './routes/ona';
import pipelineRoutes from './routes/pipeline';
import vaultRoutes from './routes/vault';
import threadsRoutes from './routes/threads';
import marketplaceRoutes from './routes/marketplace';
import adminRoutes from './routes/admin';
import supportRoutes from './routes/support';
import aiRoutes from './routes/ai';
import loiRoutes from './routes/lois';
import funderRoutes from './routes/funder';
import regulatorRoutes from './routes/regulator';

const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', securityHeaders);
app.use('*', corsMiddleware);
app.use('*', rateLimitMiddleware);
app.use('*', requestLogger);

// Health check
app.get('/api/health', (c) => c.json({ status: 'healthy', version: '1.0.0' }));

// Auth routes
app.route('/api/auth', authRoutes);
app.route('/api/auth/sso', ssoRoutes);
app.route('/api/cockpit', cockpitRoutes);

// Protected routes
app.route('/api/participants', participantsRoutes);
app.route('/api/contracts', contractsRoutes);
app.route('/api/invoices', invoicesRoutes);
app.route('/api/projects', projectsRoutes);
app.route('/api/trading', tradingRoutes);
app.route('/api/settlement', settlementRoutes);
app.route('/api/carbon', carbonRoutes);
app.route('/api/esg', esgRoutes);
app.route('/api/esg-reports', esgReportsRoutes);
app.route('/api/grid', gridRoutes);
app.route('/api/procurement', procurementRoutes);
app.route('/api/dealroom', dealroomRoutes);
app.route('/api/modules', modulesRoutes);
app.route('/api/popia', popiaRoutes);
app.route('/api/intelligence', intelligenceRoutes);
app.route('/api/briefing', briefingRoutes);
app.route('/api/metering', meteringRoutes);
app.route('/api/ona', onaRoutes);
app.route('/api/pipeline', pipelineRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/threads', threadsRoutes);
app.route('/api/marketplace', marketplaceRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/support', supportRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/lois', loiRoutes);
app.route('/api/funder', funderRoutes);
app.route('/api/regulator', regulatorRoutes);

// Static assets (SPA shell, JS, CSS, images) are served by Cloudflare Pages directly.
// This Worker / Pages Function only handles API routes under /api/*.

// Error handling
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

app.notFound((c) => {
  return c.text('Not Found', 404);
});

export default app;
