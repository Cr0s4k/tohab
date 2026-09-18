<script lang="ts">
	import { haptic, hapticTap } from '$lib/haptics';
	import { setSound, setStartOfWeek, setTheme, settings, type Theme } from '$lib/settings.svelte';
	const themes: { id: Theme; label: string }[] = [
		{ id: 'system', label: 'System' },
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	];

</script>

<section>
	<h3 class="mb-3 text-sm font-semibold">Appearance</h3>
	<div class="flex gap-1.5">
		{#each themes as theme (theme.id)}
			<button
				type="button"
				use:hapticTap
				onclick={() => {
					haptic('tap');
					setTheme(theme.id);
				}}
				aria-pressed={settings.theme === theme.id}
				class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium"
				class:accent-bg={settings.theme === theme.id}
				class:sunken={settings.theme !== theme.id}
			>
				{theme.label}
			</button>
		{/each}
	</div>

	<h3 class="mt-6 mb-3 text-sm font-semibold">Week starts on</h3>
	<div class="flex gap-1.5">
		{#each [{ id: 1, label: 'Monday' }, { id: 0, label: 'Sunday' }] as option (option.id)}
			<button
				type="button"
				onclick={() => setStartOfWeek(option.id as 0 | 1)}
				aria-pressed={settings.startOfWeek === option.id}
				class="tap min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium"
				class:accent-bg={settings.startOfWeek === option.id}
				class:sunken={settings.startOfWeek !== option.id}
			>
				{option.label}
			</button>
		{/each}
	</div>

	<div class="raised hairline mt-6 rounded-2xl border">
		<label class="flex items-center justify-between gap-3 px-4 py-3">
			<span class="text-sm">Sound on complete</span>
			<input
				type="checkbox"
				checked={settings.sound}
				onchange={(event) => setSound(event.currentTarget.checked)}
				class="size-5 accent-current"
			/>
		</label>
	</div>
</section>
