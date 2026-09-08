import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9347, profilePrefix: 'tohab-hardening-' });
try {
 await browser.attachPage();
 await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
 await browser.send('Page.navigate', { url: process.env.APP ?? 'http://localhost:5173/' });
 await browser.waitFor("document.querySelector('form') && document.readyState === 'complete'");
 const fixture = readFileSync(new URL('./task-hardening.html', import.meta.url), 'utf8');
 const script = fixture.match(/<script type="module">([\s\S]*?)<\/script>/)![1]
  .replace("import '../src/app.css';", "await import('/src/app.css');")
  .replace("import { mount } from 'svelte';", "const { mount } = await import('/node_modules/svelte/src/index-client.js');")
  .replace(/import (\w+) from '\.\.\/src\/([^']+)';/g, "const { default: $1 } = await import('/src/$2');");
 await browser.evaluate(`(async () => { document.body.innerHTML = ''; ${script} })()`);
 await browser.waitFor('window.ready');
 for (const direction of [-120, 120]) {
  const result = await browser.evaluate(`(() => {
   const row = document.querySelector('[role="group"]');
   for (const [type, x] of [['pointerdown',200], ['pointermove',200+${direction}], ['pointercancel',200+${direction}]])
    row.dispatchEvent(new PointerEvent(type, { bubbles:true, pointerType:'touch', clientX:x, clientY:100 }));
   return window.actions;
  })()`);
  assert.deepEqual(result, { complete: 0, delete: 0 });
 }
 await browser.evaluate(`(() => {
  const row = document.querySelector('[role="group"]');
  for (const [type,x] of [['pointerdown',200],['pointermove',320],['pointerup',320]])
   row.dispatchEvent(new PointerEvent(type, { bubbles:true, pointerType:'touch', clientX:x, clientY:100 }));
 })()`);
 assert.deepEqual(await browser.evaluate('window.actions'), { complete: 1, delete: 0 });
 assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('[aria-pressed="true"]')).some(e => e.textContent.trim() === 'Work')`), true);
 await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
 await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
 await browser.evaluate(`document.querySelector('[aria-label="Edit Gesture test"]').focus()`);
 await new Promise(resolve => setTimeout(resolve, 250));
 assert.equal(await browser.evaluate(`getComputedStyle(document.activeElement).opacity`), '1');
 console.log('Task hardening browser assertions passed');
} finally {
 browser.close();
}
