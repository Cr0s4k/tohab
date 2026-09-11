<script lang="ts">
	import TaskCompose from '../src/lib/components/TaskCompose.svelte';

	let open = $state(false);
	const projects = Array.from({ length: 80 }, (_, index) => ({
		id: `project-${index}`,
		name: `Project ${index}`,
		color: '#205fbd',
		createdAt: 1,
		updatedAt: 1
	}));
</script>

<button type="button" onclick={() => (open = true)} aria-label="Add task">+</button>
<TaskCompose {open} {projects} onClose={() => (open = false)} />
