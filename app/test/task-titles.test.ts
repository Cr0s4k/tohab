import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

// Run against the app's dev server: APP=http://localhost:5173 node test/task-titles.test.ts
const app = process.env.APP ?? 'http://localhost:5173';
const browser = await launchChrome({ port: 9351, profilePrefix: 'tohab-task-titles-' });

try {
	await browser.attachPage();
	for (const width of [320, 390, 768, 1280]) {
		await browser.send('Emulation.setDeviceMetricsOverride', {
			width,
			height: 844,
			deviceScaleFactor: 1,
			mobile: width < 768
		});
		await browser.send('Emulation.setTouchEmulationEnabled', { enabled: width < 768 });
		for (const view of ['inbox', 'today', 'upcoming']) {
			await browser.navigate(`${app}/tasks?view=${view}`);
			await browser.waitFor("document.querySelector('form')");
			// Mount the real route with its real URL state, without an account or sync server.
			await browser.evaluate(`(async () => {
				const { mount } = await import('/node_modules/svelte/src/index-client.js');
				const { default: Tasks } = await import('/src/routes/tasks/+page.svelte');
				document.body.innerHTML = '<div class="app-shell flex"><div id="fixture" class="relative mx-auto flex min-w-0 w-full max-w-lg flex-col overflow-hidden md:max-w-none"></div></div>';
				mount(Tasks, { target: document.querySelector('#fixture') });
			})()`);
			await browser.waitFor("document.querySelector('header h1')");
			await browser.evaluate(`(() => {
				const spacer = document.createElement('div');
				spacer.style.height = '2000px';
				document.querySelector('main').append(spacer);
			})()`);
			for (const fontSize of [16, 24]) {
				await browser.evaluate(`document.documentElement.style.fontSize = '${fontSize}px'`);
				for (const scrollTop of [0, 200, 0]) {
					await browser.evaluate(`document.querySelector('main').scrollTop = ${scrollTop}`);
					await browser.waitFor(
						`getComputedStyle(document.querySelector('header [aria-hidden="true"]')).opacity === '${scrollTop ? 1 : 0}'`
					);
					const layout = await browser.evaluate<{
						title: string;
						fontSize: number;
						expandedFontSize: number;
						titleLeft: number;
						titleRight: number;
						titleWidth: number;
						titleScrollWidth: number;
						center: number;
						headerCenter: number;
						availableSide: number;
						actionsWidth: number;
						buttons: { left: number; right: number; width: number; height: number }[];
						overflow: boolean;
					}>(`(() => {
						const heading = document.querySelector('header h1');
						const title = ${scrollTop ? 'document.querySelector(\'header [aria-hidden="true"]\')' : 'heading'};
						const rect = title.getBoundingClientRect();
						const header = document.querySelector('header .measure').getBoundingClientRect();
						const buttons = [...document.querySelectorAll('header button')]
							.filter(button => button.getBoundingClientRect().width > 0)
							.map(button => { const r = button.getBoundingClientRect(); return {left:r.left, right:r.right, width:r.width, height:r.height}; });
						return {
							title: heading.textContent.trim(), fontSize: parseFloat(getComputedStyle(title).fontSize),
							expandedFontSize: parseFloat(getComputedStyle(heading).fontSize),
							titleLeft: rect.left, titleRight: rect.right, titleWidth: title.clientWidth, titleScrollWidth: title.scrollWidth,
							center: (rect.left + rect.right) / 2, headerCenter: (header.left + header.right) / 2,
							availableSide: (header.width - rect.width) / 2 - 24,
							actionsWidth: buttons.at(-1).right - buttons[0].left, buttons,
							overflow: document.documentElement.scrollWidth > innerWidth
						};
					})()`);
					const label = `${view}, ${width}px, ${fontSize}px text, scroll ${scrollTop}`;
					assert.equal(layout.title.toLowerCase(), view, label);
					assert.equal(layout.overflow, false, `No page overflow: ${label}`);
					assert.ok(
						layout.titleRight + 7 <= layout.buttons[0].left,
						`Title clears actions: ${label}`
					);
					assert.ok(layout.titleLeft >= 0, `Title stays in viewport: ${label}`);
					assert.equal(
						layout.buttons.length,
						width < 768 ? 3 : 1,
						`Actions remain visible: ${label}`
					);
					for (const [index, button] of layout.buttons.entries()) {
						assert.ok(button.width >= (width < 768 ? 44 : 32), `Buttons retain width: ${label}`);
						assert.ok(button.height >= (width < 768 ? 44 : 32), `Buttons retain height: ${label}`);
						assert.ok(button.right <= width, `Actions stay in viewport: ${label}`);
						if (index)
							assert.ok(
								button.left >= layout.buttons[index - 1].right + 7,
								`Actions stay separated: ${label}`
							);
					}
					if (scrollTop) {
						assert.ok(
							layout.fontSize < layout.expandedFontSize,
							`Scrolled title shrinks: ${label}`
						);
						if (layout.availableSide >= layout.actionsWidth) {
							assert.ok(
								Math.abs(layout.center - layout.headerCenter) <= 1,
								`Title is centered when space allows: ${label}`
							);
						}
						if (fontSize === 16)
							assert.ok(
								layout.titleScrollWidth <= layout.titleWidth,
								`Full compact title fits: ${label}`
							);
						if (view === 'upcoming' && fontSize === 16) {
							const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
							writeFileSync(
								`/private/tmp/tohab-task-title-${width}.png`,
								Buffer.from(shot.data, 'base64')
							);
						}
					}
				}
			}
		}
	}
	console.log(
		'Task title browser assertions passed (3 views, 4 widths, normal/enlarged text, scroll and return).'
	);
} finally {
	browser.close();
}
