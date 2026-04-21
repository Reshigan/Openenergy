// ═══════════════════════════════════════════════════════════════════════════
// POPIA — Protection of Personal Information Act Compliance
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware } from '../middleware/auth';

const popia = new Hono<HonoEnv>();

popia.get('/consent', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const consent = await c.env.DB.prepare(`
    SELECT * FROM popia_consents WHERE participant_id = ?
  `).bind(participant.id).first();
  
  return c.json({ 
    success: true, 
    data: {
      marketing: consent?.marketing ?? false,
      data_sharing: consent?.data_sharing ?? false,
      third_party: consent?.third_party ?? false,
      updated_at: consent?.updated_at
    }
  });
});

popia.post('/consent', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const { marketing, data_sharing, third_party } = await c.req.json();
  
  await c.env.DB.prepare(`
    INSERT INTO popia_consents (participant_id, marketing, data_sharing, third_party, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(participant_id) DO UPDATE SET 
      marketing = ?, data_sharing = ?, third_party = ?, updated_at = ?
  `).bind(
    participant.id, marketing ?? false, data_sharing ?? false, third_party ?? false, new Date().toISOString(),
    marketing ?? false, data_sharing ?? false, third_party ?? false, new Date().toISOString()
  ).run();
  
  return c.json({ success: true, data: { message: 'Consent updated' } });
});

popia.get('/data-export', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const profile = await c.env.DB.prepare('SELECT * FROM participants WHERE id = ?').bind(participant.id).first();
  return c.json({ success: true, data: { participant, export_date: new Date().toISOString() } });
});

popia.post('/erasure', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const { reason, confirmation } = await c.req.json();
  
  if (!confirmation) {
    return c.json({ success: false, error: 'Please confirm the erasure request' }, 400);
  }
  
  const erasureId = 'era_' + Date.now().toString(36);
  
  await c.env.DB.prepare(`
    INSERT INTO popia_erasure_requests (id, participant_id, reason, status, requested_at)
    VALUES (?, ?, ?, 'pending', ?)
  `).bind(erasureId, participant.id, reason || 'User requested', new Date().toISOString()).run();
  
  return c.json({ success: true, data: { erasure_id: erasureId, message: 'Erasure request submitted' } });
});

popia.get('/rights', async (c) => {
  return c.json({
    success: true,
    data: {
      rights: [
        { id: 1, name: 'Right of Access', description: 'Request access to your personal information' },
        { id: 2, name: 'Right to Correction', description: 'Request correction of inaccurate information' },
        { id: 3, name: 'Right to Deletion', description: 'Request deletion of your personal information' },
        { id: 4, name: 'Right to Portability', description: 'Receive your data in a portable format' },
        { id: 5, name: 'Right to Object', description: 'Object to processing of your information' },
      ],
      contact: 'privacy@vantax.co.za',
      response_time: '30 days'
    }
  });
});

export default popia;
