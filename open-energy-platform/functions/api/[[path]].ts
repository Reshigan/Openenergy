// Pages Functions catch-all for API — wraps the Hono app defined in src/index.ts
// Invoked for every /api/* request at oe.vantax.co.za.
import app from "../../src/index";

export const onRequest: PagesFunction<any> = (ctx) =>
  app.fetch(ctx.request, ctx.env as any, ctx);
