import type { Observable } from 'rxjs';

export type RxSource<T> = Observable<T> | null | undefined;

export type RxBox<T> = {
	value: T;
	loading: boolean;
	error: Error | null;
	retry?: () => void;
};

export function subscribeSource<T>(source: RxSource<T>, box: RxBox<T>, initial: T) {
	box.value = initial;
	box.error = null;
	if (!source) {
		box.loading = false;
		return;
	}

	box.loading = true;
	const subscription = source.subscribe({
		next(value) {
			box.value = value;
			box.loading = false;
		},
		error(error) {
			box.error = error instanceof Error ? error : new Error(String(error));
			box.loading = false;
		}
	});
	return () => subscription.unsubscribe();
}
