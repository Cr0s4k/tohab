import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuthRoutes } from './routes/auth.ts';
import { createCalendarRoutes } from './routes/calendar.ts';
import { createPushRoutes } from './routes/push.ts';
import { createSyncRoutes } from './routes/sync.ts';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
	.split(',')
	.map((origin) => origin.trim())
	.filter(Boolean);

export function createApp() {
	const app = new Hono();
	app.use(
		'*',
		cors({
			origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : null),
			allowHeaders: ['content-type'],
			allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
			credentials: true
		})
	);
	app.route('/auth', createAuthRoutes());
	app.route('/sync', createSyncRoutes());
	app.route('/calendar', createCalendarRoutes());
	app.route('/push', createPushRoutes());
	app.get('/', (c) => c.text('tohab sync server'));
	return app;
}
