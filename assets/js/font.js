// Site-wide configuration. This is the ONLY file you should need to
// edit to connect this website to your Cloudflare API — everything
// else in assets/js/app.js imports these values instead of hardcoding
// them, so a single change here updates every page.

// After deploying cloudflare-api (see its README), paste the URL
// Cloudflare gives you here. It looks like:
// https://your-worker-name.your-subdomain.workers.dev
export const API_BASE_URL = 'https://your-worker-name.your-subdomain.workers.dev';

// Shown while the real value loads from /api/settings, and used as a
// fallback if that request ever fails.
export const WEBSITE_NAME = 'My Store';
export const CURRENCY_SYMBOL = '৳';

export const VERSION = '1.0.0';
