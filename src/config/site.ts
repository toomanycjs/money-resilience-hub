// Site-wide constants.

import { today, yearFor } from '@money-resilience-hub/rules';

export const SITE_NAME = 'The Money Resilience Hub';
export const SITE_URL = 'https://www.moneyresiliencehub.co.uk';
export const SITE_DESCRIPTION =
	'UK take-home pay and tax calculators that show their working: every deduction on its own line, with the rate, the threshold and the gov.uk page it came from.';

/** Author and publisher of every page. */
export const AUTHOR = { name: 'The Money Resilience Hub', path: '/about/' };

/** The date the rules are read as at. Set BUILD_DATE to build for another day. */
export const BUILD_DATE: string = process.env.BUILD_DATE ?? today();

/** The tax year the tools use by default: the one containing the build date. */
export const CURRENT_YEAR = yearFor(BUILD_DATE);

/** Ads are off until traffic qualifies. Slots are reserved in the templates but render nothing. */
export const ADS_ENABLED = false;

/** Hosts allowed to serve scripts: Google Analytics. The consent platform and ad stack join it when ads start. */
export const SCRIPT_ALLOWLIST: string[] = ['www.googletagmanager.com'];

export const CONTACT_EMAIL = 'hello@moneyresiliencehub.co.uk';
export const REPO_URL = 'https://github.com/toomanycjs/money-resilience-hub';
