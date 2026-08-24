import { subscribeSource, type RxBox, type RxSource } from './rx.ts';

/**
 * Bridges an RxDB/RxJS observable into a rune. `factory` re-runs whenever the reactive
 * values it reads change, so callers can express dependent queries inline.
 */
export function rx<T>(factory: () => RxSource<T>, initial: T) {
	const box = $state<RxBox<T>>({ value: initial, loading: true, error: null });

	$effect(() => subscribeSource(factory(), box, initial));

	return box;
}
