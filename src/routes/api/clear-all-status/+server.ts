import { json } from '@sveltejs/kit';
import { getScriptUrl } from '$lib/server/getScriptUrl';

export async function POST({ fetch }) {
	const eventIds = ['1', '2', '3'];
	const urls = eventIds
		.map((id) => getScriptUrl(id))
		.filter((result) => result.configured)
		.map((result) => result.url);

	if (urls.length === 0) {
		return json({ success: false, message: 'Google Apps Script URLs are not configured' }, { status: 500 });
	}

	try {
		// Send the clearAllStatus command to all configured databases
		const promises = urls.map((url) =>
			fetch(url, {
				method: 'POST',
				redirect: 'follow',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'clearAllStatus' })
			})
				.then(async (res) => {
					const text = await res.text();
					if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
						return { success: false, message: 'Invalid response from server' };
					}
					return JSON.parse(text);
				})
				.catch((err) => {
					console.error(`Error connecting to GAS URL ${url}:`, err);
					return { success: false, message: 'Connection failed' };
				})
		);

		const results = await Promise.all(promises);

		// If at least one succeeds, we consider it a success
		const anySuccess = results.some((r) => r.success);

		if (anySuccess) {
			return json({ success: true, message: 'All statuses cleared successfully across databases' });
		} else {
			const errorMsg = results.find((r) => !r.success && r.message)?.message || 'Failed to clear statuses';
			return json({ success: false, message: errorMsg }, { status: 400 });
		}
	} catch (error: any) {
		console.error('API /api/clear-all-status error:', error);
		return json({ success: false, message: error.message || 'Internal server error' }, { status: 500 });
	}
}
