// Google Analytics 4 measurement ID. Kept in its own file with no imports so
// the small script that loads analytics does not pull the rules engine into
// every page. Empty means analytics does not load, and the cookie banner,
// the footer's Cookie choices link and the privacy page's cookies section
// are not rendered, since there is then nothing to ask about.

export const GA_MEASUREMENT_ID: string = 'G-ZTP3M0WJTL';
