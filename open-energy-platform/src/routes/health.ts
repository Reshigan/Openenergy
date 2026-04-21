// Health Routes
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';

const health = new Hono<HonoEnv>();

health.get('/', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: 'production',
    },
  });
});

export default health;
