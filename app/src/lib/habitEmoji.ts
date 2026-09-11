const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Keep one visible symbol, including modifiers, flags and joined emoji sequences. */
export function habitEmoji(value: string): string {
	return segmenter.segment(value.trim())[Symbol.iterator]().next().value?.segment ?? '';
}
