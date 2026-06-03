import { json } from '@sveltejs/kit';
import { getScriptUrl } from '$lib/server/getScriptUrl';
import type { RequestHandler } from './$types';

// Maps eventId → category label shown in the guest list
const CATEGORY_LABELS: Record<string, string> = {
	'1': 'Member',
	'2': 'Non-Member',
	'3': 'Student'
};

async function fetchFromEvent(eventId: string): Promise<{
	attendees: any[];
	registered: any[];
	error?: string;
}> {
	const { url: scriptUrl, label, configured } = getScriptUrl(eventId);
	const category = CATEGORY_LABELS[eventId] ?? 'Member';

	if (!configured) {
		console.warn(`APPS_SCRIPT_URL for "${label}" is not configured.`);
		return { attendees: [], registered: [] };
	}

	try {
		const response = await fetch(scriptUrl, {
			method: 'GET',
			redirect: 'follow',
			headers: { Accept: 'application/json' }
		});

		const text = await response.text();

		if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
			console.error(`Apps Script for "${label}" returned HTML instead of JSON.`);
			return { attendees: [], registered: [], error: `${label}: HTML error from Apps Script` };
		}

		const data = JSON.parse(text);

		// Tag every record with its category
		const tag = (arr: any[]) =>
			(arr ?? []).map((item: any) => ({ ...item, category }));

		return {
			attendees: tag(data.attendees ?? []),
			registered: tag(data.registered ?? [])
		};
	} catch (err) {
		console.error(`Failed to fetch from "${label}":`, err);
		return { attendees: [], registered: [] };
	}
}

export const GET: RequestHandler = async () => {
	// Fetch all three databases in parallel
	const [members, nonMembers, students] = await Promise.all([
		fetchFromEvent('1'),
		fetchFromEvent('2'),
		fetchFromEvent('3')
	]);

	const allAttendees = [...members.attendees, ...nonMembers.attendees, ...students.attendees];
	const allRegistered = [...members.registered, ...nonMembers.registered, ...students.registered];

	return json({
		success: true,
		count: allRegistered.length || allAttendees.length,
		attendees: allAttendees,
		registered: allRegistered
	});
};
