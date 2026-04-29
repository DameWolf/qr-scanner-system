import type { RequestHandler } from './$types';

/**
 * Proxies a Google Drive file (image/PDF) so it can be embedded in the app
 * without hitting Drive's frame-ancestors CSP.
 * File must be shared "Anyone with the link can view".
 */
export const GET: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
		return new Response('Invalid id', { status: 400 });
	}

	const driveUrl = `https://drive.google.com/uc?export=download&id=${id}`;

	try {
		const res = await fetch(driveUrl, {
			redirect: 'follow',
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; LiceoAttendance/1.0)'
			}
		});

		if (!res.ok) {
			return new Response(`Drive returned ${res.status}`, { status: 502 });
		}

		const contentType = res.headers.get('content-type') || 'application/octet-stream';
		const body = res.body;

		return new Response(body, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'private, max-age=300'
			}
		});
	} catch (e) {
		console.error('Drive proxy error:', e);
		return new Response('Failed to load file', { status: 502 });
	}
};
