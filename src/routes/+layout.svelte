<script lang="ts">
	import './layout.css';
	import { browser } from '$app/environment';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

	injectSpeedInsights();

	let { children } = $props();

	let sidebarCollapsed = $state(false);

	if (browser) {
		sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
	}
</script>

<svelte:head>
	<link rel="icon" href="/pamet-logo.png" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<Sidebar bind:collapsed={sidebarCollapsed} />

<div class="main-wrapper">
	{@render children()}
</div>

<style>
	.main-wrapper {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		height: 100dvh;
		background: var(--bg-primary);
		overflow: hidden;
		position: relative;
	}
</style>
