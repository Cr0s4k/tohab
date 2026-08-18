import { browser } from '$app/environment';
import { settings } from '$lib/settings.svelte';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
	if (!browser) return null;
	const Ctor =
		window.AudioContext ??
		(window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	ctx ??= new Ctor();
	if (ctx.state === 'suspended') ctx.resume();
	return ctx;
}

function blip(context: AudioContext, freq: number, at: number, duration: number) {
	const osc = context.createOscillator();
	const gain = context.createGain();
	osc.type = 'sine';
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(0, at);
	gain.gain.linearRampToValueAtTime(0.12, at + 0.008);
	gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
	osc.connect(gain).connect(context.destination);
	osc.start(at);
	osc.stop(at + duration);
}

export function playComplete() {
	if (!settings.sound) return;
	const context = audio();
	if (!context) return;
	const now = context.currentTime;
	blip(context, 784, now, 0.09);
	blip(context, 1175, now + 0.07, 0.14);
}
