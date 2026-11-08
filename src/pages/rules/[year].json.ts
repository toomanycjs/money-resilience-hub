// The rules files as open data, served at /rules/<year>.json under CC BY 4.0.
import { getYear, listYears } from '@money-resilience-hub/rules';

export function getStaticPaths() {
	return listYears().map((y) => ({ params: { year: y.taxYear } }));
}

export function GET({ params }: { params: { year: string } }) {
	const year = getYear(params.year);
	const body = JSON.stringify({ licence: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'The Money Resilience Hub', ...year }, null, 2);
	return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
