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
 // A diagonal start must stay a scroll even if it later moves far sideways.
 for (const points of [[[188,111],[60,125]], [[197,120],[60,140]], [[180,100]]]) {
  await browser.evaluate(`(() => {
   const row = document.querySelector('[role="group"]');
   row.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, pointerType:'touch', clientX:200, clientY:100}));
   const points = ${JSON.stringify(points)};
   for (const [x,y] of points) row.dispatchEvent(new PointerEvent('pointermove', {bubbles:true, pointerType:'touch', clientX:x, clientY:y}));
   const [x,y] = points.at(-1);
   row.dispatchEvent(new PointerEvent('pointerup', {bubbles:true, pointerType:'touch', clientX:x, clientY:y}));
   row.querySelector('[role="checkbox"]').dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, detail:1}));
  })()`);
  assert.deepEqual(await browser.evaluate('window.actions'), { complete: 1, delete: 0 });
 }
 // Exercise the iOS overlay path even though Chromium normally supports vibrate.
 await browser.evaluate(`(() => { delete Navigator.prototype.vibrate; window.mountLongRows(); })()`);
 await browser.waitFor('document.querySelector("button label input")');
 await browser.evaluate(`(() => {
  const button = document.querySelector('[aria-label="Log Read a few pages before bed"]');
  window.habitClicks = 0;
  button.addEventListener('click', () => window.habitClicks++);
  window.habitButton = button;
 })()`);
 for (const end of ['pointerup', 'pointercancel']) {
 for (const detail of [0, 1]) {
  await browser.evaluate(`(() => {
   const input = window.habitButton.querySelector('input');
   for (const [type,y] of [['pointerdown',100],['pointermove',140],['${end}',140]])
    input.dispatchEvent(new PointerEvent(type, {bubbles:true, pointerType:'touch', clientX:200, clientY:y}));
   input.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, detail:${detail}}));
  })()`);
  assert.equal(await browser.evaluate('window.habitClicks'), 0);
 }
 }
 await browser.evaluate(`(() => {
  const input = window.habitButton.querySelector('input');
  for (const type of ['pointerdown','pointerup']) input.dispatchEvent(new PointerEvent(type, {bubbles:true, pointerType:'touch', clientX:200, clientY:100}));
  input.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, detail:1}));
 })()`);
 assert.equal(await browser.evaluate('window.habitClicks'), 1, 'tap forwards exactly once');
 await browser.evaluate('window.habitButton.click()');
 assert.equal(await browser.evaluate('window.habitClicks'), 2, 'non-pointer activation remains available');
 assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('[aria-pressed="true"]')).some(e => e.textContent.trim() === 'Work')`), true);
 // Native touch scrolling starting directly on the habit's haptic input.
 await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
 await browser.evaluate(`(() => {
  const main = document.createElement('main');
  main.style.cssText = 'height:600px;overflow-y:auto';
  const row = window.habitButton.closest('.surface');
  const spacer = document.createElement('div');
  spacer.style.height = '1800px';
  main.append(row, spacer);
  document.body.prepend(main);
  window.scrollTest = main;
 })()`);
 const point = await browser.evaluate<{x:number;y:number}>(`(() => {
  const rect = window.habitButton.getBoundingClientRect();
  return {x:rect.x+rect.width/2,y:rect.y+rect.height/2};
 })()`);
 await browser.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[point] });
 for (let step = 1; step <= 6; step++) {
  await browser.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:point.x-step*2,y:point.y-step*4}] });
 }
 await browser.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
 await browser.waitFor('window.scrollTest.scrollTop > 0');
 assert.equal(await browser.evaluate('window.habitClicks'), 2, 'native scroll does not log habit');
 // Ordinary editor controls use the same app-wide guard, including actual scroll events
 // that occur with less than the movement threshold or after pointer cancellation.
 await browser.evaluate(`(async () => {
  const { mount, createRawSnippet } = await import('/node_modules/svelte/src/index-client.js');
  const { default: Sheet } = await import('/src/lib/components/Sheet.svelte');
  window.sheetClicks = 0;
  mount(Sheet, {target:document.body, props:{open:true, title:'Scroll regression', onClose:()=>window.sheetClicks++, children:createRawSnippet(() => ({render:()=>'<div style="height:1800px">Scrollable editor content</div>'}))}});
 })()`);
 await browser.waitFor('document.querySelector("[role=dialog]")');
 for (const gesture of ['move', 'scroll', 'cancel']) {
  await browser.evaluate(`(() => {
   const pane = document.querySelector('[role=dialog]');
   const button = pane.querySelector('button');
   button.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,pointerType:'touch',clientX:200,clientY:100}));
   if ('${gesture}' === 'move') button.dispatchEvent(new PointerEvent('pointermove', {bubbles:true,pointerType:'touch',clientX:200,clientY:130}));
   if ('${gesture}' === 'scroll') pane.dispatchEvent(new Event('scroll'));
   button.dispatchEvent(new PointerEvent('${gesture}' === 'cancel' ? 'pointercancel' : 'pointerup', {bubbles:true,pointerType:'touch',clientX:200,clientY:100}));
   button.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,detail:1}));
  })()`);
  assert.equal(await browser.evaluate('window.sheetClicks'), 0, `${gesture} does not activate editor button`);
 }
 await browser.evaluate(`(() => {
  const button = document.querySelector('[role=dialog] button');
  button.dispatchEvent(new KeyboardEvent('keydown', {bubbles:true,key:'Enter'}));
  button.click();
 })()`);
 assert.equal(await browser.evaluate('window.sheetClicks'), 1, 'keyboard works immediately after scrolling');
 await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
 await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
 await browser.evaluate(`document.querySelector('[aria-label="Edit Gesture test"]').focus()`);
 await new Promise(resolve => setTimeout(resolve, 250));
 assert.equal(await browser.evaluate(`getComputedStyle(document.activeElement).opacity`), '1');
 console.log('Task hardening browser assertions passed');
} finally {
 browser.close();
}
