type RetryAction = () => Promise<void> | void;

export const actionError = $state<{
	current: { message: string; retry?: RetryAction } | null;
	busy: boolean;
}>({ current: null, busy: false });

let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
	if (timer !== null) {
		clearTimeout(timer);
		timer = null;
	}
}

function messageFor(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return 'Could not save that change. Try again.';
}

export function clearActionError() {
	clearTimer();
	actionError.current = null;
	actionError.busy = false;
}

export function reportActionError(error: unknown, retry?: RetryAction) {
	clearTimer();
	actionError.busy = false;
	actionError.current = { message: messageFor(error), retry };
	timer = setTimeout(() => {
		timer = null;
		actionError.current = null;
	}, 7000);
}

export async function retryAction() {
	const action = actionError.current?.retry;
	if (!action || actionError.busy) return;
	actionError.busy = true;
	clearTimer();
	try {
		await action();
		clearActionError();
	} catch (error) {
		reportActionError(error, action);
	}
}
