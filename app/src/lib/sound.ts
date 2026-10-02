import { browser } from '$app/env';
import { settings } from '#lib/settings.svelte.js';

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

function partial(
	context: AudioContext,
	out: AudioNode,
	type: OscillatorType,
	freq: number,
	at: number,
	duration: number,
	level: number
) {
	const osc = context.createOscillator();
	const gain = context.createGain();
	osc.type = type;
	osc.frequency.value = freq;
	gain.gain.setValueAtTime(0, at);
	gain.gain.linearRampToValueAtTime(level, at + 0.006);
	gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
	osc.connect(gain).connect(out);
	osc.start(at);
	osc.stop(at + duration);
}

function bell(context: AudioContext, out: AudioNode, freq: number, at: number, duration: number) {
	partial(context, out, 'sine', freq, at, duration, 0.3);
	partial(context, out, 'triangle', freq * 2, at, duration * 0.5, 0.075);
	partial(context, out, 'sine', freq * 3.01, at, duration * 0.28, 0.03);
}

export function playComplete() {
	if (!settings.sound) return;
	const context = audio();
	if (!context) return;
	const now = context.currentTime + 0.01;

	const master = context.createGain();
	master.gain.value = 0.9;
	const tone = context.createBiquadFilter();
	tone.type = 'lowpass';
	tone.frequency.value = 6000;
	tone.Q.value = 0.4;
	tone.connect(master).connect(context.destination);

	bell(context, tone, 587.33, now, 0.5);
	bell(context, tone, 880, now + 0.055, 0.6);
	bell(context, tone, 1174.66, now + 0.11, 1.1);
}
