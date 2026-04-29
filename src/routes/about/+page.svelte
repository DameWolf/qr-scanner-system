<script lang="ts">
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';

</script>

<svelte:head>
	<title>About | PAMET</title>
</svelte:head>

<Navbar title="About" />

<main class="content">
	<div class="page-wrapper">
		<div class="two-col">
			<!-- ── LEFT: Logo + Description ── -->
			<div class="col-left">
				<div class="logo-wrap">
					<img src="/pamet-logo.png" alt="PAMET Logo" class="logo-img" />
				</div>



				<div class="tech-stack">
					<h3 class="tech-title">Powered By</h3>
					<div class="tech-badges">
						<span class="badge svelte">SvelteKit</span>
						<span class="badge ts">TypeScript</span>
						<span class="badge apps-script">Google Apps Script</span>
					</div>
				</div>
			</div>

			<!-- ── DIVIDER ── -->
			<div class="col-divider"></div>

			<!-- ── RIGHT: Dev Team ── -->
			<div class="col-right">

			</div>
		</div>
	</div>
	<Footer />
</main>

<style>
	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		display: flex;
		flex-direction: column;
		background: var(--bg-primary);
	}

	.page-wrapper {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: safe center;
		padding: 32px 32px;
		max-width: 1200px;
		width: 100%;
		margin: 0 auto;
		box-sizing: border-box;
	}

	/* ── Two-column grid ── */
	.two-col {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 0;
		width: 100%;
		align-items: center;
		min-width: 0;
	}

	/* ── Left column ── */
	.col-left {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 20px;
		padding-right: 48px;
		min-height: 0;
		min-width: 0;
	}

	.logo-wrap {
		width: 120px;
		height: 120px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.logo-img {
		width: 300%;
		height: 300%;
		object-fit: contain;
	}

	.sys-name {
		font-size: clamp(18px, 2.4vw, 32px);
		font-weight: 800;
		background: linear-gradient(135deg, #800000 0%, #d91b1b 100%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		margin: 0;
		line-height: 1.2;
		letter-spacing: -0.02em;
		white-space: normal;
		max-width: 360px;
	}

	.description {
		font-size: 15px;
		line-height: 1.75;
		color: var(--text-secondary, #4b5563);
		margin: 0;
		max-width: 420px;
	}

	/* ── Tech Stack ── */
	.tech-stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		margin-top: 16px;
	}

	.tech-title {
		font-size: 13px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary, #6b7280);
		margin: 0;
	}

	.tech-badges {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
	}

	.badge {
		font-size: 12px;
		font-weight: 600;
		padding: 4px 12px;
		border-radius: 100px;
		background: rgba(128, 0, 0, 0.05);
		color: #800000;
		border: 1px solid rgba(128, 0, 0, 0.1);
	}

	.badge.svelte {
		background: rgba(255, 62, 0, 0.1);
		color: #ff3e00;
		border-color: rgba(255, 62, 0, 0.2);
	}

	.badge.ts {
		background: rgba(49, 120, 198, 0.1);
		color: #3178c6;
		border-color: rgba(49, 120, 198, 0.2);
	}

	.badge.apps-script {
		background: rgba(15, 157, 88, 0.1);
		color: #0f9d58;
		border-color: rgba(15, 157, 88, 0.2);
	}

	/* ── Divider ── */
	.col-divider {
		width: 1px;
		align-self: stretch;
		background: linear-gradient(
			to bottom,
			transparent,
			rgba(128, 0, 0, 0.2) 20%,
			rgba(128, 0, 0, 0.2) 80%,
			transparent
		);
		margin: 0 16px;
	}

	/* ── Right column ── */
	.col-right {
		display: flex;
		flex-direction: column;
		gap: 24px;
		padding-left: 48px;
		min-height: 0;
		min-width: 0;
	}

	.team-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 6px;
	}

	.team-title {
		font-size: 26px;
		font-weight: 800;
		color: var(--text-primary, #111827);
		margin: 0;
		letter-spacing: -0.02em;
	}

	.dev-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 48px 16px; /* Increased vertical gap to prevent row overlap */
		margin-top: 32px; /* Add space so images don't overlap the header */
	}

	/* ── Dev Cards (Premium Profiles) ── */
	.dev-card {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		/* Taller to accommodate the standing photos + name tag below */
		height: clamp(160px, 22vh, 220px);
		/* Transparent background so it blends with the page */
		background: transparent;
		border-radius: 0;
		color: var(--text-primary);
		box-shadow: none;
		border: none;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
		animation: fadeUp 0.4s ease both;
	}

	.dev-card:hover {
		transform: translateY(-6px);
	}

	@keyframes fadeUp {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dev-initials {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 42px;
		font-weight: 800;
		color: rgba(128, 0, 0, 0.15);
		letter-spacing: -0.02em;
		z-index: 0;
	}

	/* Photo sits above the name tag area */
	.dev-photo {
		position: absolute;
		bottom: 36px; /* Space for the solid part of the name tag */
		left: 50%;
		transform: translateX(-50%);
		width: 140%; /* Extended by 20% from 120% */
		height: calc(120% - 36px); /* Extended height by 20% */
		object-fit: contain;
		object-position: bottom center;
		z-index: 1;
		transition: transform 0.4s ease;
		/* Optional: add a subtle drop shadow to the person to make them pop */
		filter: drop-shadow(0 8px 16px rgba(0,0,0,0.15));
	}

	.dev-card:hover .dev-photo {
		transform: translateX(-50%) scale(1.05);
	}

	/* Hide fallback initials by default when an image is provided */
	.fallback-initials {
		position: absolute;
		inset: 0;
		z-index: 0;
		opacity: 0;
		visibility: hidden;
	}

	/* Show initials only when image errors */
	:global(.dev-card.show-initials) .dev-photo {
		display: none;
	}

	:global(.dev-card.show-initials) .fallback-initials {
		opacity: 1;
		visibility: visible;
	}

	/* Name tag positioned at the bottom, fading up into the image */
	.dev-info-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 2;
		height: 66px; /* 30px fade overlap + 36px solid bottom */
		/* Seamless fade into solid color */
		background: linear-gradient(to bottom, rgba(128, 0, 0, 0) 0%, rgba(128, 0, 0, 0.95) 30px, rgba(128, 0, 0, 0.95) 100%);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		padding: 0 12px 10px;
		text-align: center;
		border-radius: 0 0 8px 8px;
	}

	.dev-name {
		font-size: 14px;
		font-weight: 700;
		color: #ffffff;
		margin-bottom: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Responsive ── */

	/* Large desktops only — allow nowrap title */
	@media (min-width: 1400px) {
		.sys-name {
			white-space: nowrap;
			max-width: none;
		}
	}

	/* Tablet landscape & portrait: Honor Pad 9 and similar (769px – 1280px) */
	@media (max-width: 1280px) and (min-width: 769px) {
		.page-wrapper {
			padding: 20px 20px;
		}
		.col-left {
			padding-right: 20px;
			gap: 14px;
		}
		.col-right {
			padding-left: 20px;
			gap: 16px;
		}
		.logo-wrap {
			width: 88px;
			height: 88px;
		}
		.sys-name {
			font-size: clamp(16px, 2vw, 24px);
			white-space: normal;
			max-width: 280px;
		}
		.description {
			font-size: 13px;
			line-height: 1.65;
		}
		.dev-grid {
			gap: 40px 12px;
			margin-top: 24px;
		}
		.dev-card {
			height: clamp(140px, 18vh, 200px);
		}
		.team-title {
			font-size: 22px;
		}
	}

	/* Stack below 768px */
	@media (max-width: 768px) {
		.two-col {
			grid-template-columns: 1fr;
			gap: 20px;
		}

		.col-divider {
			width: 100%;
			height: 1px;
			align-self: auto;
			background: linear-gradient(
				to right,
				transparent,
				rgba(128, 0, 0, 0.2) 20%,
				rgba(128, 0, 0, 0.2) 80%,
				transparent
			);
			margin: 0;
		}

		.col-left {
			padding: 0;
			gap: 12px;
		}

		.col-right {
			padding: 0;
			gap: 16px;
		}

		.logo-wrap {
			width: 88px;
			height: 88px;
		}

		.sys-name {
			white-space: normal;
			font-size: clamp(18px, 4.5vw, 24px);
		}

		.description {
			font-size: 14px;
			line-height: 1.65;
		}

		.page-wrapper {
			padding: 20px 20px 16px;
			align-items: flex-start;
		}

		/* 4-col single row — collapses grid height dramatically */
		.dev-grid {
			grid-template-columns: repeat(4, 1fr);
			gap: 32px 10px; /* Increased vertical gap for mobile */
			margin-top: 24px;
		}

		.dev-card {
			height: 150px;
			border-radius: 0;
		}

		.dev-initials {
			font-size: 28px;
		}

		.dev-photo {
			bottom: 28px;
			width: 140%;
			height: calc(120% - 28px);
		}

		.dev-info-overlay {
			height: 48px; /* 20px fade + 28px solid */
			background: linear-gradient(to bottom, rgba(128, 0, 0, 0) 0%, rgba(128, 0, 0, 0.95) 20px, rgba(128, 0, 0, 0.95) 100%);
			padding: 0 4px 8px;
		}

		.dev-name {
			font-size: 11px;
		}

		.team-title {
			font-size: 22px;
		}
	}

	/* Very small phones (≤ 480px) */
	@media (max-width: 480px) {
		.page-wrapper {
			padding: 16px 14px 12px;
		}

		.logo-wrap {
			width: 72px;
			height: 72px;
		}

		.sys-name {
			font-size: 17px;
		}

		.description {
			font-size: 13px;
			line-height: 1.55;
		}

		.dev-card {
			height: 130px;
		}

		.dev-initials {
			font-size: 22px;
		}

		.dev-photo {
			bottom: 24px;
			width: 140%;
			height: calc(120% - 24px);
		}

		.dev-info-overlay {
			height: 40px; /* 16px fade + 24px solid */
			background: linear-gradient(to bottom, rgba(128, 0, 0, 0) 0%, rgba(128, 0, 0, 0.95) 16px, rgba(128, 0, 0, 0.95) 100%);
			padding: 0 4px 6px;
		}

		.dev-name {
			font-size: 10px;
		}

		.team-title {
			font-size: 19px;
		}
	}
</style>
