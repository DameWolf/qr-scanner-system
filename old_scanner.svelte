<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';

	interface ScanEntry {
		name: string;
		email?: string;
		status: 'success' | 'error';
		message: string;
		time: string;
		isHistorical?: boolean;
	}

	let html5Qrcode: any = null;
	let scannerStatus = $state<'scanning' | 'success' | 'error' | 'duplicate'>('scanning');
	let statusText = $state('Scanning...');
	let resultTitle = $state('');
	let resultMessage = $state('');
	let showResult = $state(false);
	let cameraActive = $state(false);
	let scanLocked = false;
	let resumeTimer: ReturnType<typeof setTimeout> | null = null;
	let scanLog = $state<ScanEntry[]>([]);
	let loadingHistory = $state(true);
	let isFullscreen = $state(false);
	let facingMode = $state<'environment' | 'user'>('environment');

	const RESUME_DELAY_MS = 2000;

	async function switchCamera() {
		if (scanLocked || !html5Qrcode) return;
		await stopCamera();
		facingMode = facingMode === 'environment' ? 'user' : 'environment';
		setTimeout(async () => {
			await startCamera();
		}, 100);
	}

	function toggleFullscreen() {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	}

	function onFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	async function loadHistoricalScans() {
		try {
			const res = await fetch('/api/attendees');
			const data = await res.json();
			const attendees: any[] = data.attendees ?? data.registered ?? [];
			const attended = attendees
				.filter((g) => g.attended && g.scanTime)
				.sort((a, b) => new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime());

			scanLog = attended.map((g) => ({
				name: g.name || 'Unknown',
				email: g.email || '',
				status: 'success' as const,
				message: 'Checked in',
				time: new Date(g.scanTime).toLocaleTimeString(),
				isHistorical: true
			}));
		} catch (err) {
			console.error('Failed to load historical scans:', err);
		} finally {
			loadingHistory = false;
		}
	}

	async function startCamera() {
		if (!browser) return;
		try {
			const { Html5Qrcode } = await import('html5-qrcode');
			html5Qrcode = new Html5Qrcode('scanner-reader');

			const shortSide = Math.min(window.innerWidth, window.innerHeight);
			const boxSize = Math.round(shortSide * 0.72);

			await html5Qrcode.start(
				{ facingMode: facingMode },
				{ fps: 10, qrbox: { width: boxSize, height: boxSize } },
				onScanSuccess,
				() => {}
			);
			cameraActive = true;
			scannerStatus = 'scanning';
			statusText = 'Scanning...';
			showResult = false;
		} catch (err) {
			console.error('Camera start error:', err);
			statusText = 'Camera access denied';
			scannerStatus = 'error';
		}
	}

	async function stopCamera() {
		if (html5Qrcode && cameraActive) {
			try {
				await html5Qrcode.stop();
			} catch {
				// ignore stop errors
			}
			cameraActive = false;
		}
	}

	async function onScanSuccess(decodedText: string) {
		if (scanLocked) return;
		scanLocked = true;

		await stopCamera();
		scannerStatus = 'scanning';
		statusText = 'Verifying...';
		showResult = false;

		try {
			const res = await fetch('/api/mark-attendance', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ qrContent: decodedText })
			});
			const data = await res.json();

			if (data.success) {
				scannerStatus = 'success';
				statusText = 'Attendance recorded!';
				resultTitle = data.name || 'Attendance Recorded';
				resultMessage = 'Successfully checked in';

				scanLog = [
					{
						name: data.name || 'Unknown',
						status: 'success',
						message: 'Checked in',
						time: new Date().toLocaleTimeString()
					},
					...scanLog
				];
			} else {
				const msg = (data.message || '').toLowerCase();
				if (
					msg.includes('not found') ||
					msg.includes('not registered') ||
					msg.includes('not pre-registered')
				) {
					scannerStatus = 'error';
					resultTitle = 'Not Pre-registered';
					resultMessage = 'This QR code is not on the guest list';
				} else if (msg.includes('already') || msg.includes('duplicate')) {
					scannerStatus = 'duplicate';
					resultTitle = 'Already Checked In';
					resultMessage = data.name
						? `${data.name} has already attended`
						: 'This guest has already been scanned';
				} else {
					scannerStatus = 'error';
					resultTitle = 'QR Not Recognized';
					resultMessage = 'Could not process this QR code';
				}
				statusText = resultTitle;

				scanLog = [
					{
						name: data.name || resultTitle,
						status: 'error',
						message: resultMessage,
						time: new Date().toLocaleTimeString()
					},
					...scanLog
				];
			}
		} catch {
			scannerStatus = 'error';
			statusText = 'Connection error';
			resultTitle = 'Connection Error';
			resultMessage = 'Could not reach the server';

			scanLog = [
				{
					name: 'Connection Error',
					status: 'error',
					message: 'Could not reach server',
					time: new Date().toLocaleTimeString()
				},
				...scanLog
			];
		}

		showResult = true;

		resumeTimer = setTimeout(async () => {
			showResult = false;
			scannerStatus = 'scanning';
			statusText = 'Scanning...';
			resultTitle = '';
			resultMessage = '';
			scanLocked = false;
			await startCamera();
		}, RESUME_DELAY_MS);
	}

	onMount(() => {
		loadHistoricalScans();
		setTimeout(() => startCamera(), 200);
		document.addEventListener('fullscreenchange', onFullscreenChange);
	});

	onDestroy(() => {
		document.removeEventListener('fullscreenchange', onFullscreenChange);
		if (resumeTimer) {
			clearTimeout(resumeTimer);
			resumeTimer = null;
		}
		scanLocked = false;
		stopCamera();
	});
