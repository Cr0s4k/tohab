// Browser chrome lives outside the DOM, so composite sheet veils into its color.
const veils = new Map<Element, number>();

export function syncThemeColor() {
	const surface = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
	if (!/^#[\da-f]{6}$/i.test(surface)) return;
	const transmission = [...veils.values()].reduce((value, opacity) => value * (1 - opacity), 1);
	const color = '#' + [1, 3, 5].map((offset) =>
		Math.round(parseInt(surface.slice(offset, offset + 2), 16) * transmission).toString(16).padStart(2, '0')
	).join('');
	for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
		meta.content = color;
	}
}

export function setThemeVeil(node: Element, opacity: number) {
	if (!veils.has(node)) return;
	veils.set(node, opacity);
	syncThemeColor();
}

export function themeVeil(node: HTMLElement) {
	// Mounts without an intro transition still need the fully dimmed color.
	veils.set(node, 0.45);
	syncThemeColor();
	return {
		destroy() {
			veils.delete(node);
			syncThemeColor();
		}
	};
}
