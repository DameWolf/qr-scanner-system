import { json } from '@sveltejs/kit';
import { getScriptUrl } from '$lib/server/getScriptUrl';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const eventId = url.searchParams.get('eventId') ?? '1';
	const { url: scriptUrl, label, configured } = getScriptUrl(eventId);

	if (!configured) {
		return json(
			{
				success: false,
				count: 0,
				attendees: [],
				registered: [],
				error: `APPS_SCRIPT_URL for "${label}" is not configured. Set it in your .env file.`
			},
			{ status: 500 }
		);
	}

	try {
		const response = await fetch(scriptUrl, {
			method: 'GET',
			redirect: 'follow',
			headers: {
				Accept: 'application/json'
			}
		});

		const text = await response.text();

		// Google Apps Script sometimes returns HTML errors instead of JSON
		if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
			console.error(
				'Apps Script returned HTML instead of JSON:',
				text.substring(0, 200)
			);
			return json(
				{
					success: false,
					count: 0,
					attendees: [],
					registered: [],
					error: 'Apps Script returned HTML error. Please redeploy the script.'
				},
				{ status: 502 }
			);
		}

		const data = JSON.parse(text);
		return json(data);
	} catch (error) {
		console.error('Failed to fetch attendees:', error);
		return json(
			{
				success: false,
				count: 0,
				attendees: [],
				registered: [],
				error: 'Failed to fetch attendees'
			},
			{ status: 500 }
		);
	}
};
