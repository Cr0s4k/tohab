<script lang="ts">
	import { auth, login, refreshRegistrationState, register } from '$lib/auth.svelte';
	import { haptic } from '$lib/haptics';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	const creating = $derived(auth.registrationOpen === true);

	refreshRegistrationState();

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		error = '';
		try {
			if (creating) await register(email, password);
			else await login(email, password);
			haptic('tap');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong';
		} finally {
			busy = false;
		}
	}
</script>

<form onsubmit={submit} class="flex h-full flex-col justify-center px-6 pb-16">
	<h1 class="mb-1 text-2xl font-semibold">Tohab</h1>
	<p class="dim mb-6 text-sm">
		{creating
			? 'Create the account this server belongs to.'
			: 'Sign in to sync your tasks and habits.'}
	</p>

	<div class="raised hairline rounded-2xl border">
		<label class="hairline block border-b px-4 py-3">
			<span class="dim mb-1.5 block text-[0.7rem]">Email</span>
			<input
				bind:value={email}
				type="email"
				autocomplete="username"
				inputmode="email"
				required
				class="sunken w-full rounded-xl px-3 py-2 text-sm outline-none"
			/>
		</label>
		<label class="block px-4 py-3">
			<span class="dim mb-1.5 block text-[0.7rem]">Password</span>
			<input
				bind:value={password}
				type="password"
				autocomplete={creating ? 'new-password' : 'current-password'}
				minlength={8}
				required
				class="sunken w-full rounded-xl px-3 py-2 text-sm outline-none"
			/>
		</label>
	</div>

	{#if error}
		<p class="mt-3 text-sm" style="color: var(--accent)">{error}</p>
	{/if}

	<button
		type="submit"
		disabled={busy}
		class="tap accent-bg mt-4 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
	>
		{busy ? 'Working…' : creating ? 'Create account' : 'Sign in'}
	</button>

	{#if auth.registrationOpen === null}
		<p class="dim mt-4 text-[0.7rem]">
			Could not reach the server. Check the connection and try again.
		</p>
	{/if}
</form>
