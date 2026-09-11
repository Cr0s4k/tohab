<script lang="ts">
	import { HABIT_COLORS } from '$lib/habits';
	import { haptic } from '$lib/haptics';
	import { habitEmoji } from '$lib/habitEmoji';
	import Sheet from '../Sheet.svelte';

	let { name = $bindable(), emoji = $bindable(), color = $bindable() }: {
		name: string; emoji: string; color: string;
	} = $props();

	const colorNames = [
		'Coral', 'Amber', 'Green', 'Teal', 'Blue', 'Purple',
		'Cyan', 'Indigo', 'Pink', 'Gold', 'Mint', 'Slate'
	];

	type IconOption = { emoji: string; label: string; keywords: string };
	type IconGroup = { label: string; icons: IconOption[] };

	const iconGroups: IconGroup[] = [
		{
			label: 'Health & movement',
			icons: [
				{ emoji: '💪', label: 'Strength', keywords: 'workout exercise gym' },
				{ emoji: '🏃', label: 'Running', keywords: 'run exercise cardio' },
				{ emoji: '🚴', label: 'Cycling', keywords: 'bike exercise cardio' },
				{ emoji: '🏋️', label: 'Weights', keywords: 'workout exercise gym' },
				{ emoji: '🧘', label: 'Meditation', keywords: 'mindfulness yoga calm' },
				{ emoji: '🧗', label: 'Climbing', keywords: 'exercise sport' },
				{ emoji: '🩺', label: 'Health', keywords: 'doctor medical' },
				{ emoji: '🧠', label: 'Mind', keywords: 'mental health learning' },
				{ emoji: '🫀', label: 'Heart', keywords: 'health cardio' },
				{ emoji: '🦷', label: 'Teeth', keywords: 'health brush' }
			]
		},
		{
			label: 'Mind & learning',
			icons: [
				{ emoji: '📖', label: 'Reading', keywords: 'book learn study' },
				{ emoji: '📚', label: 'Books', keywords: 'read learn study' },
				{ emoji: '✍️', label: 'Writing', keywords: 'journal write notes' },
				{ emoji: '🎓', label: 'Study', keywords: 'learn school education' },
				{ emoji: '🧩', label: 'Puzzles', keywords: 'brain game' },
				{ emoji: '💡', label: 'Ideas', keywords: 'learn focus' },
				{ emoji: '🎨', label: 'Creative', keywords: 'art draw paint' },
				{ emoji: '🎵', label: 'Music', keywords: 'listen practice' },
				{ emoji: '🎸', label: 'Guitar', keywords: 'music practice' },
				{ emoji: '🎹', label: 'Piano', keywords: 'music practice' }
			]
		},
		{
			label: 'Daily life',
			icons: [
				{ emoji: '💧', label: 'Water', keywords: 'drink hydrate' },
				{ emoji: '🥗', label: 'Healthy food', keywords: 'eat nutrition' },
				{ emoji: '🍎', label: 'Fruit', keywords: 'eat nutrition' },
				{ emoji: '☕', label: 'Coffee', keywords: 'drink' },
				{ emoji: '😴', label: 'Sleep', keywords: 'rest bedtime' },
				{ emoji: '🛌', label: 'Bedtime', keywords: 'sleep rest' },
				{ emoji: '🧹', label: 'Cleaning', keywords: 'home tidy' },
				{ emoji: '🧺', label: 'Laundry', keywords: 'home chores' },
				{ emoji: '🪴', label: 'Plants', keywords: 'garden nature' },
				{ emoji: '🛁', label: 'Self-care', keywords: 'bath relax' }
			]
		},
		{
			label: 'Work & goals',
			icons: [
				{ emoji: '💼', label: 'Work', keywords: 'job career' },
				{ emoji: '💻', label: 'Computer', keywords: 'work code' },
				{ emoji: '📅', label: 'Planning', keywords: 'calendar organize' },
				{ emoji: '✅', label: 'Done', keywords: 'complete task' },
				{ emoji: '📌', label: 'Important', keywords: 'focus priority' },
				{ emoji: '📝', label: 'Notes', keywords: 'write work' },
				{ emoji: '📊', label: 'Progress', keywords: 'goals work' },
				{ emoji: '🔧', label: 'Build', keywords: 'fix make work' },
				{ emoji: '💰', label: 'Money', keywords: 'finance save' },
				{ emoji: '📈', label: 'Growth', keywords: 'goals progress' }
			]
		},
		{
			label: 'People & meaning',
			icons: [
				{ emoji: '☎️', label: 'Call', keywords: 'phone people' },
				{ emoji: '💬', label: 'Chat', keywords: 'message people' },
				{ emoji: '👥', label: 'People', keywords: 'social family' },
				{ emoji: '❤️', label: 'Love', keywords: 'relationships' },
				{ emoji: '🤝', label: 'Together', keywords: 'social people' },
				{ emoji: '🐶', label: 'Dog', keywords: 'pet walk' },
				{ emoji: '🐱', label: 'Cat', keywords: 'pet' },
				{ emoji: '🌱', label: 'Nature', keywords: 'garden outdoors' },
				{ emoji: '🌍', label: 'Planet', keywords: 'environment' },
				{ emoji: '🙏', label: 'Gratitude', keywords: 'mindfulness reflect' }
			]
		}
	];

	let pickerOpen = $state(false);
	let search = $state('');
	let customEmoji = $state('');
	let composingEmoji = $state(false);
	let detailsOpen = $state(false);

	let visibleGroups = $derived.by(() => {
		const query = search.trim().toLowerCase();
		if (!query) return iconGroups;
		return iconGroups
			.map((group) => ({
				...group,
				icons: group.icons.filter((icon) => `${icon.label} ${icon.keywords}`.toLowerCase().includes(query))
			}))
			.filter((group) => group.icons.length);
	});

	function openPicker() {
		search = '';
		customEmoji = '';
		pickerOpen = true;
	}

	function chooseIcon(value: string) {
		haptic('tap');
		emoji = value;
		pickerOpen = false;
	}

	function useCustomEmoji() {
		if (composingEmoji) return;
		const value = habitEmoji(customEmoji);
		if (!value) return;
		chooseIcon(value);
	}

	function limitCustomEmoji(input: HTMLInputElement) {
		const value = habitEmoji(input.value);
		if (input.value !== value) {
			const leadingSpace = input.value.length - input.value.trimStart().length;
			const start = Math.max(0, (input.selectionStart ?? 0) - leadingSpace);
			const end = Math.max(0, (input.selectionEnd ?? 0) - leadingSpace);
			const direction = input.selectionDirection ?? undefined;
			input.value = value;
			input.setSelectionRange(Math.min(start, value.length), Math.min(end, value.length), direction);
		}
		customEmoji = value;
	}
