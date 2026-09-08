import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { launchChrome } from './cdp.ts';
const browser = await launchChrome({ port: 9348, profilePrefix: 'tohab-polish-' });
try {
 await browser.attachPage();
 await browser.send('Page.navigate', { url: 'http://localhost:5173/' });
 await browser.waitFor("document.querySelector('form') && document.readyState === 'complete'");
 const fixture = readFileSync(new URL('./task-hardening.html', import.meta.url), 'utf8');
 const script = fixture.match(/<script type="module">([\s\S]*?)<\/script>/)![1]
  .replace("import '../src/app.css';", "await import('/src/app.css');")
  .replace("import { mount } from 'svelte';", "const { mount } = await import('/node_modules/svelte/src/index-client.js');")
  .replace(/import (\w+) from '\.\.\/src\/([^']+)';/g, "const { default: $1 } = await import('/src/$2');");
 await browser.evaluate(`(async () => { document.body.innerHTML=''; ${script}; window.mountLongRows(); })()`);
 for (const width of [390, 1280]) for (const theme of ['light', 'dark']) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
  await browser.evaluate(`document.documentElement.dataset.theme='${theme}'`);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await browser.evaluate(`(() => {
   const project = document.querySelector('[title="ProjectWithAnUnbrokenNameThatNeedsToStayInsideTheViewport"]');
   return project.getBoundingClientRect().right <= innerWidth;
  })()`), true, 'Long project metadata stays inside viewport');
  assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector('[href="/habits/rest"]').closest('.group')).opacity`), '1', 'Rest-day text retains full contrast');
  const shot = await browser.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`/private/tmp/tohab-polish-${width}-${theme}.png`, Buffer.from(shot.data, 'base64'));
 }
 console.log('Captured mobile/desktop light/dark component fixtures in /private/tmp/tohab-polish-*.png');
} finally { browser.close(); }
