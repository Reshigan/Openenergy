// ═══════════════════════════════════════════════════════════════════════════
// Webhook Engine — extracted from cascade.ts.
// Delivers outbound webhook POSTs for each cascade event to any registered
// endpoints stored in KV under the 'webhooks' key.
// ═══════════════════════════════════════════════════════════════════════════

interface WebhookCtx {
  event: string;
  entity_type: string;
  entity_id: string;
  data?: Record<string, unknown>;
  env: any;
}

export async function deliverWebhooks(ctx: WebhookCtx): Promise<void> {
  // Get all webhook endpoints for this event type
  const webhooks = await ctx.env.KV.get('webhooks', 'json') as Record<string, string[]> || {};
  const endpoints = webhooks[ctx.event] || [];

  for (const url of endpoints) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OE-Event': ctx.event },
        body: JSON.stringify({
          event: ctx.event,
          entity_type: ctx.entity_type,
          entity_id: ctx.entity_id,
          data: ctx.data,
          timestamp: new Date().toISOString()
        })
      });
    } catch (err) {
      console.error(`Webhook delivery failed to ${url}:`, err);
    }
  }
}
