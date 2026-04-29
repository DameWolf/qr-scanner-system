<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { navState } from '$lib/navState.svelte';
	import { onMount, onDestroy } from 'svelte';

	let { collapsed = $bindable(false) } = $props();

	let isMobile = $state(false);
	let mql: MediaQueryList | undefined;

	onMount(() => {
		mql = window.matchMedia('(max-width: 767px)');
		isMobile = mql.matches;
		mql.addEventListener('change', (e) => {
			isMobile = e.matches;
		});
	});
	onDestroy(() => {
		mql?.removeEventListener('change', () => {});
	});

	function toggle(e: Event) {
		e.preventDefault();
		e.stopPropagation();
		collapsed = !collapsed;
		if (browser) {
			localStorage.setItem('sidebarCollapsed', String(collapsed));
		}
	}

	function expand() {
		// Only expand on desktop — on mobile the sidebar is a full drawer
		if (isMobile) return;
		if (collapsed) {
			collapsed = false;
			if (browser) {
				localStorage.setItem('sidebarCollapsed', 'false');
			}
		}
	}

	function handleNavClick() {
		navState.mobileMenuOpen = false;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="mobile-overlay"
	class:visible={navState.mobileMenuOpen}
	onclick={() => (navState.mobileMenuOpen = false)}
></div>

<aside class="sidebar" class:collapsed class:mobile-open={navState.mobileMenuOpen}>
	<div class="sidebar-header">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="logo-icon"
			onclick={collapsed ? expand : undefined}
			class:cursor-pointer={collapsed}
		>
			<img src="/pamet-logo.png" alt="PAMET Logo" class="logo-img" />
		</div>
		<div class="header-text-container" class:collapsed-text={collapsed}>
			<span class="logo-text">PAMET</span>
		</div>
		{#if !collapsed}
			<button class="toggle-btn" onclick={toggle} aria-label="Collapse sidebar">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" />
					<line x1="9" y1="3" x2="9" y2="21" />
				</svg>
			</button>
		{/if}
	</div>

	<nav class="sidebar-nav" class:nav-collapsed={collapsed}>
		<!-- Scanner (default landing) -->
		<a href="/" class="nav-link" class:active={$page.url.pathname === '/'} onclick={handleNavClick}>
			<div class="icon-container">
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
			</div>
			<div class="text-container" class:collapsed-text={collapsed}>
				<span>Scanner</span>
			</div>
		</a>
		<!-- Guest List -->
		<a
			href="/guest-list"
			class="nav-link"
			class:active={$page.url.pathname === '/guest-list'}
			onclick={handleNavClick}
		>
			<div class="icon-container">
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
					<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
					<circle cx="9" cy="7" r="4" />
					<path d="M23 21v-2a4 4 0 00-3-3.87" />
					<path d="M16 3.13a4 4 0 010 7.75" />
				</svg>
			</div>
			<div class="text-container" class:collapsed-text={collapsed}>
				<span>Guest List</span>
			</div>
		</a>
		<!-- About -->
		<a
			href="/about"
			class="nav-link"
			class:active={$page.url.pathname === '/about'}
			onclick={handleNavClick}
		>
			<div class="icon-container">
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
					<circle cx="12" cy="12" r="10" />
					<line x1="12" y1="8" x2="12" y2="12" />
					<line x1="12" y1="16" x2="12.01" y2="16" />
				</svg>
			</div>
			<div class="text-container" class:collapsed-text={collapsed}>
				<span>About</span>
			</div>
		</a>
	</nav>

	<div class="sidebar-footer" class:footer-collapsed={collapsed}>
		<a href="/" class="nav-link" onclick={handleNavClick}>
			<div class="icon-container">
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
					<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
					<polyline points="16 17 21 12 16 7" />
					<line x1="21" y1="12" x2="9" y2="12" />
				</svg>
			</div>
			<div class="text-container" class:collapsed-text={collapsed}>
				<span>Logout</span>
			</div>
		</a>
	</div>
</aside>

<style>
	.mobile-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 45;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.3s ease;
	}

	.mobile-overlay.visible {
		opacity: 1;
		pointer-events: auto;
	}

	.sidebar {
		display: flex;
		position: fixed;
		left: 0;
		top: 0;
		bottom: 0;
		width: 260px;
		background: var(--bg-sidebar);
		flex-direction: column;
		z-index: 50;
		transform: translateX(-100%);
		transition:
			transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
			width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		overflow: hidden;
		box-shadow: var(--shadow-md);
		will-change: width, transform;
	}

	.sidebar.mobile-open {
		transform: translateX(0);
	}

	.sidebar.collapsed {
		width: 72px;
	}

	@media (max-width: 767px) {
		.toggle-btn {
			display: none; /* never show toggle button on mobile */
		}

		.sidebar.collapsed {
			width: 260px;
		}

		/* Force text to show on mobile even if .collapsed-text is applied */
		.sidebar-nav .text-container,
		.sidebar-nav .text-container.collapsed-text,
		.sidebar-footer .text-container,
		.sidebar-footer .text-container.collapsed-text,
		.header-text-container,
		.header-text-container.collapsed-text {
			opacity: 1 !important;
			pointer-events: auto !important;
			transform: translateX(0) !important;
			width: auto !important;
			display: block !important;
		}

		.header-text-container.collapsed-text,
		.header-text-container {
			margin-left: 12px !important;
		}
	}

	@media (min-width: 768px) {
		.mobile-overlay {
			display: none;
		}

		.sidebar {
			display: flex;
			position: static;
			transform: translateX(0);
			width: 260px; /* Base width */
			flex-shrink: 0;
			height: 100%;
			border-right: 1px solid rgba(0, 0, 0, 0.1);
		}

		.sidebar.collapsed {
			width: 72px;
		}
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		padding: 0 16px;
		height: var(--navbar-height);
		border-bottom: 1px solid rgba(255, 255, 255, 0.15);
		overflow: hidden;
		white-space: nowrap;
	}

	.logo-icon {
		width: 40px;
		height: 40px;
		min-width: 40px;
		background: transparent;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
		overflow: hidden;
	}

	.logo-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.cursor-pointer {
		cursor: pointer;
	}

	.header-text-container {
		flex: 1;
		margin-left: 12px;
		opacity: 1;
		transition:
			opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) 0.1s,
			margin 0.2s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
	}

	.header-text-container.collapsed-text {
		opacity: 0;
		margin-left: 0;
		pointer-events: none;
		transition: opacity 0.1s ease;
	}

	.logo-text {
		color: white;
		font-size: 18px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.toggle-btn {
		position: relative;
		z-index: 10;
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		padding: 6px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		margin-left: auto;
	}

	.toggle-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.15);
	}

	.sidebar-nav {
		flex: 1;
		display: flex;
		flex-direction: column;
		padding: 24px 0; /* Remove horizontal padding here to rely on link padding */
		gap: 8px;
		overflow-y: auto;
		overflow-x: hidden;
	}

	/* Scrollbar for nav */
	.sidebar-nav::-webkit-scrollbar {
		width: 4px;
	}
	.sidebar-nav::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
	}

	.nav-link {
		display: flex;
		align-items: center;
		padding: 10px; /* Uniform padding ensures icon starts precisely at 10px inside */
		margin: 0 16px; /* 16px + 10px = 26px left edge of icon */
		color: rgba(255, 255, 255, 0.7);
		text-decoration: none;
		border-radius: 10px;
		font-size: 15px;
		font-weight: 500;
		transition: all 0.2s ease;
		overflow: hidden;
	}

	.icon-container {
		width: 20px;
		height: 20px;
		min-width: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 14px;
	}

	.text-container {
		white-space: nowrap;
		opacity: 1;
		transform: translateX(0);
		transition:
			opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1) 0.1s,
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
	}

	.text-container.collapsed-text {
		opacity: 0;
		pointer-events: none;
		transform: translateX(-10px);
		transition: opacity 0.1s ease;
	}

	.nav-link:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.nav-link.active {
		background: rgba(255, 255, 255, 0.15);
		color: white;
	}

	.sidebar-footer {
		padding: 0;
		height: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}

	.sidebar-footer .nav-link {
		flex: 1;
	}
</style>
