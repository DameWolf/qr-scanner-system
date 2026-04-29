<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import GuestList from '$lib/components/GuestList.svelte';
	import Footer from '$lib/components/Footer.svelte';
</script>

<svelte:head>
	<title>Guest List</title>
</svelte:head>

<Navbar title="Guest List" />

<main class="content">
	<div class="page-container">
		<GuestList />
	</div>
	<Footer />
</main>

<style>
	.content {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		display: flex;
		flex-direction: column;
		background: var(--bg-primary);
	}

	.page-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		max-width: 1400px;
		margin: 0 auto;
		width: 100%;
		padding: 16px;
	}

	@media (min-width: 768px) {
		.page-container {
			padding: 24px;
		}
	}
</style>
