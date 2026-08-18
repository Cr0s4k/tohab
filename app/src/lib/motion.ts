import { browser } from '$app/environment';
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

export const EASE = cubicOut;

export function motionOk(): boolean {
	return browser && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ms(duration: number): number {
	return motionOk() ? duration : 0;
}

export const flipCfg = {
	duration: (distance: number) => ms(Math.min(340, 40 + Math.sqrt(distance) * 22)),
	easing: EASE
};

type Options = { duration?: number };

/** Collapses a list row's own box so neighbours slide into the gap. */
export function collapse(node: Element, { duration = 240 }: Options = {}): TransitionConfig {
	const style = getComputedStyle(node);
	const height = parseFloat(style.height);
	const paddingTop = parseFloat(style.paddingTop);
	const paddingBottom = parseFloat(style.paddingBottom);
	const marginTop = parseFloat(style.marginTop);
	const marginBottom = parseFloat(style.marginBottom);

	return {
		duration: ms(duration),
		easing: EASE,
		css: (t) => `
			height: ${t * height}px;
			padding-top: ${t * paddingTop}px;
			padding-bottom: ${t * paddingBottom}px;
			margin-top: ${t * marginTop}px;
			margin-bottom: ${t * marginBottom}px;
			opacity: ${t};
			overflow: hidden;
		`
	};
}

/** Slides up from the bottom on phones; on desktop the same panel is a centred dialog. */
export function sheet(_node: Element, { duration = 260 }: Options = {}): TransitionConfig {
	if (browser && matchMedia('(min-width: 768px)').matches) {
		return {
			duration: ms(200),
			easing: EASE,
			css: (t, u) => `transform: translateY(${u * 10}px) scale(${1 - u * 0.02}); opacity: ${t}`
		};
	}
	return {
		duration: ms(duration),
		easing: EASE,
		css: (_t, u) => `transform: translateY(${u * 100}%)`
	};
}

export function veil(_node: Element, { duration = 180 }: Options = {}): TransitionConfig {
	return {
		duration: ms(duration),
		easing: EASE,
		css: (t) => `opacity: ${t}`
	};
}

export function pop(_node: Element, { duration = 220 }: Options = {}): TransitionConfig {
	return {
		duration: ms(duration),
		easing: EASE,
		css: (t, u) => `transform: scale(${1 - u * 0.4}); opacity: ${t}`
	};
}