</script>

<svelte:head>
	<title>Scanner</title>
</svelte:head>

<Navbar title="QR Scanner" />

<main class="content">
	<div class="page-container">
		<div class="scanner-grid">
			<!-- Left: Camera -->
			<div class="camera-panel">
				<div class="camera-area">
					<div id="scanner-reader"></div>
					<div class="scan-overlay">
						<div class="scan-focus">
							<div class="corner tl"></div>
							<div class="corner tr"></div>
							<div class="corner bl"></div>
							<div class="corner br"></div>
							<div class="scan-line"></div>
						</div>
					</div>
					<!-- Fullscreen button overlay: top-left of camera area -->
					<button
						class="fullscreen-btn"
						onclick={toggleFullscreen}
						title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
						aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
					>
						{#if isFullscreen}
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
								<path d="M8 3v3a2 2 0 01-2 2H3" />
								<path d="M21 8h-3a2 2 0 01-2-2V3" />
								<path d="M3 16h3a2 2 0 012 2v3" />
								<path d="M16 21v-3a2 2 0 012-2h3" />
							</svg>
						{:else}
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
								<path d="M8 3H5a2 2 0 00-2 2v3" />
								<path d="M21 8V5a2 2 0 00-2-2h-3" />
								<path d="M3 16v3a2 2 0 002 2h3" />
								<path d="M16 21h3a2 2 0 002-2v-3" />
							</svg>
						{/if}
					</button>

					<!-- Switch Camera button overlay -->
					<button
						class="switch-camera-btn"
						onclick={switchCamera}
						title="Switch Camera"
						aria-label="Switch Camera"
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
							<path d="M17 2.1l4 4-4 4" />
							<path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8" />
							<path d="M7 21.9l-4-4 4-4" />
							<path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
						</svg>
					</button>

					<div class="controls">
						<div class="status-bar">
							<span class="status-dot {scannerStatus}"></span>
							<span class="status-text">{statusText}</span>
						</div>

						{#if showResult}
							<div class="result-row {scannerStatus}">
								<span class="result-emoji"
									>{scannerStatus === 'success'
										? '✅'
										: scannerStatus === 'duplicate'
											? '⚠️'
											: '❌'}</span
								>
								<div class="result-info">
									<div class="result-title">{resultTitle}</div>
									<div class="result-message">{resultMessage}</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Right: Scan Log -->
			<div class="log-panel">
				<div class="log-header">
					<h2 class="log-title">Scan Log</h2>
					<span class="log-count">{scanLog.length} scans</span>
				</div>
				<div class="log-list">
					{#if loadingHistory}
						<div class="log-loading">
							<div class="spinner"></div>
							<span>Loading scan history…</span>
						</div>
					{:else if scanLog.length === 0}
						<div class="log-empty">
							<svg
								width="40"
								height="40"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M7 3H3v4" />
								<path d="M17 3h4v4" />
								<path d="M21 17v4h-4" />
								<path d="M3 17v4h4" />
								<rect x="9" y="9" width="6" height="6" rx="1" />
							</svg>
							<p>No scans yet</p>
							<span>Scan a QR code to see results here</span>
						</div>
					{:else}
						{#each scanLog as entry, i}
							<div
								class="log-item"
								class:success={entry.status === 'success'}
								class:error={entry.status === 'error'}
								style="animation-delay: {i * 0.03}s"
							>
								<div class="log-icon">
									{entry.status === 'success' ? '✅' : '❌'}
								</div>
								<div class="log-details">
									<div class="log-name">{entry.name}</div>
									{#if entry.email}
										<div class="log-email">{entry.email}</div>
									{:else}
										<div class="log-message">{entry.message}</div>
									{/if}
								</div>
								<div class="log-time">{entry.time}</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
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

	.scanner-grid {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
		border-radius: 16px;
		overflow: hidden;
		border: 1px solid var(--border-color);
		box-shadow: var(--shadow-sm);
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
		.scanner-grid {
			flex-direction: row;
		}
		.camera-panel {
			flex: 6;
			min-height: 0;
		}
		.log-panel {
			flex: 4;
			border-top: none;
			border-left: 1px solid var(--border-color);
		}
	}

	/* === Camera Panel === */
	.camera-panel {
		display: flex;
		flex-direction: column;
		background: #000;
		flex: 6;
		min-height: 50vh; /* Minimum height for camera on mobile before scrolling */
	}

	.camera-area {
		position: relative;
		width: 100%;
		flex: 1;
		background: #000;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Force the html5-qrcode container to fill the camera area */
	:global(#scanner-reader) {
		position: absolute !important;
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
	}

	:global(#scanner-reader__scan_region) {
		position: absolute !important;
		inset: 0 !important;
		width: 100% !important;
		height: 100% !important;
		min-height: 100% !important;
		background: transparent !important;
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
	}

	:global(#scanner-reader video) {
		position: absolute !important;
		top: 50% !important;
		left: 50% !important;
		transform: translate(-50%, -50%) !important;
		min-width: 100% !important;
		min-height: 100% !important;
		width: auto !important;
		height: auto !important;
		object-fit: cover !important;
	}

	:global(#scanner-reader__dashboard) {
		display: none !important;
	}

	:global(#scanner-reader__scan_region img) {
		display: none !important;
	}

	:global(#scanner-reader__scan_region video ~ div) {
		display: none !important;
	}

	:global(#scanner-reader__scan_region > div) {
		opacity: 0 !important;
		display: none !important;
	}

	:global(#scanner-reader > div:not(#scanner-reader__scan_region):not(#scanner-reader__dashboard)) {
		display: none !important;
	}

	:global(#scanner-reader canvas) {
		display: none !important;
	}

	/* === Scan Overlay === */
	.scan-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.scan-overlay::before {
		content: '';
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
	}

	.scan-focus {
		position: relative;
		z-index: 1;
		width: min(72vw, 72vh, 280px);
		height: min(72vw, 72vh, 280px);
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
	}

	.corner {
		position: absolute;
		width: 32px;
		height: 32px;
		border-color: #fff;
		border-style: solid;
		border-width: 0;
	}

	.corner.tl {
		top: 0;
		left: 0;
		border-top-width: 3px;
		border-left-width: 3px;
		border-top-left-radius: 6px;
	}
	.corner.tr {
		top: 0;
		right: 0;
		border-top-width: 3px;
		border-right-width: 3px;
		border-top-right-radius: 6px;
	}
	.corner.bl {
		bottom: 0;
		left: 0;
		border-bottom-width: 3px;
		border-left-width: 3px;
		border-bottom-left-radius: 6px;
	}
	.corner.br {
		bottom: 0;
		right: 0;
		border-bottom-width: 3px;
		border-right-width: 3px;
		border-bottom-right-radius: 6px;
	}

	.scan-line {
		position: absolute;
		left: 4px;
		right: 4px;
		height: 2px;
		background: linear-gradient(90deg, transparent, rgba(128, 0, 0, 0.9), transparent);
		box-shadow: 0 0 8px rgba(128, 0, 0, 0.5);
		animation: scanLine 2.5s ease-in-out infinite;
	}

	@keyframes scanLine {
		0%,
		100% {
			top: 8px;
			opacity: 0.6;
		}
		50% {
			top: calc(100% - 10px);
			opacity: 1;
		}
	}

	/* === Controls === */
	.controls {
		position: absolute;
		bottom: 24px;
		left: 0;
		right: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 0 16px;
	}

	.status-bar {
		background: #ffffff;
		border-radius: 9999px; /* Pill shape */
		padding: 10px 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		width: min(72vw, 72vh, 280px); /* Exactly match the scan-focus width */
		box-sizing: border-box;
	}

	/* Added safe area padding for modern mobile notches inside fullscreen */
	:global(:fullscreen .fullscreen-btn),
	:global(:fullscreen .switch-camera-btn) {
		top: calc(16px + env(safe-area-inset-top));
	}

	.fullscreen-btn {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 10;
		background: transparent;
		border: none;
		cursor: pointer;
		color: #ffffff;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		opacity: 1;
	}

	.fullscreen-btn:hover {
		opacity: 0.8;
	}

	.switch-camera-btn {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 10;
		background: transparent;
		border: none;
		cursor: pointer;
		color: #ffffff;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		opacity: 1;
	}

	.switch-camera-btn:hover {
		opacity: 0.8;
	}

	/* === Global fullscreen: hide sidebar/navbar/footer, show scanner grid only === */
	:global(:fullscreen .sidebar) {
		display: none !important;
	}

	:global(:fullscreen .navbar) {
		display: none !important;
	}

	:global(:fullscreen .footer) {
		display: none !important;
	}

	:global(:fullscreen .content) {
		display: flex;
		flex-direction: column;
		width: 100vw;
		height: 100dvh;
		padding: 0; /* Remove 20px padding to maximize mobile space */
		box-sizing: border-box;
		background: #2a0000;
	}

	@media (min-width: 768px) {
		:global(:fullscreen .content) {
			padding: 20px; /* Restore padding on desktop */
		}
	}

	:global(:fullscreen .scanner-grid) {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		background: var(--bg-sidebar);
		border-radius: 16px;
		border: 1px solid #ffffff !important;
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
		overflow: hidden;
	}

	:global(:fullscreen .camera-panel) {
		flex: 6;
		min-width: 0;
		min-height: auto;
	}

	:global(:fullscreen .camera-area) {
		flex: 1;
		aspect-ratio: auto;
		max-height: none;
	}

	:global(:fullscreen .log-panel) {
		flex: 4;
		border-left: none;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
		background: #ffffff;
		min-height: auto;
	}

	@media (min-width: 768px) {
		:global(:fullscreen .scanner-grid) {
			flex-direction: row;
		}

		:global(:fullscreen .log-panel) {
			border-top: none;
			border-left: 1px solid rgba(0, 0, 0, 0.1);
		}
	}

	:global(:fullscreen .controls) {
		bottom: 32px;
		left: 0;
		right: 0;
	}

	:global(:fullscreen .status-bar) {
		background: #ffffff;
	}

	:global(:fullscreen .status-text) {
		color: #800000;
	}

	:global(:fullscreen .log-header) {
		background: #ffffff;
		border-bottom-color: rgba(0, 0, 0, 0.1);
	}

	:global(:fullscreen .log-count) {
		background: var(--bg-primary);
		color: var(--text-secondary);
	}

	:global(:fullscreen .log-item) {
		border-bottom-color: rgba(0, 0, 0, 0.05);
	}

	/* Webkit prefix for Safari */
	:global(:-webkit-full-screen .sidebar) {
		display: none !important;
	}
	:global(:-webkit-full-screen .navbar) {
		display: none !important;
	}
	:global(:-webkit-full-screen .footer) {
		display: none !important;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.status-dot.scanning {
		background: #22c55e;
		animation: pulse-dot 1.5s ease-in-out infinite;
	}
	.status-dot.success {
		background: #4ade80;
	}
	.status-dot.error {
		background: #ef4444;
	}
	.status-dot.duplicate {
		background: #f59e0b;
		animation: pulse-dot 1s ease-in-out infinite;
	}

	.status-text {
		color: #800000;
		font-size: 13px;
		font-weight: 500;
	}

	.result-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 12px;
		width: 100%;
		max-width: 320px;
	}
	.result-row.success {
		background: rgba(34, 197, 94, 0.15);
		border: 1px solid rgba(34, 197, 94, 0.3);
	}
	.result-row.error {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
	}
	.result-row.duplicate {
		background: rgba(245, 158, 11, 0.15);
		border: 1px solid rgba(245, 158, 11, 0.4);
	}

	.result-emoji {
		font-size: 28px;
		flex-shrink: 0;
	}
	.result-info {
		min-width: 0;
	}
	.result-title {
		color: white;
		font-size: 14px;
		font-weight: 700;
	}
	.result-message {
		color: rgba(255, 255, 255, 0.5);
		font-size: 12px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* === Scan Log Panel === */
	.log-panel {
		display: flex;
		flex-direction: column;
		flex: 4;
		min-height: 250px;
		background: #fff;
		border-top: 1px solid var(--border-color);
	}

	.log-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-color);
		flex-shrink: 0;
	}

	.log-title {
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.log-count {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-secondary);
		background: var(--bg-primary);
		padding: 4px 10px;
		border-radius: 20px;
	}

	.log-list {
		flex: 1;
		overflow-y: auto;
		padding: 0;
	}

	.log-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		color: var(--text-secondary);
		gap: 8px;
	}
	.log-empty p {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.log-empty span {
		font-size: 12px;
		opacity: 0.7;
	}

	.log-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 20px;
		border-bottom: 1px solid var(--border-color);
		animation: fadeIn 0.3s ease-out forwards;
		opacity: 0;
	}

	.log-icon {
		font-size: 20px;
		flex-shrink: 0;
	}

	.log-details {
		flex: 1;
		min-width: 0;
	}

	.log-name {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.log-message {
		font-size: 12px;
		color: var(--text-secondary);
		margin-top: 2px;
	}

	.log-email {
		font-size: 11px;
		color: var(--text-secondary);
		margin-top: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		opacity: 0.75;
	}

	.log-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 40px 20px;
		color: var(--text-secondary);
		gap: 12px;
		font-size: 13px;
	}

	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border-color);
		border-top-color: #058743;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.log-time {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-secondary);
		white-space: nowrap;
		flex-shrink: 0;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes pulse-dot {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	/* Desktop: 70/30 grid */
	@media (min-width: 768px) {
		.scanner-grid {
			flex-direction: row;
		}

		.camera-panel {
			flex: 7;
			min-width: 0;
		}

		.camera-area {
			aspect-ratio: auto;
			max-height: none;
			flex: 1;
		}

		.log-panel {
			flex: 0 0 30%;
			min-height: auto;
			border-top: none;
			border-left: 1px solid var(--border-color);
		}

		.scan-focus {
			width: min(50%, 320px);
			height: min(50%, 320px);
		}
	}
</style>
