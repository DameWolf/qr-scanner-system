import { json } from '@sveltejs/kit';
import { getScriptUrl } from '$lib/server/getScriptUrl';
import type { RequestHandler } from './$types';

async function tryUpdateStatus(
	eventId: string,
	certId: string,
	newStatus: string
): Promise<{ success: boolean; data: any; isNotFound: boolean }> {
	const { url, configured } = getScriptUrl(eventId);
	if (!configured) return { success: false, data: null, isNotFound: true };

	try {
		const response = await fetch(url, {
			method: 'POST',
			redirect: 'follow',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'updateStatus', certId, newStatus })
		});

		const text = await response.text();
		if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
			return { success: false, data: null, isNotFound: true };
		}

		const data = JSON.parse(text);
		const isNotFound =
			!data.success &&
			(String(data.message || '').toLowerCase().includes('not found') ||
				String(data.message || '').toLowerCase().includes('not found for'));

		return { success: data.success, data, isNotFound };
	} catch {
		return { success: false, data: null, isNotFound: true };
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const certId = (body.certId || '').toString().trim();
	const newStatus = (body.newStatus || '').toString().trim().toUpperCase();

	if (!certId) {
		return json({ success: false, message: 'certId is required' }, { status: 400 });
	}
	if (!['NONE', 'IN', 'OUT'].includes(newStatus)) {
		return json(
			{ success: false, message: 'newStatus must be NONE, IN, or OUT' },
			{ status: 400 }
		);
	}

	// Try all three databases in parallel — only one will have the certId
	const [members, nonMembers, students] = await Promise.all([
		tryUpdateStatus('1', certId, newStatus),
		tryUpdateStatus('2', certId, newStatus),
		tryUpdateStatus('3', certId, newStatus)
	]);

	const results = [members, nonMembers, students];

	// Return first success
	const success = results.find((r) => r.success);
	if (success) return json(success.data);

	// Return first meaningful error (not a "not found")
	const meaningful = results.find((r) => r.data && !r.isNotFound);
	if (meaningful) return json(meaningful.data);

	// All returned not found
	return json({ success: false, message: 'Attendee not found in any database' });
};
