import {
	APPS_SCRIPT_URL,
	APPS_SCRIPT_URL_2,
	APPS_SCRIPT_URL_3
} from '$env/static/private';

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

	let url: string;
	if (id === '2') {
		url = APPS_SCRIPT_URL_2 ?? '';
	} else if (id === '3') {
		url = APPS_SCRIPT_URL_3 ?? '';
	} else {
		url = APPS_SCRIPT_URL ?? '';
	}

	const configured = !!url && !url.startsWith('PASTE_');
	return { url, label, configured };
}
