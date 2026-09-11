/** Run against the Vite dev server; uses an isolated browser profile. */
import assert from 'node:assert/strict';
import { launchChrome } from './cdp.ts';

const browser = await launchChrome({ port: 9366, profilePrefix: 'tohab-habit-emoji-' });
const { evaluate, waitFor } = browser;
const click = (text: string) => evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(text)})).click()`);
const value = () => evaluate('window.emojiInput.value');
const insert = (text: string) => browser.send('Input.insertText', { text });
const select = () => evaluate('window.emojiInput.focus(); window.emojiInput.select()');
try {
	await browser.attachPage();
	await browser.navigate(`${process.env.APP ?? 'http://localhost:5173'}/habits`);
	await waitFor("document.querySelector('form')");
	await evaluate(`(async () => {
		document.body.innerHTML = '';
		const { mount } = await import('/node_modules/svelte/src/index-client.js');
		const { default: Editor } = await import('/src/lib/components/HabitEditor.svelte');
		mount(Editor, { target: document.body, props: { open: true, onClose: () => {} } });
		const name = document.querySelector('input[placeholder="Habit name"]');
		name.value = 'Emoji test'; name.dispatchEvent(new Event('input', { bubbles: true }));
		document.querySelector('details').open = true;
	})()`);
	await click('Browse icons');
	await waitFor('document.querySelector(\'input[placeholder="Paste an emoji"]\')');
	await evaluate('window.emojiInput = document.querySelector(\'input[placeholder="Paste an emoji"]\'); window.emojiInput.focus()');
	assert.equal(await evaluate('window.emojiInput.hasAttribute("maxlength")'), false);
	await insert('💪');
	await insert('📖');
	assert.equal(await value(), '💪', 'additional typing is truncated in the DOM');
	await select();
	await insert('👩🏽‍💻');
	assert.equal(await value(), '👩🏽‍💻', 'selection replacement preserves the complete emoji');
	await select();
	await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
	await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
	assert.equal(await value(), '');
	assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Use").disabled'), true);
	// Simulate the browser's post-paste input event, including a sequence above the old cap.
	const emoji = '👩🏿‍❤️‍💋‍👨🏻';
	await evaluate(`window.emojiInput.value = ${JSON.stringify(` ${emoji}📖 `)};
		window.emojiInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }))`);
	assert.equal(await value(), emoji);
	await evaluate(`window.emojiInput.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		window.emojiInput.value = '👨‍👩‍👧‍👦💪';
		window.emojiInput.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));`);
	assert.equal(await value(), '👨‍👩‍👧‍👦💪', 'composition remains editable until committed');
	await evaluate(`window.emojiInput.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));`);
	assert.equal(await value(), '👨‍👩‍👧‍👦');
	await select();
	await insert(emoji);
	// Insertion at the start retains the caret after the inserted grapheme.
	await evaluate('window.emojiInput.setSelectionRange(0, 0)');
	await insert('❤️');
	assert.equal(await value(), '❤️');
	assert.equal(await evaluate('window.emojiInput.selectionStart'), '❤️'.length);
	await select();
	await insert(emoji);
	await click('Use');
	await click('Create habit');
	await waitFor(`(async () => {
		const { getDb } = await import('/src/lib/db/lazy.ts');
		return (await (await getDb()).habits.find().exec()).some(h => h.name === 'Emoji test' && h.emoji === ${JSON.stringify(emoji)});
	})()`);
	console.log('Habit emoji browser passed: typing, paste, replacement, deletion, composition, caret and saving.');
} finally {
	browser.close();
}
