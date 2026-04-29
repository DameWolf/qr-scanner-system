<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';

	interface ScanEntry {
		name: string;
		email?: string;
		status: 'success' | 'error' | 'duplicate';
		message: string;
		time: string;
		isHistorical?: boolean;
		proofOfPayment?: string;
		scanType?: 'IN' | 'OUT' | '';
	}

	let html5Qrcode: any = null;
	let scannerStatus = $state<'scanning' | 'success' | 'error' | 'duplicate'>('scanning');
	let statusText = $state('Scanning...');
	let resultTitle = $state('');
	let resultMessage = $state('');
	let showResult = $state(false);
	let cameraActive = $state(false);
	let scanLocked = false;
	let lastScannedCode = '';
	let lastScannedTime = 0;
	let resumeTimer: ReturnType<typeof setTimeout> | null = null;
	let scanLog = $state<ScanEntry[]>([]);
	let loadingHistory = $state(true);
	let isFullscreen = $state(false);
	let facingMode = $state<'environment' | 'user'>('environment');

	// Payment Receipt Modal
	let showPaymentModal = $state(false);
	let selectedPaymentFileIds = $state<string[]>([]);
	let selectedPaymentOriginals = $state<string[]>([]);
	let paymentModalNote = $state<string | null>(null);
	let paymentModalName = $state<string>('');

	function isPaid(proof: string | null | undefined): boolean {
		return !!proof && proof !== 'NOT PAID';
	}

	function openPaymentModal(entry: ScanEntry) {
		const proof = entry.proofOfPayment;
		if (!isPaid(proof)) return;
		paymentModalName = entry.name;

		const rawParts = proof!
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		const urls: string[] = [];
		const fileIds: string[] = [];
		for (const part of rawParts) {
			const match = part.match(/id=([^&]+)/) || part.match(/\/d\/([a-zA-Z0-9_-]+)/);
			if (match && match[1]) {
				urls.push(part);
				fileIds.push(match[1]);
			}
		}

		selectedPaymentOriginals = urls;
		selectedPaymentFileIds = fileIds;
		paymentModalNote = urls.length === 0 ? proof! : null;
		showPaymentModal = true;
	}

	function closePaymentModal() {
		showPaymentModal = false;
		selectedPaymentFileIds = [];
		selectedPaymentOriginals = [];
		paymentModalNote = null;
		paymentModalName = '';
	}

	const RESUME_DELAY_MS = 2000;

	async function switchCamera() {
		if (scanLocked || !html5Qrcode) return;
		await stopCamera();
		facingMode = facingMode === 'environment' ? 'user' : 'environment';
		setTimeout(async () => {
			await startCamera();
		}, 100);
	}

	// Detect iOS Safari which doesn't support standard Fullscreen API
	const isIOS = browser && /iphone|ipad|ipod/i.test(navigator.userAgent);

	function toggleFullscreen() {
		if (isIOS) {
			// iOS fallback: toggle a CSS pseudo-fullscreen class on the root element
			isFullscreen = !isFullscreen;
			document.documentElement.classList.toggle('ios-fullscreen', isFullscreen);
			return;
		}
		const el = document.documentElement as any;
		if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
			if (el.requestFullscreen) el.requestFullscreen();
			else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
		} else {
			if (document.exitFullscreen) document.exitFullscreen();
			else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
		}
	}

	function onFullscreenChange() {
		isFullscreen = !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
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
				message: '',
				time: new Date(g.scanTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
				isHistorical: true,
				proofOfPayment: g.proofOfPayment || 'NOT PAID',
				scanType: g.statusOut === 'OUT' ? 'OUT' : 'IN'
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
		// Prevent duplicate callbacks for the same QR code within 5 seconds
		const now = Date.now();
		if (scanLocked || (decodedText === lastScannedCode && now - lastScannedTime < 5000)) return;
		scanLocked = true;
		lastScannedCode = decodedText;
		lastScannedTime = now;

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
				const isOut = data.scanType === 'OUT';
				scannerStatus = 'success';
				statusText = isOut ? 'Afternoon recorded!' : 'Attendance recorded!';
				resultTitle = data.name || 'Attendance Recorded';
				resultMessage = isOut ? 'Afternoon check-in successful' : 'Successfully checked in';

				scanLog = [
					{
						name: data.name || 'Unknown',
						status: 'success',
						message: '',
						time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
						proofOfPayment: data.proofOfPayment || 'NOT PAID',
						scanType: data.scanType || 'IN'
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
					statusText = 'Not Pre-registered';
					resultTitle = 'Not Pre-registered';
					resultMessage = 'This QR code is not on the guest list';

					scanLog = [
						{
							name: data.name || resultTitle,
							status: 'error',
							message: resultMessage,
							time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
						},
						...scanLog
					];
				} else if (
					msg.includes('already') ||
					msg.includes('duplicate') ||
					msg.includes('fully checked')
				) {
					// Extract name from message like "Already fully checked in: John Doe"
					const nameFromMsg = data.name || data.message?.split(': ').slice(1).join(': ') || '';
					scannerStatus = 'duplicate';
					statusText = 'Already Checked In!';
					resultTitle = 'Already Checked In';
					resultMessage = nameFromMsg
						? `${nameFromMsg} has already fully checked in`
						: 'This guest has already been scanned';

					scanLog = [
						{
							name: nameFromMsg || 'Already Checked In',
							status: 'duplicate',
							message: 'Already checked in',
							time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
							proofOfPayment: data.proofOfPayment || 'NOT PAID'
						},
						...scanLog
					];
				} else {
					scannerStatus = 'error';
					statusText = 'QR Not Recognized';
					resultTitle = 'QR Not Recognized';
					resultMessage = 'Could not process this QR code';

					scanLog = [
						{
							name: data.name || resultTitle,
							status: 'error',
							message: resultMessage,
							time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
						},
						...scanLog
					];
				}
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
					time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
		document.addEventListener('webkitfullscreenchange', onFullscreenChange);
	});

	onDestroy(() => {
		document.removeEventListener('fullscreenchange', onFullscreenChange);
		document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
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

						<div class="controls">
							<div class="status-bar">
								<span class="status-dot {scannerStatus}"></span>
								<span class="status-text">{statusText}</span>
							</div>

							{#if showResult && scannerStatus === 'error'}
								<div class="result-row {scannerStatus}">
									<span class="result-emoji">❌</span>
									<div class="result-info">
										<div class="result-title">{resultTitle}</div>
										<div class="result-message">{resultMessage}</div>
									</div>
								</div>
							{/if}
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
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="log-item"
								class:success={entry.status === 'success'}
								class:error={entry.status === 'error'}
								class:duplicate={entry.status === 'duplicate'}
								class:row-clickable={isPaid(entry.proofOfPayment)}
								style="animation-delay: {i * 0.03}s"
								onclick={() => isPaid(entry.proofOfPayment) && openPaymentModal(entry)}
							>
								<div class="log-icon">
									{#if entry.status === 'success'}
										<svg
											width="20"
											height="20"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="icon-success"
											><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline
												points="22 4 12 14.01 9 11.01"
											></polyline></svg
										>
									{:else if entry.status === 'duplicate'}
										<svg
											width="20"
											height="20"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="icon-duplicate"
											><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"
											></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg
										>
									{:else}
										<svg
											width="20"
											height="20"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="icon-error"
											><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"
											></line><line x1="9" y1="9" x2="15" y2="15"></line></svg
										>
									{/if}
								</div>
								<div class="log-details">
									<div class="log-name">{entry.name}</div>
									{#if entry.email}
										<div class="log-email">{entry.email}</div>
									{:else if entry.message && entry.status !== 'duplicate'}
										<div class="log-message">{entry.message}</div>
									{/if}
								</div>
								<div class="log-payment-col">
									{#if entry.proofOfPayment}
										{#if isPaid(entry.proofOfPayment)}
											<span class="log-payment paid">Paid</span>
										{:else}
											<span class="log-payment not-paid">Not Paid</span>
										{/if}
									{/if}
								</div>
								<div class="log-time" class:duplicate-time={entry.status === 'duplicate'}>
									{#if entry.status === 'duplicate'}
										Already checked in
									{:else if entry.scanType === 'OUT'}
										{entry.time} ·  OUT
									{:else if entry.scanType === 'IN'}
										{entry.time} · IN
									{:else}
										{entry.time}
									{/if}
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
	</div>
	<Footer />
</main>

{#if showPaymentModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={closePaymentModal}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>Proof of Payment</h3>
				<button class="modal-close-btn" onclick={closePaymentModal} aria-label="Close">✕</button>
			</div>
			{#if paymentModalName}
				<div class="modal-guest-name">{paymentModalName}</div>
			{/if}
			<div class="modal-body">
				{#if paymentModalNote}
					<div class="payment-modal-note">
						<p class="payment-note-label">Payment recorded</p>
						<p class="payment-note-value">{paymentModalNote}</p>
						<p class="payment-note-hint">No receipt or link was uploaded for this payment.</p>
					</div>
				{:else}
					{#each selectedPaymentFileIds as fileId, i}
						<div class="payment-preview-wrapper">
							<span class="payment-preview-label">
								{selectedPaymentFileIds.length > 1 ? `Receipt ${i + 1}` : 'Receipt'}
							</span>
							<img
								src="/api/drive-preview?id={encodeURIComponent(fileId)}"
								alt="Receipt {i + 1}"
								class="payment-preview-img"
							/>
							<a
								href={selectedPaymentOriginals[i]}
								target="_blank"
								rel="noopener noreferrer"
								class="payment-open-link"
							>
								Open in Google Drive ↗
							</a>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

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

	@media (min-width: 768px) and (min-aspect-ratio: 1/1) {
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
		position: relative;
		/* Base size for the scanner UI - capped at 220px on mobile to always leave room for the status text */
		--scan-size: min(70vw, 50vh, 220px);
	}

	@media (min-width: 768px) and (min-aspect-ratio: 1/1) {
		.camera-panel {
			/* On desktop/tablet, constrain it tightly within the smaller flex container */
			/* Using an absolute max of 280px guarantees it will never spill out or break the grid layout */
			--scan-size: min(60vw, 68vh, 280px);
		}
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
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 16px;
		box-sizing: border-box;
		transition: padding-top 0.3s ease;
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
		width: var(--scan-size);
		height: var(--scan-size);
		box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
		flex-shrink: 0;
		box-sizing: border-box;
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

	.controls {
		position: absolute;
		top: calc(50% + (var(--scan-size) / 2) + 8px);
		width: var(--scan-size);
		max-width: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		z-index: 10;
		pointer-events: auto;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.status-bar {
		background: rgba(255, 255, 255, 0.96);
		border-radius: 100px;
		padding: 8px 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		box-sizing: border-box;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
	}

	/* Added safe area padding for modern mobile notches inside fullscreen */
	:global(:fullscreen .fullscreen-btn),
	:global(:fullscreen .switch-camera-btn) {
		top: calc(16px + env(safe-area-inset-top));
	}

	.fullscreen-btn {
		position: absolute;
		top: 12px;
		left: 12px;
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
		top: 12px;
		right: 12px;
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

	@media (min-width: 768px) {
		.fullscreen-btn {
			top: 20px;
			left: 20px;
		}
		.switch-camera-btn {
			top: 20px;
			right: 20px;
		}
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
		padding: 0 !important;
		box-sizing: border-box;
		background: #2a0000 !important;
	}

	@media (min-width: 768px) {
		:global(:fullscreen .content) {
			padding: 20px !important;
		}
	}

	:global(:fullscreen .page-container) {
		padding: 0 !important;
		max-width: 100% !important;
		height: 100%;
	}

	:global(:fullscreen .scanner-grid) {
		display: flex;
		flex-direction: column;
		flex: 1;
		height: 100%;
		background: var(--bg-sidebar);
		border-radius: 16px !important;
		border: 1px solid #ffffff !important;
		box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6) !important;
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
		border-left: none !important;
		border-top: 1px solid rgba(0, 0, 0, 0.1) !important;
		background: #ffffff !important;
		min-height: auto !important;
	}

	@media (min-width: 768px) {
		:global(:fullscreen .scanner-grid) {
			flex-direction: row;
		}

		:global(:fullscreen .log-panel) {
			border-top: none !important;
			border-left: 1px solid rgba(0, 0, 0, 0.1) !important;
		}
	}

	:global(:fullscreen .controls) {
		position: absolute !important;
		top: calc(50% + (var(--scan-size) / 2) + 8px) !important;
		width: var(--scan-size) !important;
		display: flex !important;
		flex-direction: column !important;
		align-items: center !important;
		z-index: 10 !important;
	}

	:global(:fullscreen .status-bar) {
		background: rgba(255, 255, 255, 0.96) !important;
		border-radius: 100px !important;
		width: 100% !important;
		padding: 8px 20px !important;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25) !important;
		gap: 10px !important;
		display: flex !important;
		align-items: center !important;
		justify-content: center !important;
	}

	:global(:fullscreen .status-text) {
		color: #1a1a1a !important;
		font-weight: 600 !important;
		text-shadow: none !important;
	}

	/* === iOS Safari pseudo-fullscreen (CSS fallback) === */
	:global(.ios-fullscreen .sidebar) {
		display: none !important;
	}
	:global(.ios-fullscreen .navbar) {
		display: none !important;
	}
	:global(.ios-fullscreen .footer) {
		display: none !important;
	}
	:global(.ios-fullscreen .content) {
		position: fixed !important;
		inset: 0 !important;
		z-index: 9999 !important;
		width: 100vw !important;
		height: 100dvh !important;
		padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0 !important;
		background: #000 !important;
		box-sizing: border-box !important;
		display: flex !important;
		flex-direction: column !important;
	}
	:global(.ios-fullscreen .page-container) {
		padding: 0 !important;
		max-width: 100% !important;
		height: 100%;
	}
	:global(.ios-fullscreen .scanner-grid) {
		display: flex !important;
		flex-direction: column !important;
		flex: 1 !important;
		height: 100% !important;
		background: #000 !important;
		border-radius: 0 !important;
		border: none !important;
		overflow: hidden !important;
	}
	:global(.ios-fullscreen .log-panel) {
		display: none !important;
	}
	:global(.ios-fullscreen .camera-panel) {
		flex: 1 !important;
		min-height: 0 !important;
	}
	:global(.ios-fullscreen .camera-area) {
		flex: 1 !important;
		aspect-ratio: auto !important;
		max-height: none !important;
	}

	:global(:fullscreen .log-header) {
		background: #ffffff !important;
		border-bottom-color: rgba(0, 0, 0, 0.1) !important;
	}

	:global(:fullscreen .log-count) {
		background: #f1f5f9 !important;
		color: #64748b !important;
	}

	:global(:fullscreen .log-title) {
		color: #0f172a !important;
	}

	:global(:fullscreen .log-empty) {
		color: #64748b !important;
	}

	:global(:fullscreen .log-empty p) {
		color: #334155 !important;
	}

	:global(:fullscreen .log-name) {
		color: #0f172a !important;
	}

	:global(:fullscreen .log-message),
	:global(:fullscreen .log-time),
	:global(:fullscreen .log-email) {
		color: #64748b !important;
	}

	:global(:fullscreen .log-item) {
		border-bottom-color: rgba(0, 0, 0, 0.05) !important;
	}

	/* === Status Dot === */
	.status-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		display: inline-block;
		background: rgba(255, 255, 255, 0.5);
		flex-shrink: 0;
	}

	.status-dot.scanning {
		background: #22c55e;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.status-dot.success {
		background: #22c55e;
	}

	.status-dot.error {
		background: #ef4444;
	}

	.status-dot.duplicate {
		background: #f59e0b;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	.status-text {
		color: #1a1a1a;
		font-size: 14px;
		font-weight: 600;
	}

	/* === Result Row === */
	.result-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 12px;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.1);
		width: 100%;
		box-sizing: border-box;
	}

	.result-row.error {
		border-color: rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.15);
	}

	.result-row.duplicate {
		border-color: rgba(245, 158, 11, 0.4);
		background: rgba(245, 158, 11, 0.15);
	}

	.result-emoji {
		font-size: 22px;
		line-height: 1;
		flex-shrink: 0;
	}

	.result-info {
		flex: 1;
		min-width: 0;
	}

	.result-title {
		font-size: 13px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-message {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		margin-top: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* === Log Panel === */
	.log-panel {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary);
		border-top: 1px solid var(--border-color);
		flex: 4;
		min-height: 0;
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
		font-size: 15px;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.log-count {
		font-size: 12px;
		color: var(--text-muted);
		background: var(--bg-tertiary, rgba(0, 0, 0, 0.05));
		padding: 3px 8px;
		border-radius: 20px;
	}

	.log-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px 0;
	}

	.log-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 40px 20px;
		color: var(--text-muted);
		font-size: 13px;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border-color);
		border-top-color: var(--accent-color, #800000);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.log-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 48px 20px;
		color: var(--text-muted);
		text-align: center;
	}

	.log-empty svg {
		opacity: 0.3;
	}

	.log-empty p {
		font-size: 14px;
		font-weight: 600;
		margin: 0;
		color: var(--text-secondary);
	}

	.log-empty span {
		font-size: 12px;
	}

	.log-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 20px;
		border-bottom: 1px solid var(--border-color);
		animation: slideIn 0.3s ease both;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.log-icon {
		width: 36px;
		height: 36px;
		min-width: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.05);
	}

	.log-item.success .log-icon {
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
	}

	.log-item.error .log-icon {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}

	.log-item.duplicate .log-icon {
		background: rgba(245, 158, 11, 0.1);
		color: #f59e0b;
	}

	.icon-success {
		color: #22c55e;
	}

	.icon-error {
		color: #ef4444;
	}

	.icon-duplicate {
		color: #f59e0b;
	}

	.log-details {
		flex: 1 1 0;
		min-width: 0;
	}

	.log-payment-col {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: clamp(72px, 13%, 96px);
	}

	.log-name {
		font-size: 13px;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.log-email,
	.log-message {
		font-size: 11px;
		color: var(--text-muted);
		margin-top: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.log-item.row-clickable {
		cursor: pointer;
	}

	.log-item.row-clickable:hover {
		background: rgba(0, 0, 0, 0.025);
	}

	.log-payment {
		font-size: 10px;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 6px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.log-payment.paid {
		background: rgba(34, 197, 94, 0.1);
		color: #16a34a;
	}

	.log-payment.not-paid {
		background: rgba(239, 68, 68, 0.08);
		color: #dc2626;
	}

	/* ── Payment Receipt Modal ── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.modal-content {
		background: #fff;
		border-radius: 16px;
		width: 100%;
		max-width: 480px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 12px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		flex-shrink: 0;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary, #111827);
	}

	.modal-guest-name {
		padding: 8px 20px 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-secondary, #6b7280);
		flex-shrink: 0;
	}

	.modal-close-btn {
		background: none;
		border: none;
		font-size: 18px;
		cursor: pointer;
		color: var(--text-muted, #9ca3af);
		padding: 4px 8px;
		border-radius: 6px;
		transition: background 0.15s;
		font-family: inherit;
	}

	.modal-close-btn:hover {
		background: rgba(0, 0, 0, 0.06);
	}

	.modal-body {
		padding: 16px 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		flex: 1;
		min-height: 0;
	}

	.payment-modal-note {
		padding: 20px 0;
		text-align: center;
	}

	.payment-note-label {
		margin: 0 0 8px;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-secondary, #6b7280);
	}

	.payment-note-value {
		margin: 0 0 12px;
		font-size: 18px;
		font-weight: 700;
		color: var(--text-primary, #111827);
	}

	.payment-note-hint {
		margin: 0;
		font-size: 14px;
		color: var(--text-secondary, #6b7280);
		line-height: 1.5;
	}

	.payment-preview-wrapper {
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex: 1;
		min-height: 0;
	}

	.payment-preview-label {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary, #111827);
		flex-shrink: 0;
	}

	.payment-preview-img {
		width: 100%;
		object-fit: contain;
		border-radius: 8px;
		background: #fafafa;
		display: block;
		max-height: 60vh;
	}

	.payment-open-link {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px 16px;
		font-size: 14px;
		font-weight: 600;
		color: #800000;
		background: rgba(128, 0, 0, 0.05);
		border-radius: 8px;
		text-decoration: none;
		transition: background 0.2s;
		flex-shrink: 0;
	}

	.payment-open-link:hover {
		background: rgba(128, 0, 0, 0.1);
	}

	.log-time {
		flex: 1 1 0;
		min-width: 0;
		font-size: 11px;
		color: var(--text-muted);
		text-align: right;
	}

	.log-time.duplicate-time {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-muted);
	}
</style>
