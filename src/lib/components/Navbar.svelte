<script lang="ts">
	let { title = 'Entry Scanner' }: { title?: string } = $props();
	import { navState } from '$lib/navState.svelte';
	import { page } from '$app/stores';
</script>

<header class="navbar">
	<div class="navbar-inner">
		<div class="nav-left">
			<button
				class="mobile-menu-btn"
				onclick={() => (navState.mobileMenuOpen = !navState.mobileMenuOpen)}
				aria-label="Toggle Menu"
			>
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="3" y1="12" x2="21" y2="12" />
					<line x1="3" y1="6" x2="21" y2="6" />
					<line x1="3" y1="18" x2="21" y2="18" />
				</svg>
			</button>
			<div class="nav-logo">
				<img src="/pamet-logo.png" alt="PAMET Logo" class="logo-img" />
			</div>
		</div>

		<div class="nav-center">
			<h1 class="nav-title">{title}</h1>
		</div>

		<div class="nav-right">
			{#if $page.url.pathname === '/'}
				<a
					href="/guest-list"
					class="mobile-action-btn"
					title="Go to Guest List"
					aria-label="Go to Guest List"
				>
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
						<circle cx="9" cy="7" r="4"></circle>
						<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
						<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
					</svg>
				</a>
			{:else}
				<a href="/" class="mobile-action-btn" title="Go to Scanner" aria-label="Go to Scanner">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M7 3H3v4" />
						<path d="M17 3h4v4" />
						<path d="M21 17v4h-4" />
						<path d="M3 17v4h4" />
						<rect x="9" y="9" width="6" height="6" rx="1" />
					</svg>
				</a>
			{/if}
		</div>
	</div>
</header>

<style>
	.navbar {
		position: sticky;
		top: 0;
		z-index: 40;
		height: var(--navbar-height);
		background: var(--bg-sidebar);
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		display: flex;
		align-items: center;
		box-shadow: var(--shadow-sm);
	}

	.navbar-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		max-width: 1400px;
		margin: 0 auto;
		padding: 0 16px;
		height: 100%;
		position: relative;
	}

	.nav-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.mobile-menu-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: white;
		border: none;
		padding: 4px;
		cursor: pointer;
		border-radius: 6px;
	}

	.mobile-menu-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.mobile-action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.15);
		color: white;
		text-decoration: none;
		padding: 6px;
		border-radius: 8px;
		transition: background 0.2s ease;
	}

	.mobile-action-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.nav-logo {
		width: 36px;
		height: 36px;
		background: transparent;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.logo-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.nav-center {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		text-align: center;
		pointer-events: none;
	}

	.nav-title {
		color: white;
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.01em;
		margin: 0;
	}

	.nav-right {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-left: auto;
	}

	@media (min-width: 480px) {
		.navbar-inner {
			padding: 0 20px;
		}
		.nav-title {
			font-size: 18px;
		}
	}

	@media (min-width: 768px) {
		.navbar-inner {
			padding: 0 28px;
		}
		.mobile-menu-btn,
		.mobile-action-btn {
			display: none;
		}
		.nav-logo {
			display: none; /* Sidebar handles logo on desktop */
		}
		.nav-center {
			position: static;
			transform: none;
			text-align: left; /* Align left rather than center when on desktop */
			flex: 1;
		}
	}
</style>
