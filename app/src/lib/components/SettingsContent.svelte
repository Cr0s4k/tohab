<script lang="ts">
	import DataSettings from './settings/DataSettings.svelte';
	import GeneralSettings from './settings/GeneralSettings.svelte';
	import IntegrationSettings from './settings/IntegrationSettings.svelte';

	let notice = $state('');
</script>

{#if notice}
	<p class="sunken mb-4 rounded-xl px-3 py-2 text-[0.8rem]">{notice}</p>
{/if}

<GeneralSettings onNotice={(message) => (notice = message)} />
<IntegrationSettings onNotice={(message) => (notice = message)} />
<DataSettings onNotice={(message) => (notice = message)} />
