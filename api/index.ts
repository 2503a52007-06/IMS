import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app.ts';

let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // Normalize req.url when rewritten via vercel.json (?__path=...)
    const rawUrl = req.url || '/';
    const urlObj = new URL(rawUrl, 'http://localhost');
    const rewrittenPath = urlObj.searchParams.get('__path');
    if (rewrittenPath !== null) {
      urlObj.searchParams.delete('__path');
      const cleanPath = rewrittenPath.replace(/^\/+/, '');
      const qs = urlObj.searchParams.toString();
      req.url = `/api/${cleanPath}${qs ? `?${qs}` : ''}`;
    }

    if (!appPromise) {
      appPromise = createApp();
    }
    const app = await appPromise;
    return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
  } catch (err) {
    console.error('Vercel API handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal server error.',
      })
    );
  }
}
