<script lang="ts">
	let { onScanClick }: { onScanClick: () => void } = $props();
</script>

<div class="dock-outer">
	<div class="dock-inner">
		<div class="dock-slot"></div>
		<button class="dock-qr-btn" onclick={onScanClick} aria-label="Scan QR Code">
			<svg
				width="26"
				height="26"
				viewBox="0 0 24 24"
				fill="none"
				stroke="white"
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
		</button>
		<div class="dock-slot"></div>
	</div>
</div>

<style>
	.dock-outer {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		pointer-events: none;
	}

	.dock-inner {
		background: #800000;
		border-radius: 0;
		max-width: none;
		margin: 0;
		padding: 8px 20px;
		padding-bottom: calc(8px + env(safe-area-inset-bottom));
		box-shadow: 0 -2px 12px rgba(128, 0, 0, 0.2);
		display: flex;
		align-items: center;
		pointer-events: auto;
	}

	.dock-slot {
		flex: 1;
	}

	.dock-qr-btn {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 2.5px solid #ffffff;
		background: #800000;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		margin-top: -22px;
		box-shadow:
			0 4px 16px rgba(128, 0, 0, 0.3),
			0 0 0 3px #800000;
		transition:
			transform 0.15s ease,
			background 0.15s ease;
	}

	.dock-qr-btn:active {
		transform: scale(0.9);
		background: #5c0000;
	}

	@media (min-width: 768px) {
		.dock-outer {
			display: none;
		}
	}
</style>
