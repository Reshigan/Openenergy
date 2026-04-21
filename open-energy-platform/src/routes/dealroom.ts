// ═══════════════════════════════════════════════════════════════════════════
// Deal Room — Negotiation, Proposals, Terms Editing, and Diff Tracking
// ═══════════════════════════════════════════════════════════════════════════

import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const dealroom = new Hono<HonoEnv>();

// GET /dealroom/:contractId — Get deal room for contract
dealroom.get('/:contractId', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const { contractId } = c.req.param();
  
  const contract = await c.env.DB.prepare(`
    SELECT c.*, p1.name as creator_name, p2.name as counterparty_name
    FROM contract_documents c
    JOIN participants p1 ON c.creator_id = p1.id
    JOIN participants p2 ON c.counterparty_id = p2.id
    WHERE c.id = ?
  `).bind(contractId).first();
  
  if (!contract) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }
  
  // Check access
  if (participant.role !== 'admin' && contract.creator_id !== participant.id && contract.counterparty_id !== participant.id) {
    return c.json({ success: false, error: 'Access denied' }, 403);
  }
  
  const proposals = await c.env.DB.prepare(`
    SELECT p.*, par.name as proposer_name
    FROM deal_proposals p
    JOIN participants par ON p.proposer_id = par.id
    WHERE p.contract_id = ?
    ORDER BY p.created_at DESC
  `).bind(contractId).all();
  
  const messages = await c.env.DB.prepare(`
    SELECT m.*, par.name as sender_name
    FROM deal_messages m
    JOIN participants par ON m.sender_id = par.id
    WHERE m.contract_id = ?
    ORDER BY m.created_at ASC
  `).bind(contractId).all();
  
  return c.json({ 
    success: true, 
    data: { 
      contract, 
      proposals: proposals.results || [], 
      messages: messages.results || [] 
    } 
  });
});

// POST /dealroom/:contractId/propose — Propose terms
dealroom.post('/:contractId/propose', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const { contractId } = c.req.param();
  const body = await c.req.json();
  const { terms, commentary } = body;
  
  if (!terms) {
    return c.json({ success: false, error: 'Terms required' }, 400);
  }
  
  const contract = await c.env.DB.prepare('SELECT * FROM contract_documents WHERE id = ?').bind(contractId).first();
  if (!contract) {
    return c.json({ success: false, error: 'Contract not found' }, 404);
  }
  
  const proposalId = 'prop_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO deal_proposals (id, contract_id, proposer_id, terms, commentary, version)
    VALUES (?, ?, ?, ?, ?, 1)
  `).bind(proposalId, contractId, participant.id, JSON.stringify(terms), commentary || '').run();
  
  await fireCascade({
    event: 'dealroom.proposed',
    actor_id: participant.id,
    entity_type: 'deal_proposals',
    entity_id: proposalId,
    data: { contract_id: contractId },
    env: c.env,
  });
  
  return c.json({ success: true, data: { proposal_id: proposalId } });
});

// POST /dealroom/:contractId/accept — Accept latest proposal
dealroom.post('/:contractId/accept', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const { contractId } = c.req.param();
  
  const latestProposal = await c.env.DB.prepare(`
    SELECT * FROM deal_proposals WHERE contract_id = ? ORDER BY created_at DESC LIMIT 1
  `).bind(contractId).first();
  
  if (!latestProposal) {
    return c.json({ success: false, error: 'No proposals to accept' }, 400);
  }
  
  // Update contract with accepted terms
  await c.env.DB.prepare(`
    UPDATE contract_documents SET commercial_terms = ?, updated_at = ? WHERE id = ?
  `).bind(latestProposal.terms, new Date().toISOString(), contractId).run();
  
  // Advance contract phase
  const currentPhase = await c.env.DB.prepare('SELECT phase FROM contract_documents WHERE id = ?').bind(contractId).first();
  const nextPhase = advancePhase(currentPhase?.phase);
  
  await c.env.DB.prepare('UPDATE contract_documents SET phase = ? WHERE id = ?').bind(nextPhase, contractId).run();
  
  await fireCascade({
    event: 'dealroom.accepted',
    actor_id: participant.id,
    entity_type: 'contract_documents',
    entity_id: contractId,
    data: { proposal_id: latestProposal.id, new_phase: nextPhase },
    env: c.env,
  });
  
  return c.json({ success: true, data: { new_phase: nextPhase } });
});

// POST /dealroom/:contractId/message — Send message
dealroom.post('/:contractId/message', authMiddleware(), async (c) => {
  const participant = c.get('participant');
  const { contractId } = c.req.param();
  const body = await c.req.json();
  const { content, message_type } = body;
  
  if (!content) {
    return c.json({ success: false, error: 'Message content required' }, 400);
  }
  
  const messageId = 'msg_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  
  await c.env.DB.prepare(`
    INSERT INTO deal_messages (id, contract_id, sender_id, content, message_type)
    VALUES (?, ?, ?, ?, ?)
  `).bind(messageId, contractId, participant.id, content, message_type || 'text').run();
  
  return c.json({ success: true, data: { message_id: messageId } });
});

// GET /dealroom/:contractId/diff — Get diff between versions
dealroom.get('/:contractId/diff', authMiddleware(), async (c) => {
  const { contractId } = c.req.param();
  const { v1, v2 } = c.req.query();
  
  const proposal1 = await c.env.DB.prepare('SELECT * FROM deal_proposals WHERE id = ?').bind(v1).first();
  const proposal2 = await c.env.DB.prepare('SELECT * FROM deal_proposals WHERE id = ?').bind(v2).first();
  
  if (!proposal1 || !proposal2) {
    return c.json({ success: false, error: 'Proposals not found' }, 404);
  }
  
  // Simple diff - in production would use proper diff algorithm
  const terms1 = JSON.parse(proposal1.terms);
  const terms2 = JSON.parse(proposal2.terms);
  
  return c.json({ 
    success: true, 
    data: { 
      v1: { id: v1, terms: terms1, created_at: proposal1.created_at },
      v2: { id: v2, terms: terms2, created_at: proposal2.created_at },
      changes: computeDiff(terms1, terms2)
    } 
  });
});

function advancePhase(current: string): string {
  const phases = ['draft', 'loi', 'term_sheet', 'hoa', 'draft_agreement', 'legal_review', 'statutory_check', 'execution'];
  const idx = phases.indexOf(current);
  return idx < phases.length - 1 ? phases[idx + 1] : current;
}

function computeDiff(terms1: any, terms2: any): any[] {
  const changes: any[] = [];
  const allKeys = [...new Set([...Object.keys(terms1), ...Object.keys(terms2)])];
  
  for (const key of allKeys) {
    if (JSON.stringify(terms1[key]) !== JSON.stringify(terms2[key])) {
      changes.push({ field: key, old: terms1[key], new: terms2[key] });
    }
  }
  
  return changes;
}

export default dealroom;
