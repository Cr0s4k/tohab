import { launchChrome } from './cdp.ts';
import assert from 'node:assert/strict';
const browser = await launchChrome({ port: 9375, profilePrefix: 'settings-review-' });
try {
 await browser.attachPage();
 await browser.navigate(process.env.APP ?? 'http://localhost:5173/');
 await browser.evaluate(`(async () => {
 const { mount } = await import('/node_modules/.vite/deps/svelte.js');
 const { default: SettingsSheet } = await import('/src/lib/components/SettingsSheet.svelte');
 document.body.innerHTML = '<main></main>';
 mount(SettingsSheet, { target: document.querySelector('main'), props: { open: true, onClose: () => {} } });
 })()`);
 await browser.waitFor(`document.querySelectorAll('summary').length === 6`);
 for (const [width,height,theme] of [[390,844,'light'],[1280,900,'light'],[320,740,'dark']] as const) {
  await browser.send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<500});
  await browser.evaluate(`document.documentElement.dataset.theme = '${theme}'`);
  await browser.evaluate(`document.querySelector('[role="dialog"]').scrollTop = 0`);
  assert.equal(await browser.evaluate(`document.querySelector('[role="dialog"]').scrollWidth > document.querySelector('[role="dialog"]').clientWidth`),false);
 }
 await browser.send('Emulation.setDeviceMetricsOverride', {width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await browser.evaluate(`document.querySelector('summary').focus()`);
 assert.equal(await browser.evaluate(`document.activeElement.tagName`), 'SUMMARY');
 await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
 await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
 await browser.waitFor(`!document.querySelector('details').open`, 5000, 'keyboard collapses preferences');
 assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('details button')).every(b => !b.checkVisibility())`), true);
 await browser.evaluate(`document.querySelector('[role="dialog"] button').focus()`);
 await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
 await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
 assert.equal(await browser.evaluate(`document.activeElement === Array.from(document.querySelectorAll('summary')).at(-1)`), true);
 await browser.send('Emulation.setDeviceMetricsOverride', {width:320,height:740,deviceScaleFactor:1,mobile:true});
 await browser.evaluate(`document.querySelectorAll('details').forEach(d => d.open = true)`);
 assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.trim() === 'Reset local data')`),true);
 assert.equal(await browser.evaluate(`document.querySelector('#settings-server-url').labels[0].textContent`),'Server URL');
 await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Dark').click()`);
 await browser.waitFor(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Dark').getAttribute('aria-pressed') === 'true'`);
 assert.equal(await browser.evaluate(`document.querySelector('[role="dialog"]').scrollWidth > document.querySelector('[role="dialog"]').clientWidth`),false);
 console.log('Settings sections, expanded mobile layout, field label, and theme control passed.');
} finally { browser.close(); }
