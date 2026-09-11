import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9367, profilePrefix: 'tohab-interact-' });
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
 const row = 'document.querySelector("[role=group]")';
 async function mouseSwipe(distance: number, blur = false) {
  const p = await browser.evaluate<{x:number;y:number}>(`(() => {const r=${row}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await browser.send('Input.dispatchMouseEvent', {type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});
  await browser.send('Input.dispatchMouseEvent', {type:'mouseMoved',x:p.x+distance/2,y:p.y,buttons:1});
  // Continue and release outside the row: Interact must retain the drag.
  await browser.send('Input.dispatchMouseEvent', {type:'mouseMoved',x:p.x+distance,y:p.y+150,buttons:1});
  if (blur) await browser.evaluate("window.dispatchEvent(new Event('blur'))");
  await browser.send('Input.dispatchMouseEvent', {type:'mouseReleased',x:p.x+distance,y:p.y+150,button:'left',buttons:0,clickCount:1});
  await browser.evaluate('new Promise(r=>setTimeout(r,260))');
 }
 await mouseSwipe(140, true);
 assert.deepEqual(await browser.evaluate('window.actions'), {complete:0,delete:0}, 'focus loss cancels an armed drag');
 await mouseSwipe(140);
 assert.deepEqual(await browser.evaluate('window.actions'), {complete:1,delete:0}, 'release outside the row completes once');
 await mouseSwipe(-140);
 assert.deepEqual(await browser.evaluate('window.actions'), {complete:1,delete:1}, 'left drag deletes once');
 // Real touch input exercises the browser's pointer cancellation and touch-action path.
 await browser.send('Emulation.setTouchEmulationEnabled', {enabled:true});
 const p = await browser.evaluate<{x:number;y:number}>(`(() => {const r=${row}.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await browser.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
 for (const dx of [20,50,90,140]) await browser.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+dx,y:p.y}]});
 await browser.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.deepEqual(await browser.evaluate('window.actions'), {complete:2,delete:1}, 'native touch completes once');
 await browser.send('Emulation.setTouchEmulationEnabled', {enabled:false});
 await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await mouseSwipe(140);
 assert.deepEqual(await browser.evaluate('window.actions'), {complete:2,delete:1}, 'desktop retains normal mouse behavior');
 await browser.evaluate(`(async()=>{
  const {mount}=await import('/node_modules/svelte/src/index-client.js');
  const {default:Fab}=await import('/src/lib/components/Fab.svelte');
  delete Navigator.prototype.vibrate;
  window.fabPresses=0;
  mount(Fab,{target:document.body,props:{label:'Gesture FAB',onPress:()=>window.fabPresses++}});
 })()`);
 await browser.waitFor(`document.querySelector('[aria-label="Gesture FAB"] input[switch]')`);
 for (const end of ['pointerup','pointercancel']) {
  await browser.evaluate(`(()=>{
   const input=document.querySelector('[aria-label="Gesture FAB"] input[switch]');
   for (const [type,x] of [['pointerdown',100],['pointermove',140],['${end}',140]]) input.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',clientX:x,clientY:100}));
   input.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:0}));
  })()`);
  assert.equal(await browser.evaluate('window.fabPresses'),0, 'dragged or cancelled haptic overlay must not open capture');
 }
 await browser.evaluate(`(()=>{const b=document.querySelector('[aria-label="Gesture FAB"]'); b.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter'}));b.click()})()`);
 assert.equal(await browser.evaluate('window.fabPresses'),1,'keyboard activation remains available');
 console.log('Interact gesture browser assertions passed');
} finally { browser.close(); }
