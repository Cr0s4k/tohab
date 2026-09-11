import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9359, profilePrefix: 'tohab-list-scroll-' });
try {
	await browser.attachPage();
	await browser.send('Emulation.setDeviceMetricsOverride', {
		width: 390, height: 844, deviceScaleFactor: 1, mobile: true
	});
	await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
	await browser.send('Page.navigate', { url: process.env.APP ?? 'http://localhost:5173/' });
	await browser.waitFor("document.querySelector('form') && document.readyState === 'complete'");
	const fixture = readFileSync(new URL('./task-hardening.html', import.meta.url), 'utf8');
	const script = fixture.match(/<script type="module">([\s\S]*?)<\/script>/)![1]
		.replace("import '../src/app.css';", "await import('/src/app.css');")
		.replace("import { mount } from 'svelte';", "const { mount } = await import('/node_modules/svelte/src/index-client.js');")
		.replace(/import (\w+) from '\.\.\/src\/([^']+)';/g, "const { default: $1 } = await import('/src/$2');");
	await browser.evaluate(`(async () => {
		document.body.innerHTML = '';
		delete Navigator.prototype.vibrate;
		${script}
		window.mountLongRows();
	})()`);
	await browser.waitFor('document.querySelector("[aria-label^=Log] input[switch]")');
	await browser.evaluate(`(() => {
		const task = document.querySelector('[role=group]');
		const habit = document.querySelector('[aria-label^=Log]').closest('.pressable');
		task.id = 'task-row';
		habit.id = 'habit-row';
		window.activations = 0;
		for (const row of [task, habit]) {
			row.addEventListener('click', event => {
				event.preventDefault();
				window.activations++;
			});
		}
		const main = document.createElement('main');
		main.style.cssText = 'height:600px;overflow-y:auto';
		const top = document.createElement('div');
		top.style.height = '200px';
		const bottom = document.createElement('div');
		bottom.style.height = '1800px';
		main.append(top, task, habit, bottom);
		document.body.prepend(main);
		window.scroller = main;
		window.lastScrollAt = performance.now();
		main.addEventListener('scroll', () => { window.lastScrollAt = performance.now(); });
	})()`);

	await browser.send('DOM.enable');
	await browser.send('CSS.enable');
	const { root } = await browser.send('DOM.getDocument');
	async function forceState(selector: string, forcedPseudoClasses: string[]) {
		const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
		await browser.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses });
	}
	async function point(selector: string) {
		return browser.evaluate<{ x: number; y: number }>(`(() => {
			const rect = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
			return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
		})()`);
	}

	// Force sticky pseudo-classes as well as sending real touch input: browsers differ
	// in when they release :active / emulated :hover after handing a gesture to scrolling.
	for (const kind of ['task', 'habit']) {
		const row = `#${kind}-row`;
		const check = `${row} button.tap`;
		const body = kind === 'task' ? `${row} button.text-left` : `${row} a.text-left`;
		for (const target of [body, `${check} input[switch]`]) {
			await browser.waitFor('performance.now() - window.lastScrollAt > 150');
			await browser.evaluate(`(async () => {
				window.scroller.scrollTop = 0;
				// Deliver the reset's scroll event before beginning the next gesture.
				await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
			})()`);
			const start = await point(target);
			await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
			await forceState(row, ['active']);
			await forceState(check, ['active', 'hover']);
			await browser.waitFor(`getComputedStyle(document.querySelector('${row}')).backgroundColor !== getComputedStyle(document.body).backgroundColor`);
			if (kind === 'task') {
				assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('${check} svg')).opacity`), '0', 'touch contact never previews a check');
			}
			for (let step = 1; step <= 8; step++) {
				await browser.send('Input.dispatchTouchEvent', {
					type: 'touchMove', touchPoints: [{ x: start.x, y: start.y - step * 10 }]
				});
			}
			await browser.waitFor('window.scroller.scrollTop > 0');
			await browser.waitFor(`getComputedStyle(document.querySelector('${row}')).backgroundColor === getComputedStyle(document.body).backgroundColor`);
			await browser.waitFor(`getComputedStyle(document.querySelector('${check}')).opacity === '1' && getComputedStyle(document.querySelector('${check}')).transform === 'none'`);
			await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			assert.equal(await browser.evaluate('window.activations'), 0, `${kind} scroll from ${target} does not activate`);
			// Include late ordinary clicks and zero-detail clicks from the iOS overlay.
			for (const detail of [0, 1]) {
				await browser.evaluate(`document.querySelector('${check} input').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: ${detail} }))`);
			}
			assert.equal(await browser.evaluate('window.activations'), 0, `${kind} ignores forwarded clicks after scroll`);
			assert.equal(await browser.evaluate(`document.querySelector('${check} input').checked`), false, 'cancelled click does not toggle the haptic switch');
			await forceState(row, []);
			await forceState(check, []);
		}
		// A fresh genuine tap must clear cancellation and activate exactly once.
		await browser.waitFor('performance.now() - window.lastScrollAt > 150');
		const tap = await point(`${check} input`);
		await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tap] });
		await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await browser.waitFor('window.activations === 1');
		await browser.evaluate('window.activations = 0');
	}

	await browser.send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await browser.send('Emulation.setDeviceMetricsOverride', {
		width: 1280, height: 844, deviceScaleFactor: 1, mobile: false
	});
	await forceState('#task-row button.tap', ['hover']);
	await browser.waitFor("getComputedStyle(document.querySelector('#task-row .task-check__tick')).opacity === '1'");
	await browser.evaluate(`(() => {
		const button = document.querySelector('#task-row button.tap');
		button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
		window.scroller.dispatchEvent(new Event('scroll'));
		button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
	})()`);
	await browser.waitFor("getComputedStyle(document.querySelector('#task-row .task-check__tick')).opacity === '0'");
	await browser.evaluate("document.querySelector('#task-row button.tap').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }))");
	await browser.waitFor("getComputedStyle(document.querySelector('#task-row .task-check__tick')).opacity === '1'");
	await forceState('#task-row button.tap', []);
	await browser.evaluate("document.querySelector('#task-row button.tap').setAttribute('aria-checked', 'true')");
	await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
	await browser.waitFor("getComputedStyle(document.querySelector('#task-row .task-check__tick')).opacity === '1'");
	assert.deepEqual(await browser.evaluate('window.actions'), { complete: 1, delete: 0 });
	console.log('Task and habit list scroll assertions passed');
} finally {
	browser.close();
}
