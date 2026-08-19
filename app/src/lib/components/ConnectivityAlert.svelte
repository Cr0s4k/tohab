<script lang="ts">
	import { veil } from '$lib/motion';

	type ConnectivityAlert = {
		kind: 'online' | 'offline';
		message: string;
	};

	let alert = $state<ConnectivityAlert | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function clearTimer() {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	}

	function announce(kind: ConnectivityAlert['kind']) {
		clearTimer();
		alert =
			kind === 'offline'
				? { kind, message: 'You are offline. Changes will sync when you reconnect.' }
				: { kind, message: 'You are back online.' };

		timer = setTimeout(() => {
			timer = null;
			alert = null;
		}, kind === 'offline' ? 4000 : 2400);
	}

	$effect(() => {
		if (!navigator.onLine) announce('offline');

		const online = () => announce('online');
		const offline = () => announce('offline');

		window.addEventListener('online', online);
		window.addEventListener('offline', offline);

		return () => {
			clearTimer();
			window.removeEventListener('online', online);
			window.removeEventListener('offline', offline);
		};
	});
</script>

{#if alert}
	<div
		class="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.6rem)] z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2"
		role="status"
		aria-live="polite"
		transition:veil
	>
		<div
			class="raised hairline flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-lg"
		>
			<span
				class="size-2.5 shrink-0 rounded-full"
				class:animate-pulse={alert.kind === 'offline'}
				style="background: {alert.kind === 'online' ? 'var(--positive)' : 'var(--danger)'}"
			></span>
			<span class="text-sm">{alert.message}</span>
		</div>
	</div>
{/if}
