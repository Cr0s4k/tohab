import type { Observable } from 'rxjs';

type Source<T> = Observable<T> | null | undefined;

/**
 * Bridges an RxDB/RxJS observable into a rune. `factory` re-runs whenever the reactive
 * values it reads change, so callers can express dependent queries inline.
 */
export function rx<T>(factory: () => Source<T>, initial: T) {
	const box = $state({ value: initial, loading: true });

	$effect(() => {
		const source = factory();
		if (!source) {
			box.loading = false;
			return;
		}
		box.loading = true;
		const sub = source.subscribe({
			next: (v) => {
				box.value = v;
				box.loading = false;
			},
			error: () => {
				box.loading = false;
			}
		});
		return () => sub.unsubscribe();
	});

	return box;
}
