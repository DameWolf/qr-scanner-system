import { json } from '@sveltejs/kit';
import { APPS_SCRIPT_URL } from '$env/static/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const url = APPS_SCRIPT_URL;

	if (!url || url === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
		return json(
			{
				success: false,
				count: 0,
				attendees: [],
				registered: [],
				error: 'APPS_SCRIPT_URL not configured. Set it in your .env file.'
			},
			{ status: 500 }
		);
	}

	try {
		const response = await fetch(url, {
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
