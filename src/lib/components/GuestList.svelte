<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, onDestroy } from 'svelte';
	import * as XLSX from 'xlsx';


	interface Guest {
		name: string;
		email: string;
		type: string;
		category: string;
		certId: string;
		scanTime: string | null;
		signoutTime: string | null;
		attended: boolean;
		proofOfPayment: string;
		statusOut: string;
		scanTimeOut: string | null;
		isHighlighted: boolean;
	}

	let guests = $state<Guest[]>([]);
	let loading = $state(true);
	let refreshing = $state(false);
	let filter = $state('all');
	let typeFilter = $state('all');
	let sort = $state('newest');
	let pageSize = $state(25);
	let search = $state('');
	let searchFocused = $state(false);
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let showFilters = $state(false);
	let paymentFilter = $state('all');

	// Payment Modal State
	let showPaymentModal = $state(false);
	let selectedPaymentImages = $state<string[]>([]);
	let selectedPaymentOriginals = $state<string[]>([]);
	let selectedPaymentFileIds = $state<string[]>([]);
	let paymentModalNote = $state<string | null>(null);
	let guestForPayment = $state<Guest | null>(null);
	let approvingCertId = $state<string | null>(null);
	let revokingCertId = $state<string | null>(null);
	let showSuccessToast = $state(false);
	let successToastMessage = $state('');
	let updatingStatusCertId = $state<string | null>(null);
	let clearingAllStatus = $state(false);
	let showReportModal = $state(false);
	let generatingReport = $state<'pdf' | 'xlsx' | null>(null);

	// Mark as Paid modal (for Not Paid → open modal → Mark as Paid)
	let showMarkPaidModal = $state(false);
	let guestForMarkPaid = $state<Guest | null>(null);

	function openMarkPaidModal(guest: Guest) {
		guestForMarkPaid = guest;
		showMarkPaidModal = true;
	}

	function closeMarkPaidModal() {
		showMarkPaidModal = false;
		guestForMarkPaid = null;
	}

	function showSuccessNotification(message: string) {
		successToastMessage = message;
		showSuccessToast = true;
		setTimeout(() => {
			showSuccessToast = false;
		}, 3000);
	}

	// Generic confirmation dialog
	let showConfirmDialog = $state(false);
	let confirmDialogTitle = $state('');
	let confirmDialogMessage = $state('');
	let confirmDialogBtnLabel = $state('');
	let confirmDialogVariant = $state<'danger' | 'success'>('danger');
	let confirmDialogPending = $state(false);
	let confirmDialogOnConfirm = $state<(() => void | Promise<void>) | null>(null);

	function openConfirmDialog(opts: {
		title: string;
		message: string;
		btnLabel: string;
		variant?: 'danger' | 'success';
		onConfirm: () => void | Promise<void>;
	}) {
		confirmDialogTitle = opts.title;
		confirmDialogMessage = opts.message;
		confirmDialogBtnLabel = opts.btnLabel;
		confirmDialogVariant = opts.variant ?? 'danger';
		confirmDialogOnConfirm = opts.onConfirm;
		confirmDialogPending = false;
		showConfirmDialog = true;
	}

	function closeConfirmDialog() {
		showConfirmDialog = false;
		confirmDialogPending = false;
		confirmDialogOnConfirm = null;
	}

	function isPaid(proof: string | null | undefined): boolean {
		return !!proof && proof !== 'NOT PAID';
	}

	function openPaymentModal(guest: Guest) {
		const proof = guest.proofOfPayment;
		if (!isPaid(proof)) return;
		guestForPayment = guest;

		const rawParts = proof
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		const urls: string[] = [];
		const previewUrls: string[] = [];
		const fileIds: string[] = [];
		for (const part of rawParts) {
			const match = part.match(/id=([^&]+)/) || part.match(/\/d\/([a-zA-Z0-9_-]+)/);
			if (match && match[1]) {
				urls.push(part);
				previewUrls.push(`https://drive.google.com/file/d/${match[1]}/preview`);
				fileIds.push(match[1]);
			}
		}

		selectedPaymentOriginals = urls;
		selectedPaymentImages = previewUrls;
		selectedPaymentFileIds = fileIds;
		paymentModalNote = urls.length === 0 ? proof : null;
		showPaymentModal = true;
	}

	function closePaymentModal() {
		showPaymentModal = false;
		guestForPayment = null;
		selectedPaymentImages = [];
		selectedPaymentOriginals = [];
		selectedPaymentFileIds = [];
		paymentModalNote = null;
	}

	async function markAsPaidCash(guest: Guest) {
		if (!guest.certId) return;
		approvingCertId = guest.certId;
		try {
			const res = await fetch('/api/approve-payment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ certId: guest.certId })
			});
			const data = await res.json();
			if (data.success) {
				closeMarkPaidModal();
				await loadGuests();
			} else {
				alert(data.message || 'Failed to mark as paid');
			}
		} catch (e) {
			console.error(e);
			alert('Failed to mark as paid');
		} finally {
			approvingCertId = null;
		}
	}

	async function markAsNotPaid(guest: Guest) {
		if (!guest.certId) return;

		revokingCertId = guest.certId;
		try {
			const res = await fetch('/api/revoke-payment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ certId: guest.certId })
			});
			const data = await res.json();
			if (data.success) {
				closePaymentModal();
				await loadGuests();
			} else {
				console.error(data.message || 'Failed to mark as not paid');
			}
		} catch (e) {
			console.error('Failed to mark as not paid', e);
		} finally {
			revokingCertId = null;
		}
	}

	// ── Report Download ──────────────────────────────────────────────

	function getFamilyName(fullName: string): string {
		// Extract last word of the full name as the family name for sorting
		const parts = fullName.trim().split(/\s+/);
		return parts[parts.length - 1]?.toLowerCase() ?? '';
	}

	function formatDatetime(iso: string | null): string {
		if (!iso) return '';
		try {
			const d = new Date(iso);
			if (isNaN(d.getTime())) return iso;
			return d.toLocaleString('en-US', {
				year: 'numeric',
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				hour12: true
			});
		} catch {
			return iso;
		}
	}

	function formatPayment(proof: string): string {
		if (!proof || proof === 'NOT PAID') return 'Not Paid';
		if (proof === 'CASH PAID ONSITE') return 'Cash (Onsite)';
		return 'Paid';
	}

	function buildReportRows() {
		return [...guests]
			.sort((a, b) => getFamilyName(a.name).localeCompare(getFamilyName(b.name)))
			.map((g, idx) => ({
				'#': idx + 1,
				'Full Name': g.name,
				'Email': g.email,
				'Category': g.category || g.type || '',
				'Payment': formatPayment(g.proofOfPayment),
				'Check-In Time': formatDatetime(g.scanTime),
				'Check-Out Time': formatDatetime(g.scanTimeOut)
			}));
	}

	function downloadXLSX() {
		generatingReport = 'xlsx';
		try {
			const rows = buildReportRows();
			const ws = XLSX.utils.json_to_sheet(rows);

			// Set column widths
			ws['!cols'] = [
				{ wch: 4 },  // #
				{ wch: 30 }, // Full Name
				{ wch: 32 }, // Email
				{ wch: 14 }, // Category
				{ wch: 14 }, // Payment
				{ wch: 22 }, // Check-In Time
				{ wch: 22 }  // Check-Out Time
			];

			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Attendance Report');
			XLSX.writeFile(wb, 'attendance_report.xlsx');
			showReportModal = false;
		} finally {
			generatingReport = null;
		}
	}

	function downloadPDF() {
		generatingReport = 'pdf';
		try {
			const rows = buildReportRows();
			const now = new Date().toLocaleString('en-US', {
				year: 'numeric', month: 'long', day: '2-digit',
				hour: '2-digit', minute: '2-digit', hour12: true
			});

			const tableRows = rows
				.map(
					(r) =>
						`<tr>
							<td>${r['#']}</td>
							<td>${r['Full Name']}</td>
							<td>${r['Email']}</td>
							<td>${r['Category']}</td>
							<td class="pay-${r['Payment'].toLowerCase().replace(/[^a-z]/g, '')}">${r['Payment']}</td>
							<td>${r['Check-In Time'] || '—'}</td>
							<td>${r['Check-Out Time'] || '—'}</td>
						</tr>`
				)
				.join('');

			const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Attendance Report</title>
<style>
  @page { size: landscape; margin: 18mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #222; }
  .report-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; border-bottom: 2px solid #800000; padding-bottom: 8px; }
  .report-title { font-size: 18px; font-weight: bold; color: #800000; }
  .report-meta { font-size: 9px; color: #666; text-align: right; }
  .report-meta span { display: block; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #800000; color: white; }
  thead th { padding: 7px 8px; text-align: left; font-size: 9.5px; font-weight: 700; letter-spacing: 0.3px; }
  tbody tr:nth-child(even) { background: #fff0f0; }
  tbody tr:nth-child(odd) { background: #ffffff; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f0c0c0; font-size: 9.5px; vertical-align: top; }
  .pay-notpaid { color: #b91c1c; font-weight: 600; }
  .pay-paid, .pay-cashonsite { color: #166534; font-weight: 600; }
  .total-row { margin-top: 10px; font-size: 10px; color: #666; }
</style>
</head>
<body>
  <div class="report-header">
    <div>
      <div class="report-title">Attendance Report</div>
      <div style="font-size:10px;color:#555;margin-top:2px;">Sorted A–Z by Family Name</div>
    </div>
    <div class="report-meta">
      <span>Generated: ${now}</span>
      <span>Total Registrants: ${rows.length}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th style="width:22%">Full Name</th>
        <th style="width:24%">Email</th>
        <th style="width:10%">Category</th>
        <th style="width:10%">Payment</th>
        <th style="width:17%">Check-In Time</th>
        <th style="width:17%">Check-Out Time</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="total-row">Total: ${rows.length} registrant(s)</div>
</body>
</html>`;

			const win = window.open('', '_blank');
			if (win) {
				win.document.write(html);
				win.document.close();
				win.focus();
				setTimeout(() => { win.print(); }, 600);
			}
			showReportModal = false;
		} finally {
			generatingReport = null;
		}
	}

	async function updateGuestStatus(guest: Guest, newStatus: 'NONE' | 'IN' | 'OUT', event: Event) {
		event.stopPropagation();
		if (!guest.certId || updatingStatusCertId === guest.certId) return;

		updatingStatusCertId = guest.certId;
		try {
			const res = await fetch('/api/update-status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ certId: guest.certId, newStatus })
			});
			const data = await res.json();
			if (data.success) {
				// Optimistically update local state so UI responds instantly
				guest.attended = newStatus !== 'NONE';
				guest.statusOut = newStatus === 'OUT' ? 'OUT' : '';
				const label = newStatus === 'NONE' ? 'None' : newStatus === 'OUT' ? 'IN & OUT' : 'IN';
				showSuccessNotification(`Status updated to ${label} for ${guest.name}`);
				// Refresh from server to sync timestamps
				await loadGuests();
			} else {
				alert(data.message || 'Failed to update status');
			}
		} catch (e) {
			console.error('Failed to update status', e);
			alert('Failed to update status');
		} finally {
			updatingStatusCertId = null;
		}
	}

	async function clearAllStatus() {
		if (!confirm(`Are you sure you want to clear the attendance status for ALL registrants? This will reset everyone to "Not Attended" and clear their check-in times.\n\nThis action cannot be undone.`)) {
			return;
		}

		clearingAllStatus = true;
		try {
			const res = await fetch('/api/clear-all-status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const data = await res.json();
			if (data.success) {
				showSuccessNotification('All attendance statuses have been cleared.');
				await loadGuests();
			} else {
				alert(data.message || 'Failed to clear statuses');
			}
		} catch (e) {
			console.error('Failed to clear statuses', e);
			alert('Failed to clear statuses. Check console for details.');
		} finally {
			clearingAllStatus = false;
		}
	}

	let attendedCount = $derived(guests.filter((g) => g.attended).length);
	let totalCount = $derived(guests.length);

	// Derive unique participant types from data (only show type filter when >1 type exists)
	let participantTypes = $derived.by(() => {
		const types = new Set(guests.map((g) => g.type).filter(Boolean));
		return Array.from(types).sort();
	});
	let hasMultipleTypes = $derived(participantTypes.length > 1);

	// Pagination
	let currentPage = $state(1);

	let searchSuggestions = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return [];
		return guests
			.filter(
				(g) =>
					(g.name && g.name.toLowerCase().includes(q)) ||
					(g.email && g.email.toLowerCase().includes(q))
			)
			.slice(0, 5); // top 5 matches
	});

	let filteredGuests = $derived.by(() => {
		// Capture original registration order as a stable sort fallback
		const origIdx = new Map<Guest, number>(guests.map((g, i) => [g, i]));
		let list = [...guests];

		// Type filter
		if (typeFilter !== 'all') {
			list = list.filter((g) => g.type === typeFilter);
		}

		// Attendance filter
		if (filter === 'attended') {
			list = list.filter((g) => g.attended);
		} else if (filter === 'notyet') {
			list = list.filter((g) => !g.attended);
		}

		// Payment filter
		if (paymentFilter === 'paid') {
			list = list.filter((g) => isPaid(g.proofOfPayment));
		} else if (paymentFilter === 'notpaid') {
			list = list.filter((g) => !isPaid(g.proofOfPayment));
		} else if (paymentFilter === 'validated') {
			list = list.filter((g) => g.isHighlighted);
		}

		// Search filter
		const q = search.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(g) =>
					(g.name && g.name.toLowerCase().includes(q)) ||
					(g.email && g.email.toLowerCase().includes(q))
			);
		}

		// Sort
		if (sort === 'newest') {
			list.sort((a, b) => {
				// Both attended: newest scan time first
				if (a.scanTime && b.scanTime)
					return new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime();
				// Attended before unattended
				if (a.scanTime) return -1;
				if (b.scanTime) return 1;
				// Both unattended: newest registration first (reverse original row order)
				return (origIdx.get(b) ?? 0) - (origIdx.get(a) ?? 0);
			});
		} else if (sort === 'oldest') {
			list.sort((a, b) => {
				// Both attended: oldest scan time first
				if (a.scanTime && b.scanTime)
					return new Date(a.scanTime).getTime() - new Date(b.scanTime).getTime();
				// Attended before unattended
				if (a.scanTime) return -1;
				if (b.scanTime) return 1;
				// Both unattended: oldest registration first (original row order)
				return (origIdx.get(a) ?? 0) - (origIdx.get(b) ?? 0);
			});
		} else {
			// Default: attended first (newest scan on top), then unattended
			list.sort((a, b) => {
				if (a.attended && !b.attended) return -1;
				if (!a.attended && b.attended) return 1;
				if (a.attended && b.attended) {
					if (!a.scanTime) return 1;
					if (!b.scanTime) return -1;
					return new Date(b.scanTime).getTime() - new Date(a.scanTime).getTime();
				}
				return 0;
			});
		}

		return list;
	});

	let totalPages = $derived(Math.max(1, Math.ceil(filteredGuests.length / pageSize)));
	let pagedGuests = $derived(
		filteredGuests.slice((currentPage - 1) * pageSize, currentPage * pageSize)
	);

	// Reset to page 1 when any filter/sort/pageSize/search changes
	$effect(() => {
		filter;
		typeFilter;
		paymentFilter;
		sort;
		pageSize;
		search;
		currentPage = 1;
	});

	function goToPage(page: number) {
		currentPage = Math.max(1, Math.min(page, totalPages));
	}

	function selectSuggestion(guest: Guest) {
		search = guest.name; // Fill search with the exact name
		searchFocused = false;
	}

	export async function loadGuests() {
		if (!loading) refreshing = true;
		try {
			const response = await fetch('/api/attendees');
			const data = await response.json();

			if (data.success) {
				const attendedMap = new Map<string, any>();
				if (data.attendees) {
					for (const a of data.attendees) {
						const key = (a.email || a.name || '').toLowerCase();
						attendedMap.set(key, a);
					}
				}

				if (data.registered && data.registered.length > 0) {
					guests = data.registered.map((r: any) => {
						const key = (r.email || r.name || '').toLowerCase();
						const match = attendedMap.get(key);
						return {
							name: r.name || '',
							email: r.email || '',
							type: (r.type || r.participantType || r.category || '').trim(),
							category: r.category || '',
							certId: r.certId || '',
							scanTime: (match ? match.scanTime || null : null) || r.scanTime || null,
							attended:
								!!match || r.status === 'ATTENDED' || r.status === 'IN' || r.status === 'OUT',
							proofOfPayment: r.proofOfPayment || 'NOT PAID',
							statusOut: r.statusOut || (match ? match.statusOut || '' : ''),
							scanTimeOut: match ? match.scanTimeOut || null : null,
							isHighlighted: !!r.isHighlighted
						};
					});
				} else if (data.attendees) {
					guests = data.attendees.map((a: any) => ({
						name: a.name || '',
						email: a.email || '',
						type: (a.type || a.participantType || a.category || '').trim(),
						category: a.category || '',
						certId: a.certId || '',
						scanTime: a.scanTime || null,
						attended: true,
						proofOfPayment: a.proofOfPayment || 'NOT PAID',
						statusOut: a.statusOut || '',
						scanTimeOut: a.scanTimeOut || null,
						isHighlighted: !!a.isHighlighted
					}));
				}
			}
		} catch (err) {
			console.error('Failed to load guests:', err);
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	function formatTimeMobile(time: string | null): string {
		if (!time) return '—';
		try {
			const d = new Date(time);
			if (isNaN(d.getTime())) return time;
			return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
		} catch {
			return time;
		}
	}

	function formatTimeDesktop(time: string | null): string {
		if (!time) return '—';
		try {
			const d = new Date(time);
			if (isNaN(d.getTime())) return time;
			return d.toLocaleString();
		} catch {
			return time;
		}
	}

	onMount(() => {
		loadGuests();
		intervalId = setInterval(loadGuests, 30000);
	});

	onDestroy(() => {
		if (intervalId) clearInterval(intervalId);
	});
</script>

<div class="page-layout">
	<div class="main-section">
		<div class="attendee-panel">
			<div class="panel-header">
				<div class="header-left">
					<h2 class="panel-title">Guest List</h2>
					<span class="count-badge">{attendedCount}/{totalCount}</span>
				</div>
				<div class="header-right">
					<div class="header-actions">
						<button
							class="send-all-btn clear-all-btn"
							disabled={clearingAllStatus}
							onclick={clearAllStatus}
							aria-label="Clear All Status"
							title="Clear attendance for all guests"
						>
							{#if clearingAllStatus}
								<span class="btn-spinner"></span>
								Clearing...
							{:else}
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M3 6h18"/>
									<path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
									<line x1="10" y1="11" x2="10" y2="17"/>
									<line x1="14" y1="11" x2="14" y2="17"/>
								</svg>
								Clear All Status
							{/if}
						</button>

						<button

						<button
							class="download-report-btn"
							onclick={() => (showReportModal = true)}
							aria-label="Download Attendance Report"
						>
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
								<polyline points="7 10 12 15 17 10"/>
								<line x1="12" y1="15" x2="12" y2="3"/>
							</svg>
							Download Report
						</button>
					</div>
				</div>
			</div>

			<div class="action-bar-row">
				<div class="search-container">
					<div class="search-field" class:focused={searchFocused}>
						<svg
							class="search-icon"
							width="15"
							height="15"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<circle cx="11" cy="11" r="8" />
							<line x1="21" y1="21" x2="16.65" y2="16.65" />
						</svg>
						<input
							class="search-input"
							type="search"
							placeholder="Search name or email…"
							bind:value={search}
							onfocus={() => (searchFocused = true)}
							onblur={() => setTimeout(() => (searchFocused = false), 150)}
						/>
						{#if search}
							<button
								class="search-clear"
								onclick={() => {
									search = '';
									searchFocused = true;
								}}
								aria-label="Clear search"
							>
								<svg
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
								>
									<line x1="18" y1="6" x2="6" y2="18" />
									<line x1="6" y1="6" x2="18" y2="18" />
								</svg>
							</button>
						{/if}
					</div>

					{#if searchFocused && search.trim() && searchSuggestions.length > 0}
						<div class="search-dropdown">
							{#each searchSuggestions as suggestion}
								<button class="suggestion-item" onmousedown={() => selectSuggestion(suggestion)}>
									<div class="suggestion-name">{suggestion.name}</div>
									{#if suggestion.email}
										<div class="suggestion-email">{suggestion.email}</div>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<div class="filters-inline">
					<select class="filter-select integrated" bind:value={filter}>
						<option value="all">Status: All</option>
						<option value="attended">Status: Attended</option>
						<option value="notyet">Status: Not Yet</option>
					</select>
					<select class="filter-select integrated" bind:value={sort}>
						<option value="newest">Sort: Newest</option>
						<option value="oldest">Sort: Oldest</option>
					</select>
					<select class="filter-select integrated" bind:value={paymentFilter}>
						<option value="all">Registration: All</option>
						<option value="validated">Registration: Validated (Green)</option>
						<option value="paid">Registration: Paid/Attached</option>
						<option value="notpaid">Registration: Not Paid</option>
					</select>
					<button
						class="refresh-btn inline"
						class:spinning={refreshing}
						onclick={() => loadGuests()}
						aria-label="Refresh"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="#800000">
							<path
								d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
							/>
						</svg>
					</button>
				</div>
			</div>

			{#if hasMultipleTypes}
				<div class="type-filter-bar">
					<button
						class="type-pill"
						class:active={typeFilter === 'all'}
						onclick={() => (typeFilter = 'all')}>All</button
					>
					{#each participantTypes as ptype}
						<button
							class="type-pill"
							class:active={typeFilter === ptype}
							onclick={() => (typeFilter = ptype)}>{ptype}</button
						>
					{/each}
				</div>
			{/if}

			<div class="panel-body">
				{#if loading}
					<div class="loading-state">
						<div class="spinner"></div>
						<p>Loading attendees...</p>
					</div>
				{:else if filteredGuests.length === 0}
					<div class="empty-state">
						<svg
							width="40"
							height="40"
							viewBox="0 0 24 24"
							fill="none"
							stroke="rgba(128,0,0,0.3)"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
							<circle cx="9" cy="7" r="4" />
							<path d="M23 21v-2a4 4 0 00-3-3.87" />
							<path d="M16 3.13a4 4 0 010 7.75" />
						</svg>
						<p>No guests found</p>
					</div>
				{:else}
					<div class="table-scroll">
						<table class="guest-table">
							<thead>
								<tr>
									<th class="col-num">#</th>
									<th class="col-name">Name</th>
									<th class="col-payment">Payment</th>
									<th class="col-category">Category</th>
									<th class="col-time">Time</th>
									<th class="col-status">Status</th>
									<th class="col-signout">ATTENDED</th>
								</tr>
							</thead>
							<tbody>
								{#each pagedGuests as guest, i}
									<tr
										class="row-clickable"
										class:row-registered={guest.certId && !guest.attended}
										class:row-attended={guest.attended}
										onclick={() =>
											isPaid(guest.proofOfPayment)
												? openPaymentModal(guest)
												: openMarkPaidModal(guest)}
									>
										<td class="col-num" data-index="{(currentPage - 1) * pageSize + i + 1}. ">
											{(currentPage - 1) * pageSize + i + 1}
										</td>
										<td class="col-name">
											<div class="guest-name" data-index="{(currentPage - 1) * pageSize + i + 1}. ">
												{guest.name}
												{#if guest.isHighlighted}
													<span class="validated-indicator" title="Validated (Green Highlight)">
														<svg
															width="12"
															height="12"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="4"
															stroke-linecap="round"
															stroke-linejoin="round"
														>
															<polyline points="20 6 9 17 4 12" />
														</svg>
													</span>
												{/if}
											</div>
											{#if guest.email}
												<div class="guest-email">{guest.email}</div>
											{/if}
										</td>
										<td class="col-payment">
											{#if isPaid(guest.proofOfPayment)}
												<span class="payment-badge paid">Paid</span>
											{:else}
												<span class="payment-badge not-paid">Not Paid</span>
											{/if}
										</td>
										<td class="col-category">
											{#if guest.category === 'Member'}
												<span class="category-badge member">Member</span>
											{:else if guest.category === 'Non-Member'}
												<span class="category-badge non-member">Non-Member</span>
											{:else if guest.category === 'Student'}
												<span class="category-badge student">Student</span>
											{:else}
												<span class="category-badge unknown">{guest.category || '—'}</span>
											{/if}
										</td>
										<td class="col-time">
											<span class="time-mobile">{formatTimeMobile(guest.scanTime)}</span>
											<span class="time-desktop">{formatTimeDesktop(guest.scanTime)}</span>
										</td>
										<td class="col-status">
											<select
												class="status-select"
												class:status-none={!guest.attended}
												class:status-in={guest.attended && guest.statusOut !== 'OUT'}
												class:status-out={guest.attended && guest.statusOut === 'OUT'}
												disabled={updatingStatusCertId === guest.certId}
												value={!guest.attended ? 'NONE' : guest.statusOut === 'OUT' ? 'OUT' : 'IN'}
												onchange={(e) => updateGuestStatus(guest, (e.currentTarget as HTMLSelectElement).value as 'NONE' | 'IN' | 'OUT', e)}
												onclick={(e) => e.stopPropagation()}
											>
												<option value="NONE">None</option>
												<option value="IN">IN</option>
												<option value="OUT">IN &amp; OUT</option>
											</select>
											{#if updatingStatusCertId === guest.certId}
												<span class="status-saving">saving…</span>
											{/if}
										</td>
										<td class="col-signout">
											{#if guest.statusOut === 'OUT'}
												<span class="signout-badge signed-out">Yes</span>
											{:else}
												<span class="signout-badge not-signed-out">No</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<div
				class="pagination"
				style:visibility={!loading && filteredGuests.length > 0 ? 'visible' : 'hidden'}
			>
				<div class="pagination-left">
					<span class="rows-label">Rows</span>
					<select class="rows-select" bind:value={pageSize}>
						<option value={25}>25</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
					</select>
				</div>
				<div class="pagination-center">
					{#if currentPage > 1}
						<button class="page-btn" onclick={() => goToPage(1)} aria-label="First page">«</button>
						<button
							class="page-btn"
							onclick={() => goToPage(currentPage - 1)}
							aria-label="Previous page">‹</button
						>
					{/if}
					<span class="page-info">{currentPage} / {totalPages}</span>
					{#if currentPage < totalPages}
						<button
							class="page-btn"
							onclick={() => goToPage(currentPage + 1)}
							aria-label="Next page">›</button
						>
						<button class="page-btn" onclick={() => goToPage(totalPages)} aria-label="Last page"
							>»</button
						>
					{/if}
				</div>
				<div class="pagination-right">
					<span class="rows-label">{filteredGuests.length} total</span>
				</div>
			</div>
		</div>
	</div>
</div>

{#if showPaymentModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={closePaymentModal}>
		<div
			class="modal-content"
			class:has-preview={!paymentModalNote && selectedPaymentFileIds.length > 0}
			onclick={(e) => e.stopPropagation()}
		>
			<div class="modal-header">
				<h3>Proof of Payment</h3>
				<div class="modal-header-actions">
					{#if guestForPayment}
						<button
							class="mark-not-paid-btn"
							disabled={revokingCertId === guestForPayment.certId}
							onclick={() =>
								openConfirmDialog({
									title: 'Revoke Payment',
									message: `Remove the payment record for ${guestForPayment?.name}? This cannot be undone.`,
									btnLabel: 'Yes, revoke',
									variant: 'danger',
									onConfirm: () => markAsNotPaid(guestForPayment!)
								})}
							aria-label="Mark as Not Paid"
						>
							Mark as Not Paid
						</button>
					{/if}
					<button class="close-btn" onclick={closePaymentModal} aria-label="Close modal">✕</button>
				</div>
			</div>
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

{#if showConfirmDialog}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop confirm-dialog-backdrop" onclick={closeConfirmDialog}>
		<div class="confirm-dialog" onclick={(e) => e.stopPropagation()}>
			<div
				class="confirm-dialog-icon"
				class:danger={confirmDialogVariant === 'danger'}
				class:success={confirmDialogVariant === 'success'}
			>
				{#if confirmDialogVariant === 'danger'}
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
						/>
						<line x1="12" y1="9" x2="12" y2="13" />
						<line x1="12" y1="17" x2="12.01" y2="17" />
					</svg>
				{:else}
					<svg
						width="28"
						height="28"
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
				{/if}
			</div>
			<h3 class="confirm-dialog-title">{confirmDialogTitle}</h3>
			<p class="confirm-dialog-message">{confirmDialogMessage}</p>
			<div class="confirm-dialog-actions">
				<button class="confirm-dialog-cancel" onclick={closeConfirmDialog}>Cancel</button>
				<button
					class="confirm-dialog-confirm"
					class:danger={confirmDialogVariant === 'danger'}
					class:success={confirmDialogVariant === 'success'}
					disabled={confirmDialogPending}
					onclick={async () => {
						if (confirmDialogOnConfirm) {
							confirmDialogPending = true;
							await confirmDialogOnConfirm();
							closeConfirmDialog();
						}
					}}
				>
					{#if confirmDialogPending}<span class="btn-spinner"></span>{/if}
					{confirmDialogBtnLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showMarkPaidModal && guestForMarkPaid}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={closeMarkPaidModal}>
		<div class="modal-content mark-paid-modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>Mark as Paid</h3>
				<button class="close-btn" onclick={closeMarkPaidModal} aria-label="Close modal">✕</button>
			</div>
			<div class="modal-body mark-paid-modal-body">
				<p class="mark-paid-guest-name">{guestForMarkPaid.name}</p>
				{#if guestForMarkPaid.email}
					<p class="mark-paid-guest-email">{guestForMarkPaid.email}</p>
				{/if}
				<p class="mark-paid-hint">Record cash payment received on-site for this attendee.</p>
				<div class="mark-paid-actions">
					<button
						class="mark-paid-submit-btn"
						disabled={!guestForMarkPaid.certId || approvingCertId === guestForMarkPaid.certId}
						onclick={() =>
							openConfirmDialog({
								title: 'Mark as Paid',
								message: `Confirm recording a cash payment for ${guestForMarkPaid?.name}?`,
								btnLabel: 'Yes, mark as paid',
								variant: 'success',
								onConfirm: () => markAsPaidCash(guestForMarkPaid!)
							})}
						aria-label="Mark as paid"
					>
						Mark as Paid
					</button>
					<button class="mark-paid-cancel-btn" onclick={closeMarkPaidModal}>Cancel</button>
				</div>
			</div>
		</div>
	</div>
{/if}

{#if showSuccessToast}
	<div class="success-toast">
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
			<polyline points="22 4 12 14.01 9 11.01" />
		</svg>
		<span>{successToastMessage}</span>
	</div>
{/if}


<!-- ===== Report Download Modal ===== -->
{#if showReportModal}
	<div
		class="report-modal-backdrop"
		role="dialog"
		aria-modal="true"
		aria-label="Download attendance report"
		onclick={() => (showReportModal = false)}
		onkeydown={(e) => e.key === 'Escape' && (showReportModal = false)}
		tabindex="-1"
	>
		<div class="report-modal" onclick={(e) => e.stopPropagation()}>
			<div class="report-modal-header">
				<div class="report-modal-title">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
						<line x1="16" y1="13" x2="8" y2="13"/>
						<line x1="16" y1="17" x2="8" y2="17"/>
						<polyline points="10 9 9 9 8 9"/>
					</svg>
					Download Attendance Report
				</div>
				<button class="report-modal-close" onclick={() => (showReportModal = false)} aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>

			<div class="report-modal-body">
				<p class="report-modal-desc">
					Generates a list of all <strong>{guests.length}</strong> registrants sorted <strong>A–Z by family name</strong>, including full name, email, category, payment status, check-in time, and check-out time.
				</p>

				<div class="report-format-grid">
					<button
						class="report-format-btn xlsx"
						disabled={generatingReport !== null}
						onclick={downloadXLSX}
					>
						{#if generatingReport === 'xlsx'}
							<span class="btn-spinner"></span>
						{:else}
							<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
								<polyline points="14 2 14 8 20 8"/>
								<line x1="8" y1="13" x2="16" y2="13"/>
								<line x1="8" y1="17" x2="16" y2="17"/>
								<polyline points="10 9 9 9 8 9"/>
							</svg>
						{/if}
						<span class="format-label">Excel (.xlsx)</span>
						<span class="format-sub">Spreadsheet format</span>
					</button>

					<button
						class="report-format-btn pdf"
						disabled={generatingReport !== null}
						onclick={downloadPDF}
					>
						{#if generatingReport === 'pdf'}
							<span class="btn-spinner"></span>
						{:else}
							<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
								<polyline points="14 2 14 8 20 8"/>
								<path d="M9 13h1a2 2 0 000-4H9v8"/>
							</svg>
						{/if}
						<span class="format-label">PDF</span>
						<span class="format-sub">Print / Save as PDF</span>
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.page-layout {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		flex: 1;
		box-sizing: border-box;
	}

	.main-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.attendee-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: #ffffff;
		border: 1px solid var(--border-color);
		border-radius: 16px;
		box-shadow: var(--shadow-sm);
		overflow: hidden;
		transition: var(--transition-smooth);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		gap: 10px;
		flex-wrap: wrap;
		flex-shrink: 0;
		background: #fff;
		border-bottom: 1px solid var(--border-color);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.panel-title {
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 700;
		margin: 0;
		letter-spacing: -0.01em;
	}

	.count-badge {
		background: var(--bg-sidebar);
		color: white;
		padding: 4px 12px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 700;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.send-all-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 38px;
		padding: 0 16px;
		background: rgba(128, 0, 0, 0.08);
		border: 1px solid rgba(128, 0, 0, 0.2);
		border-radius: 8px;
		color: #800000;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: var(--shadow-sm);
	}

	.send-all-btn:hover:not(:disabled) {
		background: rgba(128, 0, 0, 0.15);
		border-color: rgba(128, 0, 0, 0.3);
		transform: translateY(-1px);
	}

	.send-all-btn.qr-theme {
		background: rgba(33, 125, 5, 0.08);
		border-color: rgba(33, 125, 5, 0.2);
		color: #217d05;
	}

	.send-all-btn.qr-theme:hover:not(:disabled) {
		background: rgba(33, 125, 5, 0.15);
		border-color: rgba(33, 125, 5, 0.3);
	}

	.send-all-btn.clear-all-btn {
		background: rgba(220, 38, 38, 0.08);
		border-color: rgba(220, 38, 38, 0.2);
		color: #dc2626;
	}

	.send-all-btn.clear-all-btn:hover:not(:disabled) {
		background: rgba(220, 38, 38, 0.15);
		border-color: rgba(220, 38, 38, 0.3);
	}

	.send-all-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.filter-select {
		height: 38px;
		color: var(--text-primary);
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 8px 28px 8px 12px;
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%234b5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 10px center;
		transition: var(--transition-smooth);
		box-shadow: var(--shadow-sm);
	}

	.filter-select:focus {
		outline: 2px solid var(--bg-sidebar);
		outline-offset: 1px;
	}

	.refresh-btn {
		width: 38px;
		height: 38px;
		border: 1px solid var(--border-color);
		background: #fff;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: var(--transition-smooth);
		box-shadow: var(--shadow-sm);
		flex-shrink: 0;
	}

	.refresh-btn:hover {
		background: rgba(128, 0, 0, 0.05);
		border-color: rgba(128, 0, 0, 0.3);
	}

	.refresh-btn.spinning svg {
		animation: spin 1s linear infinite;
	}

	.action-bar-row {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 12px 20px;
		border-bottom: 1px solid var(--border-color);
		background: #fafafa;
		flex-shrink: 0;
	}

	.filters-inline {
		display: flex;
		flex-direction: row;
		gap: 8px;
		width: 100%;
	}

	.filter-select.integrated {
		flex: 1;
		min-width: 0;
	}

	.search-container {
		position: relative;
		width: 100%;
		flex: 1;
	}

	.search-field {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #fff;
		border: 1px solid var(--border-color);
		border-radius: 12px;
		padding: 10px 14px;
		color: var(--text-secondary);
		transition: var(--transition-smooth);
		box-shadow: var(--shadow-sm);
	}

	.search-field.focused {
		border-color: var(--bg-sidebar);
		box-shadow: 0 0 0 3px rgba(128, 0, 0, 0.08);
		color: var(--bg-sidebar);
	}

	.search-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: 100%;
		background: #fff;
		border: 1px solid var(--border-color);
		border-radius: 12px;
		box-shadow: var(--shadow-md);
		z-index: 10;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.suggestion-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 12px 14px;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--border-color);
		cursor: pointer;
		text-align: left;
		transition: var(--transition-smooth);
	}

	.suggestion-item:last-child {
		border-bottom: none;
	}

	.suggestion-item:hover,
	.suggestion-item:focus {
		background: var(--bg-primary);
		outline: none;
	}

	.suggestion-name {
		color: var(--text-primary);
		font-size: 14px;
		font-weight: 600;
	}

	.suggestion-email {
		color: var(--text-secondary);
		font-size: 12px;
		margin-top: 2px;
	}

	.search-icon {
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		border: none;
		outline: none;
		background: transparent;
		font-family: inherit;
		font-size: 14px;
		color: var(--text-primary);
		min-width: 0;
		line-height: 1.2;
	}

	.search-input::placeholder {
		color: var(--text-secondary);
	}

	/* hide the native clear button on search inputs */
	.search-input::-webkit-search-cancel-button {
		display: none;
	}

	.search-clear {
		background: var(--bg-primary);
		border: none;
		width: 24px;
		height: 24px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: 50%;
		color: var(--text-secondary);
		transition: var(--transition-smooth);
	}

	.search-clear:hover {
		background: rgba(128, 0, 0, 0.1);
		color: var(--bg-sidebar);
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
		overflow-x: auto;
		min-height: 0;
		-webkit-overflow-scrolling: touch;
	}

	.type-filter-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-bottom: 1px solid var(--border-color);
		background: #fafafa;
		overflow-x: auto;
		flex-shrink: 0;
		scrollbar-width: none;
	}

	.type-filter-bar::-webkit-scrollbar {
		display: none;
	}

	.type-pill {
		white-space: nowrap;
		padding: 6px 16px;
		border-radius: 20px;
		border: 1px solid var(--border-color);
		background: #fff;
		color: var(--text-secondary);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: var(--transition-smooth);
		box-shadow: var(--shadow-sm);
	}

	.type-pill:hover {
		border-color: rgba(128, 0, 0, 0.3);
		color: var(--bg-sidebar);
	}

	.type-pill.active {
		background: var(--bg-sidebar);
		border-color: var(--bg-sidebar);
		color: #fff;
	}

	.pagination {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 4px;
		padding: 12px 20px;
		padding-bottom: calc(12px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border-color);
		background: #fafafa;
		flex-shrink: 0;
	}

	.pagination-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.pagination-center {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.pagination-right {
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	.rows-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.rows-select {
		color: var(--text-primary);
		background: #fff;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 6px 24px 6px 10px;
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%234b5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 6px center;
		box-shadow: var(--shadow-sm);
	}

	.rows-select:focus {
		outline: 2px solid var(--bg-sidebar);
		outline-offset: 1px;
	}

	.page-btn {
		width: 34px;
		height: 34px;
		border-radius: 8px;
		border: none;
		background: #fff;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		box-shadow: var(--shadow-sm);
		border: 1px solid var(--border-color);
		transition: var(--transition-smooth);
	}

	.page-btn:hover {
		background: var(--bg-primary);
		color: var(--bg-sidebar);
		border-color: rgba(128, 0, 0, 0.2);
	}

	.page-btn:active {
		transform: translateY(1px);
	}

	.page-info {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
		min-width: 44px;
		text-align: center;
	}

	.table-scroll {
		min-width: 100%;
	}

	.guest-table {
		width: 100%;
		border-collapse: collapse;
	}

	.guest-table th {
		position: sticky;
		top: 0;
		background: #800000;
		color: #fff;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		padding: 12px 10px;
		text-align: left;
		border-bottom: 1px solid rgba(0, 0, 0, 0.15);
		z-index: 1;
	}

	.guest-table td {
		padding: 12px 10px;
		color: var(--text-primary);
		font-size: 13px;
		border-bottom: 1px solid var(--border-color);
	}

	.guest-table tbody tr:last-child td {
		border-bottom: none;
	}

	.guest-table tbody tr.row-clickable {
		cursor: pointer;
	}

	.guest-table tbody tr.row-clickable:hover td {
		background: rgba(0, 0, 0, 0.025);
	}

	.guest-table tbody tr.row-registered td {
		background-color: rgba(128, 0, 0, 0.04); /* Very light red */
	}

	.guest-table tbody tr.row-registered:hover td {
		background-color: rgba(128, 0, 0, 0.08);
	}

	.guest-table tbody tr.row-attended td {
		background-color: rgba(128, 0, 0, 0.1); /* Slightly deeper light red */
	}

	.guest-table tbody tr.row-attended:hover td {
		background-color: rgba(128, 0, 0, 0.15);
	}

	.col-num {
		width: 48px;
		text-align: center;
		color: var(--text-secondary);
		font-weight: 600;
	}

	.guest-name {
		color: var(--text-primary);
		font-weight: 600;
		font-size: 14px;
		line-height: 1.3;
	}

	.guest-email {
		color: var(--text-secondary);
		font-size: 12px;
		margin-top: 2px;
		word-break: break-all;
	}

	.col-time {
		white-space: nowrap;
		text-align: center;
	}

	.col-status {
		text-align: center;
	}

	.col-payment {
		text-align: center;
	}

	.col-category {
		text-align: center;
		width: 110px;
	}

	.col-actions {
		text-align: center;
		width: 140px;
	}

	.col-signout {
		text-align: center;
		width: 100px;
	}

	.guest-table th.col-time,
	.guest-table th.col-status,
	.guest-table th.col-payment,
	.guest-table th.col-category,
	.guest-table th.col-signout,
	.guest-table th.col-actions {
		text-align: center;
	}

	.signout-badge {
		display: inline-block;
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
	}

	.signout-badge.signed-out {
		background: rgba(34, 197, 94, 0.1);
		color: #16a34a;
	}

	.signout-badge.not-signed-out {
		background: rgba(239, 68, 68, 0.08);
		color: #dc2626;
	}

	.signout-badge.na {
		background: #f3f4f6;
		color: #9ca3af;
	}

	.payment-badge {
		display: inline-block;
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
	}

	.payment-badge.paid {
		background: rgba(34, 197, 94, 0.1);
		color: #16a34a;
	}

	.payment-badge.not-paid {
		background: rgba(239, 68, 68, 0.08);
		color: #dc2626;
	}

	.category-badge {
		display: inline-block;
		padding: 5px 10px;
		border-radius: 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.3px;
		white-space: nowrap;
	}

	.category-badge.member {
		background: rgba(59, 130, 246, 0.1);
		color: #1d4ed8;
	}

	.category-badge.non-member {
		background: rgba(249, 115, 22, 0.12);
		color: #c2410c;
	}

	.category-badge.student {
		background: rgba(139, 92, 246, 0.1);
		color: #6d28d9;
	}

	.category-badge.unknown {
		background: #f3f4f6;
		color: #9ca3af;
	}

	/* === Status Select Dropdown === */
	.status-select {
		appearance: none;
		-webkit-appearance: none;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 5px 24px 5px 10px;
		font-size: 12px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234b5563' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 6px center;
		background-color: transparent;
		transition: border-color 0.2s, background-color 0.2s;
		min-width: 90px;
	}

	.status-select:focus {
		outline: 2px solid rgba(128, 0, 0, 0.3);
		outline-offset: 1px;
	}

	.status-select:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status-select.status-none {
		color: #6b7280;
		border-color: #d1d5db;
		background-color: #f9fafb;
	}

	.status-select.status-in {
		color: #1d4ed8;
		border-color: rgba(29, 78, 216, 0.35);
		background-color: rgba(59, 130, 246, 0.07);
	}

	.status-select.status-out {
		color: #15803d;
		border-color: rgba(21, 128, 61, 0.35);
		background-color: rgba(34, 197, 94, 0.08);
	}

	.status-saving {
		display: block;
		font-size: 10px;
		color: var(--text-muted);
		margin-top: 3px;
		animation: pulse 1s ease-in-out infinite;
	}

	.send-program-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 12px;
		font-size: 12px;
		font-weight: 600;
		color: #800000;
		background: rgba(128, 0, 0, 0.1);
		border: 1px solid rgba(128, 0, 0, 0.25);
		border-radius: 8px;
		cursor: pointer;
		font-family: inherit;
		transition:
			background 0.2s,
			border-color 0.2s,
			transform 0.1s;
		white-space: nowrap;
	}

	.send-program-btn:hover:not(:disabled) {
		background: rgba(128, 0, 0, 0.18);
		border-color: rgba(128, 0, 0, 0.4);
	}

	.send-program-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.send-program-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Mark as Paid modal */
	.mark-paid-modal {
		max-width: 400px;
	}

	.mark-paid-modal-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.mark-paid-guest-name {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.mark-paid-guest-email {
		margin: 0;
		font-size: 14px;
		color: var(--text-secondary);
		word-break: break-all;
	}

	.mark-paid-hint {
		margin: 8px 0 0 0;
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.mark-paid-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: center;
		margin-top: 16px;
	}

	.mark-paid-submit-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 24px;
		font-size: 15px;
		font-weight: 600;
		color: #fff;
		background: var(--bg-sidebar);
		border: none;
		border-radius: 10px;
		cursor: pointer;
		font-family: inherit;
		transition:
			opacity 0.2s,
			transform 0.1s;
	}

	.mark-paid-submit-btn:hover:not(:disabled) {
		opacity: 0.92;
	}

	.mark-paid-submit-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.mark-paid-submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.mark-paid-cancel-btn {
		padding: 12px 20px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-secondary);
		background: var(--bg-primary);
		border: 1px solid var(--border-color);
		border-radius: 10px;
		cursor: pointer;
		font-family: inherit;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.mark-paid-cancel-btn:hover {
		background: #eee;
		border-color: #ccc;
	}

	@media (max-width: 479px) {
		.mark-paid-modal {
			margin: 16px;
			max-height: calc(100vh - 32px);
		}

		.mark-paid-actions {
			flex-direction: column;
			width: 100%;
		}

		.mark-paid-submit-btn,
		.mark-paid-cancel-btn {
			width: 100%;
		}
	}

	.btn-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid rgba(128, 0, 0, 0.2);
		border-top-color: var(--bg-sidebar);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	/* Mobile CSS Card Layout Override (2x2 Grid) */
	@media (max-width: 479px) {
		.guest-table,
		.guest-table tbody,
		.guest-table td {
			display: block;
			width: 100%;
		}

		.guest-table thead {
			display: none;
		}

		.guest-table td {
			border: none;
			padding: 0;
			text-align: left;
		}

		.guest-table td.col-num {
			display: none;
		}

		.guest-table tr {
			display: grid;
			grid-template-columns: 1fr auto;
			grid-template-areas:
				'name status'
				'name payment'
				'name time';
			gap: 2px 14px;
			align-items: center;
			padding: 16px;
			border-bottom: 1px solid var(--border-color);
			background: #fff;
		}

		.guest-table td.col-name {
			grid-area: name;
			display: flex;
			flex-direction: column;
			gap: 4px;
			padding: 0;
		}

		.guest-name {
			margin: 0;
			font-size: 15px;
			display: flex;
			align-items: baseline;
		}

		.guest-name::before {
			content: attr(data-index);
			font-weight: 700;
			color: var(--text-secondary);
			margin-right: 2px;
			font-size: 14px;
		}

		.guest-email {
			margin: 0;
			font-size: 13px;
			padding-left: 0;
		}

		.guest-table td.col-status {
			grid-area: status;
			padding: 0;
			text-align: center;
			align-self: end;
		}

		.guest-table td.col-time {
			display: block;
			grid-area: time;
			text-align: center;
			font-size: 12px;
			color: var(--text-secondary);
			align-self: start;
		}

		.guest-table td.col-payment {
			grid-area: payment;
			padding: 0;
			text-align: center;
			align-self: center;
		}

		.guest-table td.col-actions {
			display: none;
		}

		.status-badge,
		.payment-badge {
			padding: 0 8px;
			font-size: 11px;
			width: 76px;
			height: 26px;
			display: flex;
			align-items: center;
			justify-content: center;
			white-space: nowrap;
			box-sizing: border-box;
		}
	}

	.time-mobile {
		display: inline;
		color: var(--text-secondary);
		font-size: 13px;
	}

	.time-desktop {
		display: none;
		color: var(--text-secondary);
		font-size: 13px;
	}

	.status-badge {
		display: inline-block;
		padding: 6px 12px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
	}

	.status-badge.attended {
		background: rgba(34, 197, 94, 0.1);
		color: #16a34a;
	}

	.status-badge.not-attended {
		background: var(--bg-primary);
		color: var(--text-secondary);
	}

	.status-badge.in-only {
		background: rgba(245, 158, 11, 0.1);
		color: #d97706;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 60px 20px;
		color: var(--text-secondary);
		font-size: 14px;
	}

	.spinner {
		width: 36px;
		height: 36px;
		border: 3px solid rgba(128, 0, 0, 0.15);
		border-top-color: var(--bg-sidebar);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 16px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 60px 20px;
		color: var(--text-secondary);
		font-size: 14px;
		gap: 16px;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes fadeInUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* >=480px */
	@media (min-width: 480px) {
		.guest-table {
			display: table;
		}

		.guest-table thead {
			display: table-header-group;
		}

		.guest-table tbody {
			display: table-row-group;
		}

		.guest-table tr {
			display: table-row;
		}

		.guest-table td,
		.guest-table th {
			display: table-cell;
		}

		.guest-table td {
			padding: 18px 16px;
			font-size: 14px;
		}
		.guest-table th {
			padding: 16px;
		}
		.guest-name {
			font-size: 15px;
		}
		.guest-email {
			font-size: 13px;
			margin-top: 4px;
		}
		.panel-title {
			font-size: 18px;
		}
	}

	/* >=768px */
	@media (min-width: 768px) {
		.page-layout {
			padding: 0;
			max-width: none;
			margin: 0;
		}

		.action-bar-row {
			flex-direction: row;
			align-items: center;
		}

		.filters-inline {
			flex-direction: row;
			width: auto;
			flex: 0 0 auto;
			flex-shrink: 0;
			align-items: center; /* keep refresh inline */
		}

		.filter-select.integrated {
			flex: 0 0 auto;
			min-width: max-content;
		}

		.search-container {
			flex: 1 1 0;
			min-width: 180px;
			max-width: none;
		}

		.guest-table tbody tr:hover td {
			background: var(--bg-primary);
		}

		.time-mobile {
			display: none;
		}

		.time-desktop {
			display: inline;
		}
	}

	/* === Modal CSS === */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px;
		backdrop-filter: blur(4px);
		animation: fadeIn 0.2s ease-out forwards;
	}

	.modal-content {
		background: #fff;
		border-radius: 16px;
		width: 100%;
		max-width: 500px;
		max-height: calc(100dvh - 24px);
		display: flex;
		flex-direction: column;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		overflow: hidden;
		animation: slideUpModal 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.modal-content.has-preview {
		height: calc(100dvh - 24px);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-color);
		background: #fafafa;
		flex-shrink: 0;
		gap: 12px;
	}

	.modal-header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.close-btn {
		background: transparent;
		border: none;
		font-size: 18px;
		color: var(--text-secondary);
		cursor: pointer;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.2s;
	}

	.close-btn:hover {
		background: rgba(0, 0, 0, 0.05);
		color: var(--text-primary);
	}

	.modal-body {
		padding: 16px 20px;
		overflow: hidden;
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
		margin: 0 0 8px 0;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-secondary);
	}

	.payment-note-value {
		margin: 0 0 12px 0;
		font-size: 18px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.payment-note-hint {
		margin: 0;
		font-size: 14px;
		color: var(--text-secondary);
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
		color: var(--text-primary);
		flex-shrink: 0;
	}

	.payment-preview-img {
		flex: 1;
		min-height: 0;
		width: 100%;
		object-fit: contain;
		border-radius: 8px;
		background: #fafafa;
		display: block;
		align-self: stretch;
	}

	.payment-open-link {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px 16px;
		font-size: 14px;
		font-weight: 600;
		color: var(--bg-sidebar);
		background: rgba(128, 0, 0, 0.05);
		border-radius: 8px;
		text-decoration: none;
		transition: background-color 0.2s ease;
		flex-shrink: 0;
	}

	.payment-open-link:hover {
		background-color: rgba(128, 0, 0, 0.1);
	}

	.payment-modal-actions {
		display: none;
	}

	.mark-not-paid-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px 14px;
		font-size: 13px;
		font-weight: 600;
		color: #dc2626;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 8px;
		cursor: pointer;
		font-family: inherit;
		transition:
			background 0.2s,
			color 0.2s;
	}

	.mark-not-paid-btn:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.15);
	}

	.mark-not-paid-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.mark-not-paid-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Confirmation dialog */
	.confirm-dialog-backdrop {
		z-index: 1100;
	}

	.confirm-dialog {
		background: #fff;
		border-radius: 16px;
		width: 100%;
		max-width: 360px;
		padding: 28px 24px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 12px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		animation: slideUpModal 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.confirm-dialog-icon {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 4px;
	}

	.confirm-dialog-icon.danger {
		background: rgba(239, 68, 68, 0.1);
		color: #dc2626;
	}

	.confirm-dialog-icon.success {
		background: rgba(22, 163, 74, 0.1);
		color: #16a34a;
	}

	.confirm-dialog-title {
		margin: 0;
		font-size: 17px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.confirm-dialog-message {
		margin: 0;
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.55;
	}

	.confirm-dialog-actions {
		display: flex;
		gap: 10px;
		width: 100%;
		margin-top: 8px;
	}

	.confirm-dialog-cancel {
		flex: 1;
		padding: 10px 16px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-secondary);
		background: #f3f4f6;
		border: 1px solid var(--border-color);
		border-radius: 10px;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.2s;
	}

	.confirm-dialog-cancel:hover {
		background: #e5e7eb;
	}

	.confirm-dialog-confirm {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 10px 16px;
		font-size: 14px;
		font-weight: 600;
		border: none;
		border-radius: 10px;
		cursor: pointer;
		font-family: inherit;
		transition:
			background 0.2s,
			opacity 0.2s;
	}

	.confirm-dialog-confirm.danger {
		color: #fff;
		background: #dc2626;
	}

	.confirm-dialog-confirm.danger:hover:not(:disabled) {
		background: #b91c1c;
	}

	.confirm-dialog-confirm.success {
		color: #fff;
		background: #16a34a;
	}

	.confirm-dialog-confirm.success:hover:not(:disabled) {
		background: #15803d;
	}

	.confirm-dialog-confirm:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.success-toast {
		position: fixed;
		top: 20px;
		right: 20px;
		background: #16a34a;
		color: #ffffff;
		padding: 14px 20px;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(22, 163, 74, 0.3);
		display: flex;
		align-items: center;
		gap: 10px;
		z-index: 2000;
		font-size: 14px;
		font-weight: 600;
		animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	.success-toast svg {
		flex-shrink: 0;
	}

	.send-status-modal {
		max-width: 500px;
		max-height: 80vh;
	}

	.send-progress-text {
		font-size: 14px;
		font-weight: 700;
		color: var(--bg-sidebar);
	}

	/* Validated Indicator (Green Highlight Feature) */
	.validated-indicator {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: #22c55e;
		color: white;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		margin-left: 6px;
		flex-shrink: 0;
		vertical-align: middle;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.guest-name {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
	}

	.send-status-body {
		padding: 0;
		overflow-y: auto;
		max-height: calc(80vh - 80px);
	}

	.send-status-list {
		display: flex;
		flex-direction: column;
	}

	.send-status-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		border-bottom: 1px solid var(--border-color);
		transition: background 0.2s;
	}

	.send-status-item:last-child {
		border-bottom: none;
	}

	.status-name {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
		flex: 1;
	}

	.status-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		flex-shrink: 0;
	}

	.send-status-item.pending {
		background: #fafafa;
	}

	.send-status-item.pending .status-indicator {
		color: #9ca3af;
	}

	.send-status-item.sending {
		background: rgba(59, 130, 246, 0.05);
	}

	.send-status-item.sending .status-indicator {
		color: #3b82f6;
	}

	.send-status-item.success {
		background: rgba(34, 197, 94, 0.05);
	}

	.send-status-item.success .status-indicator {
		color: #16a34a;
	}

	.send-status-item.failed {
		background: rgba(239, 68, 68, 0.05);
	}

	.send-status-item.failed .status-indicator {
		color: #dc2626;
	}

	.status-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(59, 130, 246, 0.2);
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes slideInRight {
		from {
			opacity: 0;
			transform: translateX(100px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUpModal {
		from {
			opacity: 0;
			transform: translateY(20px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@media (min-width: 480px) {
		.modal-backdrop {
			padding: 20px;
		}

		.modal-content {
			max-height: calc(100dvh - 40px);
		}

		.modal-content.has-preview {
			height: calc(100dvh - 40px);
		}
	}

	@media (min-width: 768px) {
		.modal-content {
			max-height: 90dvh;
		}

		.modal-content.has-preview {
			height: 90dvh;
		}
	}
	.action-group {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.send-qr-btn,
	.send-program-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		font-size: 13px;
		font-weight: 600;
		border-radius: 8px;
		cursor: pointer;
		font-family: inherit;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.send-qr-btn {
		background: rgba(128, 0, 0, 0.05);
		color: var(--bg-sidebar);
		border: 1px solid rgba(128, 0, 0, 0.15);
	}

	.send-qr-btn:hover:not(:disabled) {
		background: rgba(128, 0, 0, 0.1);
		border-color: var(--bg-sidebar);
	}

	.send-program-btn {
		background: #16a34a;
		color: #fff;
		border: none;
	}

	.send-program-btn:hover:not(:disabled) {
		background: #15803d;
	}

	.send-qr-btn:disabled,
	.send-program-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.send-qr-btn .btn-spinner {
		border: 2px solid rgba(128, 0, 0, 0.2);
		border-top-color: var(--bg-sidebar);
	}
	.header-actions {
		display: flex;
		gap: 12px;
		align-items: center;
	}

	.send-all-btn.qr-theme {
		background: rgba(128, 0, 0, 0.08);
		color: var(--bg-sidebar);
		border: 1px solid rgba(128, 0, 0, 0.2);
		box-shadow: none;
	}

	.send-all-btn.qr-theme:hover:not(:disabled) {
		background: rgba(128, 0, 0, 0.12);
		border-color: var(--bg-sidebar);
	}

	.send-all-btn:disabled {
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0% {
			opacity: 0.7;
			transform: scale(1);
		}
		50% {
			opacity: 0.9;
			transform: scale(1.02);
		}
		100% {
			opacity: 0.7;
			transform: scale(1);
		}
	}

	/* ── Report Download Styles ── */
	.download-report-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 38px;
		padding: 0 16px;
		background: #ffffff;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		color: #374151;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: var(--shadow-sm);
	}

	.download-report-btn:hover {
		background: #f9fafb;
		border-color: #d1d5db;
		color: #111827;
	}

	.report-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.report-modal {
		background: #ffffff;
		border-radius: 16px;
		width: 100%;
		max-width: 480px;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
		display: flex;
		flex-direction: column;
		animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.report-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border-color);
	}

	.report-modal-title {
		font-size: 16px;
		font-weight: 700;
		color: var(--text-primary);
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.report-modal-close {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s;
	}

	.report-modal-close:hover {
		background: #f3f4f6;
		color: var(--text-primary);
	}

	.report-modal-body {
		padding: 24px;
	}

	.report-modal-desc {
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0 0 24px 0;
	}

	.report-modal-desc strong {
		color: var(--text-primary);
	}

	.report-format-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	.report-format-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 24px 16px;
		border-radius: 12px;
		border: 2px solid var(--border-color);
		background: #ffffff;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		gap: 12px;
	}

	.report-format-btn:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
	}

	.report-format-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.report-format-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.report-format-btn.xlsx {
		color: #15803d;
	}
	.report-format-btn.xlsx:hover:not(:disabled) {
		border-color: #15803d;
		background: #f0fdf4;
	}

	.report-format-btn.pdf {
		color: #b91c1c;
	}
	.report-format-btn.pdf:hover:not(:disabled) {
		border-color: #b91c1c;
		background: #fef2f2;
	}

	.format-label {
		font-size: 15px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.format-sub {
		font-size: 12px;
		color: var(--text-muted);
		font-weight: 500;
	}
</style>
