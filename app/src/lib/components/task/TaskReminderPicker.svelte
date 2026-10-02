<script lang="ts">
	import { settings } from '#lib/settings.svelte.js';
	import { hapticTap } from '#lib/haptics.js';
	import { reminderLabel, suggestedReminder, validReminder } from '#lib/reminders.js';

	let {
		value,
		dueTime,
		onSelect,
		reminders = [],
		onReminders
	}: {
		value?: number;
		dueTime: string;
		onSelect: (value: number | undefined) => void;
		reminders?: string[];
		onReminders: (value: string[]) => void;
	} = $props();

	let customOpen = $state(false);
	let customDate = $state('');
	let customTime = $state('09:00');
	let error = $state('');

	function addReminder(value: string) {
		if (!validReminder(value) || new Date(value).getTime() <= Date.now()) {
			error = 'Choose a future date and time.';
			return;
		}
		onReminders([...new Set([...reminders, value])].sort());
		error = '';
		customOpen = false;
	}

	function openCustom() {
		customDate = suggestedReminder('tomorrow').split('T')[0];
		customTime = '09:00';
		error = '';
		customOpen = true;
	}

	const choices = [
		{ value: undefined, label: 'Automatic' },
		{ value: -1, label: 'None' },
		{ value: 0, label: 'At task time' },
		{ value: 10, label: '10 min before' },
		{ value: 30, label: '30 min before' },
		{ value: 60, label: '1 hour before' }
	];

	function automaticLabel(minutes: number): string {
		if (minutes < 0) return 'off';
		if (minutes === 0) return 'at the due time';
		if (minutes === 60) return '1 hour before';
		return `${minutes} minutes before`;
	}
</script>

<div class="flex flex-col gap-2">
	<p class="text-copy font-medium">Date & time</p>
	<div class="flex flex-wrap gap-1.5">
		<button type="button" use:hapticTap onclick={() => addReminder(suggestedReminder('hour'))} class="tap sunken min-h-11 rounded-full px-3 py-1.5 text-caption font-medium">In 1 hour</button>
		<button type="button" use:hapticTap onclick={() => addReminder(suggestedReminder('later'))} class="tap sunken min-h-11 rounded-full px-3 py-1.5 text-caption font-medium">Later</button>
		<button type="button" use:hapticTap onclick={() => addReminder(suggestedReminder('tomorrow'))} class="tap sunken min-h-11 rounded-full px-3 py-1.5 text-caption font-medium">Tomorrow · 9 AM</button>
		<button type="button" use:hapticTap onclick={openCustom} aria-expanded={customOpen} class="tap sunken min-h-11 rounded-full px-3 py-1.5 text-caption font-medium">Custom…</button>
	</div>
	{#if customOpen}
		<div class="flex flex-wrap items-end gap-2">
			<label class="min-w-0 flex-1 text-caption">Reminder date
				<input type="date" bind:value={customDate} class="sunken mt-1 min-h-11 w-full rounded-lg px-3 py-2 text-copy" />
			</label>
			<label class="min-w-0 flex-1 text-caption">Reminder time
				<input type="time" bind:value={customTime} class="sunken mt-1 min-h-11 w-full rounded-lg px-3 py-2 text-copy" />
			</label>
			<button type="button" onclick={() => addReminder(`${customDate}T${customTime}`)} class="tap accent-bg min-h-11 rounded-lg px-3 text-copy font-semibold">Add reminder</button>
			<button type="button" onclick={() => { customOpen = false; error = ''; }} class="tap dim min-h-11 rounded-lg px-3 text-copy">Cancel</button>
		</div>
	{/if}
	{#if error}<p role="alert" class="danger text-caption">{error}</p>{/if}
	{#if reminders.length}
		<ul class="flex flex-col" aria-label="Custom reminders">
			{#each reminders as reminder (reminder)}
				<li class="flex items-center justify-between gap-2">
					<span class="text-copy">{reminderLabel(reminder)}</span>
					<button type="button" use:hapticTap aria-label={`Remove reminder ${reminderLabel(reminder)}`} onclick={() => onReminders(reminders.filter((item) => item !== reminder))} class="tap dim min-h-11 rounded-lg px-2 text-caption">Remove</button>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="dim text-caption">Remind yourself independently of the task’s date. Later is about 4 hours from now.</p>
</div>

{#if dueTime}
	<p class="mt-4 mb-2 text-copy font-medium">Before task</p>
	<div class="flex flex-wrap gap-1.5">
		{#each choices as choice (choice.label)}
			<button
				type="button"
				use:hapticTap
				onclick={() => onSelect(choice.value)}
				aria-pressed={value === choice.value}
				class="tap hairline min-h-11 rounded-full border px-3 py-1.5 text-caption font-medium"
				class:accent-bg={value === choice.value}
				class:sunken={value !== choice.value}
			>
				{choice.label}
			</button>
		{/each}
	</div>
	<p class="dim mt-1.5 text-caption">
		{value === undefined
			? `Uses the automatic reminder: ${automaticLabel(settings.reminderMinutes)}.`
			: value < 0
				? 'No reminder tied to the task time. Date & time reminders still apply.'
				: value === 0
					? 'Reminds you when the task is due.'
					: `Reminds you ${automaticLabel(value)}.`}
	</p>
{:else}
	<p class="dim mt-3 text-caption">Automatic and “before task” reminders are available when the task has a time.</p>
{/if}
