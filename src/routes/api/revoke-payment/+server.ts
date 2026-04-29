import { json } from '@sveltejs/kit';
import { APPS_SCRIPT_URL } from '$env/static/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const url = APPS_SCRIPT_URL;

    if (!url || url === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
        return json(
            {
                success: false,
                message: 'APPS_SCRIPT_URL not configured. Set it in your .env file.'
            },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const certId = body.certId?.trim();

        if (!certId) {
            return json(
                { success: false, message: 'certId is required' },
                { status: 400 }
            );
        }

        // Ensure we send 'revokePayment' action to Apps Script
        const response = await fetch(url, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'revokePayment', certId })
        });

        const text = await response.text();

        if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
            console.error(
                'Apps Script returned HTML instead of JSON:',
                text.substring(0, 200)
            );
            return json(
                {
                    success: false,
                    message: 'Apps Script error. Please redeploy the script.'
                },
                { status: 502 }
            );
        }

        const data = JSON.parse(text);
        return json(data);
    } catch (error) {
        console.error('Failed to revoke payment:', error);
        return json(
            { success: false, message: 'Failed to revoke payment' },
            { status: 500 }
        );
    }
};
