import { env } from '$env/dynamic/private';

const EVENT_LABELS: Record<string, string> = {
	'1': 'Members',
	'2': 'Non-Members',
	'3': 'Students'
};

/**
 * Resolves the correct Apps Script URL based on the eventId (1, 2, or 3).
 * Returns the URL or null if not configured, plus the event label.
 */
export function getScriptUrl(eventId: string | number | null | undefined): {
	url: string;
	label: string;
	configured: boolean;
} {
	const id = String(eventId ?? '1').trim();
	const label = EVENT_LABELS[id] ?? 'Members';

	const url1 = env.APPS_SCRIPT_URL || process.env.APPS_SCRIPT_URL || '';
	const url2 = env.APPS_SCRIPT_URL_2 || process.env.APPS_SCRIPT_URL_2 || '';
	const url3 = env.APPS_SCRIPT_URL_3 || process.env.APPS_SCRIPT_URL_3 || '';

	let url: string;
	if (id === '2') {
		url = url2 || url1;
	} else if (id === '3') {
		url = url3 || url1;
	} else {
		url = url1;
	}

	const configured = !!url && !url.startsWith('PASTE_');
	return { url, label, configured };
}
