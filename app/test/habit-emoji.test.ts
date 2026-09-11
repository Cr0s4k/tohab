import assert from 'node:assert/strict';
import { habitEmoji } from '../src/lib/habitEmoji.ts';

for (const emoji of [
	'💪', '❤️', '✍️', '👍🏽', '👩🏽‍💻', '👨‍👩‍👧‍👦', '👩🏿‍❤️‍💋‍👨🏻',
	'🇪🇸', '1️⃣', '🏳️‍🌈', '🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}',
	'e\u0301', '字', 'a'
]) {
	assert.equal(habitEmoji(emoji), emoji);
	assert.equal(habitEmoji(`${emoji}💪extra`), emoji);
	assert.equal(habitEmoji(` \n${emoji} 💪 `), emoji);
}
assert.equal(habitEmoji(''), '');
assert.equal(habitEmoji(' \n\t '), '');
assert.equal(habitEmoji('abc'), 'a');
assert.equal(habitEmoji('🇪🇸🇫🇷'), '🇪🇸');
// A joiner being typed must survive until the next part of the sequence arrives.
assert.equal(habitEmoji('👩🏽‍'), '👩🏽‍');
console.log('Habit emoji passed: graphemes, modifiers, joiners, flags, keycaps and whitespace.');
