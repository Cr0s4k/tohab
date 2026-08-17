export type UndoAction = {
	id: number;
	label: string;
	restore: () => Promise<void>;
};

export const undoState = $state<{ current: UndoAction | null }>({ current: null });

let sequence = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
	if (timer !== null) {
		clearTimeout(timer);
		timer = null;
	}
}

export function queueUndo(action: Omit<UndoAction, 'id'>) {
	clearTimer();
	sequence += 1;
	undoState.current = { ...action, id: sequence };
	timer = setTimeout(() => {
		timer = null;
		undoState.current = null;
	}, 2200);
}

export async function runUndo() {
	const action = undoState.current;
	if (!action) return;

	clearTimer();
	undoState.current = null;
	await action.restore();
}
