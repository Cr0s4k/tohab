import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

// Run against the Vite dev server: APP=http://localhost:5173 node test/undo-position.test.ts
const app = process.env.APP ?? 'http://localhost:5173';
const browser = await launchChrome({ port: 9358, profilePrefix: 'tohab-undo-position-' });
const visibleUndo = `Array.from(document.querySelectorAll('[role="status"] button')).find(
	button => button.textContent.includes('Undo') && button.getBoundingClientRect().height > 0
)`;

try {
	await browser.attachPage();
	await browser.send('Emulation.setEmulatedMedia', {
		features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
	});
	await browser.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `localStorage.setItem('tohab.session', JSON.stringify({
			userId: 'undo-position-test', email: 'undo-position@example.test'
		}));`
	});
	const cases = [
		{ width: 320, height: 568, bottom: 0, side: 0, font: 16 },
		{ width: 390, height: 844, bottom: 34, side: 0, font: 16 },
		{ width: 390, height: 844, bottom: 34, side: 0, font: 24 },
		{ width: 667, height: 375, bottom: 21, side: 44, font: 16 },
		{ width: 767, height: 844, bottom: 34, side: 0, font: 16 },
		{ width: 768, height: 1024, bottom: 0, side: 0, font: 16 },
		{ width: 1280, height: 844, bottom: 0, side: 0, font: 16 }
	];
	for (const route of ['/tasks?view=today', '/habits', '/habits/undo-position-test']) {
		await browser.navigate(`${app}${route}`);
		await browser.waitFor('document.querySelector("aside")', 20_000, 'app database booted');
		for (const viewport of cases) {
			const { width, height, bottom, side, font } = viewport;
			const mobile = width < 768;
			const hasBottomNav = mobile && !route.startsWith('/habits/');
			const label = `${route} ${width}x${height}, inset ${bottom}, font ${font}`;
			await browser.send('Emulation.setDeviceMetricsOverride', {
				width, height, deviceScaleFactor: 1, mobile
			});
			await browser.send('Emulation.setSafeAreaInsetsOverride', {
				insets: { top: 0, bottom, left: side, right: side }
			});
			await browser.evaluate(`(async () => {
				document.documentElement.style.fontSize = '${font}px';
				const { undoState } = await import('/src/lib/undo.svelte.ts');
				window.undoRestored = false;
				undoState.current = {
					id: 1,
					label: 'Deleted TaskWithAnUnbrokenNameThatNeedsToStayInsideTheViewport',
					restore: async () => { window.undoRestored = true; }
				};
			})()`);
			await browser.waitFor(visibleUndo);
			const bounds = await browser.evaluate<{
				top: number; bottom: number; left: number; right: number;
				navTop: number | null; clickable: boolean; overflow: boolean;
			}>(`(() => {
				const button = ${visibleUndo};
				const rect = button.getBoundingClientRect();
				const nav = Array.from(document.querySelectorAll('nav')).find(
					element => element.style.viewTransitionName === 'tabbar' || element.style.viewTransitionName === 'habitnav'
				);
				return {
					top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
					navTop: nav?.getBoundingClientRect().top ?? null,
					clickable: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
					overflow: button.scrollWidth > button.clientWidth
				};
			})()`);
			assert.ok(bounds.top >= 0 && bounds.bottom <= height, `${label}: undo fits vertically`);
			assert.ok(bounds.left >= side && bounds.right <= width - side, `${label}: undo fits horizontally`);
			assert.ok(bounds.clickable, `${label}: undo is unobstructed`);
			assert.equal(bounds.overflow, false, `${label}: long label stays inside undo`);
			if (hasBottomNav) {
				assert.notEqual(bounds.navTop, null, `${label}: navigation exists`);
				assert.ok(bounds.navTop! - bounds.bottom >= 12, `${label}: clear gap above navigation`);
			} else if (mobile) {
				assert.ok(height - bounds.bottom >= bottom + font - 1, `${label}: undo clears home indicator`);
			}
			if (process.env.SCREENSHOT_DIR && route === '/tasks?view=today') {
				const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
				writeFileSync(`${process.env.SCREENSHOT_DIR}/undo-${width}-${font}.png`, Buffer.from(shot.data, 'base64'));
			}
			await browser.evaluate(`(${visibleUndo}).click()`);
			assert.equal(await browser.evaluate('window.undoRestored'), true, `${label}: undo restores action`);
			await browser.waitFor(`!(${visibleUndo})`);
		}
	}
	console.log('Undo placement passed: mobile navigation, safe areas, landscape, larger text, desktop, and restore.');
} finally {
	browser.close();
}
