import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type CdpMessage = {
	id?: number;
	method?: string;
	params?: any;
	result?: any;
	error?: { message?: string };
};

type ChromeOptions = {
	port: number;
	profilePrefix: string;
	windowSize?: string;
	onEvent?: (message: CdpMessage) => void;
};

export async function launchChrome(options: ChromeOptions) {
	const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
	const profile = mkdtempSync(join(tmpdir(), options.profilePrefix));
	const args = [
		'--headless=new',
		`--remote-debugging-port=${options.port}`,
		`--user-data-dir=${profile}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-gpu',
		...(options.windowSize ? [`--window-size=${options.windowSize}`] : []),
		'about:blank'
	];
	const chrome = spawn(chromePath, args, { stdio: 'ignore' });
	const ws = new WebSocket(await debuggerUrl(options.port));
	await new Promise<void>((resolve, reject) => {
		ws.addEventListener('open', () => resolve(), { once: true });
		ws.addEventListener('error', reject, { once: true });
	});

	let nextId = 1;
	let sessionId: string | undefined;
	const waiting = new Map<number, (message: CdpMessage) => void>();
	ws.addEventListener('message', (event) => {
		const message = JSON.parse(String(event.data)) as CdpMessage;
		if (message.id && waiting.has(message.id)) {
			waiting.get(message.id)!(message);
			waiting.delete(message.id);
			return;
		}
		options.onEvent?.(message);
	});

	function send<T = any>(method: string, params: Record<string, unknown> = {}, useSession = true): Promise<T> {
		const id = nextId++;
		return new Promise((resolve, reject) => {
			waiting.set(id, (message) => message.error
				? reject(new Error(`${method}: ${message.error.message}`))
				: resolve(message.result as T));
			ws.send(JSON.stringify({ id, method, params, ...(useSession && sessionId ? { sessionId } : {}) }));
		});
	}

	async function attachPage(url = 'about:blank') {
		const { targetId } = await send<{ targetId: string }>('Target.createTarget', { url }, false);
		({ sessionId } = await send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }, false));
		await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable')]);
	}

	async function evaluate<T>(expression: string): Promise<T> {
		const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
		if (result.exceptionDetails) {
			throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
		}
		return result.result.value as T;
	}

	async function waitFor(expression: string, timeout = 8_000, label = expression) {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			try {
				if (await evaluate<boolean>(`Boolean(${expression})`)) return true;
			} catch {
				// Page may be navigating.
			}
			await delay(150);
		}
		const seen = await evaluate<string>('document.body.innerText').catch(() => '<unavailable>');
		throw new Error(`timed out waiting for: ${label}\n        page showed: ${JSON.stringify(seen)}`);
	}

	async function navigate(url: string, timeout = 15_000) {
		await send('Page.navigate', { url });
		await waitFor(`document.readyState === 'complete'`, timeout, `navigation to ${url}`);
	}

	function close() {
		ws.close();
		stopChrome(chrome, profile);
	}

	return { send, attachPage, evaluate, waitFor, navigate, close };
}

async function debuggerUrl(port: number): Promise<string> {
	for (let attempt = 0; attempt < 80; attempt++) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/json/version`);
			const data = (await response.json()) as { webSocketDebuggerUrl?: string };
			if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
		} catch {
			// Chrome is starting.
		}
		await delay(250);
	}
	throw new Error('Chrome did not expose a debugging endpoint');
}

function stopChrome(chrome: ChildProcess, profile: string) {
	chrome.kill();
	try {
		rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
	} catch {
		// Chrome may still be releasing the profile.
	}
}

function delay(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
