import { subscribeSource, type RxBox, type RxSource } from './rx.ts';

/**
 * Bridges an RxDB/RxJS observable into a rune. `factory` re-runs whenever the reactive
 * values it reads change, so callers can express dependent queries inline.
 */
export function rx<T>(factory: () => RxSource<T>, initial: T) {
	let revision = $state(0);
	const box = $state<RxBox<T>>({
		value: initial,
		loading: true,
		error: null,
		retry: () => (revision += 1)
	});

	$effect(() => {
		// Reading the revision makes retry resubscribe even when the observable factory has
		// the same inputs as before.
		revision;
		return subscribeSource(factory(), box, initial);
	});

	return box;
}
