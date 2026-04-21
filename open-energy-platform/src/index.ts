// Open Energy Platform — Main Entry Point
import { Hono } from 'hono';
import { corsMiddleware, securityHeaders, rateLimitMiddleware, requestLogger } from './middleware/security';
import { HonoEnv } from './utils/types';

// Route imports
import authRoutes from './routes/auth';
import participantsRoutes from './routes/participants';
import contractsRoutes from './routes/contracts';
import invoicesRoutes from './routes/invoices';
import projectsRoutes from './routes/projects';
import tradingRoutes from './routes/trading';
import settlementRoutes from './routes/settlement';
import carbonRoutes from './routes/carbon';
import esgRoutes from './routes/esg';
import gridRoutes from './routes/grid';
import procurementRoutes from './routes/procurement';
import intelligenceRoutes from './routes/intelligence';
import onaRoutes from './routes/ona';
import pipelineRoutes from './routes/pipeline';
import vaultRoutes from './routes/vault';
import threadsRoutes from './routes/threads';
import marketplaceRoutes from './routes/marketplace';
import adminRoutes from './routes/admin';

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

// Protected routes
app.route('/api/participants', participantsRoutes);
app.route('/api/contracts', contractsRoutes);
app.route('/api/invoices', invoicesRoutes);
app.route('/api/projects', projectsRoutes);
app.route('/api/trading', tradingRoutes);
app.route('/api/settlement', settlementRoutes);
app.route('/api/carbon', carbonRoutes);
app.route('/api/esg', esgRoutes);
app.route('/api/grid', gridRoutes);
app.route('/api/procurement', procurementRoutes);
app.route('/api/intelligence', intelligenceRoutes);
app.route('/api/ona', onaRoutes);
app.route('/api/pipeline', pipelineRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/threads', threadsRoutes);
app.route('/api/marketplace', marketplaceRoutes);
app.route('/api/admin', adminRoutes);

// SPA fallback - serve static files from R2
app.get('/*', async (c) => {
  const path = c.req.path;
  
  // Skip API routes
  if (path.startsWith('/api/')) {
    return c.text('API Not Found', 404);
  }

  // Determine the R2 key
  const key = path === '/' ? 'index.html' : path.slice(1);
  
  try {
    const asset = await c.env.R2.get(key);
    if (asset) {
      const contentType = key.endsWith('.html') ? 'text/html' :
                          key.endsWith('.js') ? 'application/javascript' :
                          key.endsWith('.css') ? 'text/css' : 'application/octet-stream';
      return c.body(asset.body, {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' }
      });
    }
  } catch (e) {
    console.error('R2 Error:', e);
    return c.json({ error: 'R2 Error', message: String(e) }, 500);
  }

  // Try index.html fallback for SPA routing
  try {
    const index = await c.env.R2.get('index.html');
    if (index) {
      return c.body(index.body, { 
        headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' } 
      });
    }
  } catch (e) {
    console.error('R2 index Error:', e);
  }

  return c.text('Frontend not deployed - R2 empty or error', 404);
});

// Error handling
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

app.notFound((c) => {
  return c.text('Not Found', 404);
});

export default app;
