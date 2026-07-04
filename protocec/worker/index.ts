// Serves the built SPA and proxies /api/* to the live CEC backend, so every
// call the prototype makes is same-origin — no CORS hop, no security.ts change.
// ponytail: hardcoded upstream; it's one prototype pointing at one backend.

const UPSTREAM = 'https://cec.vantax.co.za';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      const target = UPSTREAM + url.pathname + url.search;
      const proxied = new Request(target, req);
      proxied.headers.set('host', new URL(UPSTREAM).host);
      return fetch(proxied);
    }
    return env.ASSETS.fetch(req);
  },
};
