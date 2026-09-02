/**
 * Verifies a cold launch paints against an origin that accepts the connection and then never
 * answers. This is the case offline emulation cannot reach: nothing fails, so a network-first
 * document waits for the browser's own timeout and the user watches a white screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './cdp.ts';

const BUILD = fileURLToPath(new URL('../build', import.meta.url));
const ORIGIN_PORT = 5181;
const APP = `http://localhost:${ORIGIN_PORT}`;
const TYPES: Record<string, string> = {
	'.css': 'text/css',
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain',
	'.webmanifest': 'application/manifest+json'
};

const sockets = new Set<Socket>();

function track(server: Server) {
	server.on('connection', (socket) => sockets.add(socket.on('close', () => sockets.delete(socket))));
	return server;
}

function listen(server: Server) {
	return new Promise<Server>((resolve, reject) => {
		track(server).listen(ORIGIN_PORT, '127.0.0.1', () => resolve(server)).on('error', reject);
	});
}

function shutdown(server: Server) {
	return new Promise<void>((resolve) => {
		for (const socket of sockets) socket.destroy();
		server.closeAllConnections();
		server.close(() => resolve());
		setTimeout(resolve, 2_000).unref();
	});
}

const staticServer = await listen(
	createServer((request, response) => {
		const path = normalize(decodeURIComponent(new URL(request.url ?? '/', APP).pathname)).replace(/^(\.\.[/\\])+/, '');
		let file = join(BUILD, path);
		let body: Buffer;
		try {
			body = readFileSync(file);
		} catch {
			file = join(BUILD, 'index.html');
			body = readFileSync(file);
		}
		response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
		response.end(body);
	})
);

const browser = await launchChrome({ port: 9336, profilePrefix: 'tohab-liefi-chrome-' });
const { attachPage, close, evaluate, navigate, send, waitFor } = browser;
let blackHole: Server | undefined;

/** Bounded per attempt: an evaluation against an uncommitted document never answers at all. */
async function bounded(expression: string, timeout: number) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const answered = await Promise.race([
			evaluate<boolean>(`Boolean(${expression})`).catch(() => false),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), 500))
		]);
		if (answered) return true;
	}
	return false;
}

try {
	await attachPage();
	await navigate(`${APP}/tasks`);
	await evaluate(`navigator.serviceWorker.ready.then(() => true)`);
	await waitFor(`navigator.serviceWorker.controller`, 20_000, 'service worker to control the clean install');
	assert.equal(await evaluate(`caches.match('/').then(Boolean)`), true, 'shell is precached');

	// A pending navigation leaves the previous page on screen, which would read as a successful
	// launch; the blank page is what the user actually stares at on a cold start.
	await navigate('about:blank');
	await shutdown(staticServer);
	blackHole = await listen(createServer(() => {}));

	// A page whose document is still in flight answers neither the navigation nor an evaluation,
	// so every step here is bounded rather than awaited.
	const started = Date.now();
	void send('Page.navigate', { url: `${APP}/progress` }).catch(() => {});
	const painted = await bounded(`document.body.innerText.includes('Password')`, 8_000);
	const elapsed = Date.now() - started;
	assert.ok(painted, `launch paints the app shell without waiting on the network (gave up after ${elapsed}ms)`);
	assert.equal(await bounded(`!!navigator.serviceWorker.controller`, 2_000), true, 'the launch stays service-worker controlled');
	console.log(`ok lie-fi cold launch in ${elapsed}ms`);
} finally {
	for (const socket of sockets) socket.destroy();
	if (blackHole) await shutdown(blackHole);
	else await shutdown(staticServer);
	close();
}
