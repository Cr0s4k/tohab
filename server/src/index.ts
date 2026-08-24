import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { ensureSchema } from './db.ts';
import { runPushReminders } from './pushScheduler.ts';
import { vapidKeys } from './pushService.ts';

const PORT = Number(process.env.PORT ?? 5178);

await ensureSchema();
await vapidKeys();
void runPushReminders().catch((error) => console.error('push reminder scan failed', error));
const pushTimer = setInterval(() => {
	void runPushReminders().catch((error) => console.error('push reminder scan failed', error));
}, 60_000);
pushTimer.unref();

const app = createApp();
serve({ fetch: app.fetch, port: PORT }, (info) => {
	console.log(`tohab sync server listening on http://localhost:${info.port}/sync`);
});