</script>

<label class="block">
	<span class="mb-2 block text-sm font-medium">Habit name</span>
	<input bind:value={name} required maxlength="200" placeholder="Habit name" class="sunken min-h-12 w-full rounded-xl px-4 text-base outline-none placeholder:opacity-50" />
</label>

<details bind:open={detailsOpen} class="hairline rounded-2xl border">
	<summary class="flex cursor-pointer items-center gap-3 p-3">
		<span class="grid size-10 place-items-center rounded-xl text-xl" style="background: color-mix(in oklch, {color} 18%, transparent)">{emoji}</span>
		<span class="flex-1 text-sm font-medium">Icon & colour</span>
		<span class="dim text-xs">Customise</span>
		<svg viewBox="0 0 24 24" class="identity-chevron dim size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="m6 9 6 6 6-6" />
		</svg>
	</summary>
	<div class="hairline space-y-4 border-t p-3">
		<div class="flex items-center justify-between gap-3">
			<div>
				<p class="text-sm font-medium">Icon</p>
				<p class="dim text-xs">Choose one that helps you spot it quickly.</p>
			</div>
			<button type="button" onclick={openPicker} class="tap sunken flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium">
				<span class="text-xl">{emoji}</span>
				<span>Browse icons</span>
				<svg viewBox="0 0 24 24" class="dim size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
			</button>
		</div>

		<div>
			<p class="mb-2 text-sm font-medium">Colour</p>
			<div role="group" aria-label="Habit colour" class="grid grid-cols-6 gap-1.5">
				{#each HABIT_COLORS as option, i (option)}
					<button type="button" aria-label={colorNames[i]} aria-pressed={color === option} onclick={() => (color = option)} class="tap grid min-h-11 place-items-center rounded-xl" class:selected={color === option}>
						<span class="size-6 rounded-full" style:background={option}></span>
					</button>
				{/each}
			</div>
		</div>
	</div>
</details>

<Sheet open={pickerOpen} title="Choose an icon" confirmLabel="Done" onClose={() => (pickerOpen = false)}>
	{#snippet children()}
		<div class="space-y-5">
			<label class="relative block">
				<span class="sr-only">Search icons</span>
				<svg viewBox="0 0 24 24" class="dim pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
				<input bind:value={search} placeholder="Search icons" class="sunken min-h-12 w-full rounded-xl pr-4 pl-10 text-base outline-none placeholder:opacity-50" />
			</label>

			{#if visibleGroups.length}
				{#each visibleGroups as group}
					<section>
						<h3 class="dim mb-2 text-caption font-semibold tracking-wide uppercase">{group.label}</h3>
						<div role="group" aria-label={group.label} class="grid grid-cols-5 gap-1.5">
							{#each group.icons as option (option.emoji)}
								<button type="button" onclick={() => chooseIcon(option.emoji)} aria-label={option.label} aria-pressed={emoji === option.emoji} class="tap grid min-h-12 place-items-center rounded-xl text-2xl" class:selected={emoji === option.emoji}>{option.emoji}</button>
							{/each}
						</div>
					</section>
				{/each}
			{:else}
				<p class="dim py-5 text-center text-sm">No matching icons.</p>
			{/if}

			<div class="hairline border-t pt-4">
				<label class="block">
					<span class="mb-2 block text-sm font-medium">Or use an emoji</span>
					<div class="flex gap-2">
						<input
							value={customEmoji}
							oninput={(event) => { if (!composingEmoji && !(event instanceof InputEvent && event.isComposing)) limitCustomEmoji(event.currentTarget); }}
							oncompositionstart={() => (composingEmoji = true)}
							oncompositionend={(event) => { composingEmoji = false; limitCustomEmoji(event.currentTarget); }}
							placeholder="Paste an emoji"
							class="sunken min-h-11 min-w-0 flex-1 rounded-xl px-3 text-base outline-none placeholder:opacity-50"
						/>
						<button type="button" onclick={useCustomEmoji} disabled={composingEmoji || !customEmoji.trim()} class="tap accent-bg min-h-11 rounded-xl px-4 text-sm font-semibold disabled:opacity-30">Use</button>
					</div>
				</label>
			</div>
		</div>
	{/snippet}
</Sheet>

<style>
	.selected { background: var(--selected-bg); }
	summary { list-style: none; }
	summary::-webkit-details-marker { display: none; }
	.identity-chevron { transition: transform 160ms ease; }
	details[open] .identity-chevron { transform: rotate(180deg); }
	button:focus-visible { outline-offset: 2px; }
</style>
