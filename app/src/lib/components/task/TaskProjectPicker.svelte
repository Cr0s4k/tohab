<script lang="ts">
	import type { Project } from '#lib/db/schemas.js';
	import { haptic, hapticTap } from '#lib/haptics.js';

	let {
		projects,
		value,
		onSelect,
		variant = 'chips'
	}: {
		projects: Project[];
		value: string | undefined;
		onSelect: (value: string) => void;
		variant?: 'chips' | 'select';
	} = $props();

	function select(projectId: string) {
		haptic('tap');
		onSelect(projectId);
	}
</script>

{#if variant === 'select'}
	<select
		aria-label="Project"
		value={value ?? ''}
		onchange={(event) => onSelect(event.currentTarget.value)}
		class="sunken w-full rounded-xl px-3 py-2.5 text-copy outline-none"
	>
		<option value="">Inbox</option>
		{#each projects as project (project.id)}
			<option value={project.id}>{project.name}</option>
		{/each}
	</select>
{:else}
	<div class="flex flex-wrap gap-1.5">
		<button
			type="button"
			use:hapticTap
			onclick={() => select('')}
			aria-pressed={value === ''}
			class="tap min-h-11 rounded-full px-3 py-1.5 text-caption font-medium"
			class:accent-bg={value === ''}
			class:sunken={value !== ''}
		>
			Inbox
		</button>
		{#each projects as project (project.id)}
			<button
				type="button"
				use:hapticTap
				onclick={() => select(project.id)}
				aria-pressed={value === project.id}
				class="tap flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-medium"
				class:accent-bg={value === project.id}
				class:sunken={value !== project.id}
			>
				<span class="size-2 rounded-full" style="background: {project.color}"></span>
				{project.name}
			</button>
		{/each}
	</div>
{/if}
