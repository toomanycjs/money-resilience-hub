// Share image per page, generated at build: the page's heading, and for
// salary pages the headline figure with a small ruler. Same tokens as the
// site, drawn with satori and rasterised with sharp.

import { listYears, takeHome } from '@money-resilience-hub/rules';
import { money } from '@money-resilience-hub/calculators';
import fs from 'node:fs';
import satori from 'satori';
import sharp from 'sharp';
import { BUILD_DATE, SITE_NAME } from '../../config/site';
import { liveAmounts } from '../../lib/pages';

const INK = '#14213D';
const QUIET = '#5B6473';
const LEDGER = '#F1F0EC';
const THRESHOLD = '#C27C0E';

interface Card {
	slug: string;
	title: string;
	tail?: string;
	figure?: string;
	ruler?: { marks: number[]; you: number; top: number };
}

export function getStaticPaths() {
	const cards: Card[] = [
		{ slug: 'home', title: 'Take-home pay, with the working shown', tail: 'UK tax calculators where every line shows its rate, its slice and its gov.uk source' },
		{ slug: 'calculators', title: 'Calculators', tail: 'Each result with its working and the rules it used' },
		{ slug: 'calculators/take-home-pay', title: 'Take-home pay calculator', tail: 'England, Northern Ireland, Scotland and Wales, every loan plan, three pension types' },
		{ slug: 'calculators/savings-tax', title: 'Savings interest tax calculator', tail: 'The allowances, the starting rate and the savings rates from April 2027' },
		{ slug: 'calculators/landlord-tax', title: 'Landlord tax calculator', tail: 'Rental profit at the property rates from April 2027' },
		{ slug: 'calculators/state-pension-tax', title: 'State Pension tax calculator', tail: 'Income tax on pensions and the Pension Tax Allowance from April 2027' },
		{ slug: 'calculators/lifetime-isa-penalty', title: 'Lifetime ISA withdrawal charge', tail: 'By reason and date, with the reduced charge from 29 October 2026' },
		{ slug: 'calculators/side-hustle-tax', title: 'Side hustle tax calculator', tail: 'The trading allowance this year and from April 2027' },
		{ slug: 'salary', title: 'Salary after tax', tail: 'One page per salary, computed from the rules file' },
		{ slug: 'rates', title: 'Rates and allowances', tail: 'Every figure with its source, the date it was checked and its status' },
		{ slug: 'budget/2026-autumn', title: 'Budget 2026: what changed', tail: 'Measures, effective dates and worked examples' },
		{ slug: 'methodology', title: 'Methodology', tail: 'How the figures are sourced, computed and tested' },
		{ slug: 'about', title: `About ${SITE_NAME}`, tail: 'Information, not advice' },
		{ slug: 'privacy', title: 'Privacy', tail: 'Your inputs stay in your browser' },
		{ slug: 'editorial-policy', title: 'Editorial policy', tail: 'How figures and pages are checked' },
		{ slug: 'corrections', title: 'Corrections', tail: 'What was wrong, when, and what changed' },
	];
	for (const y of listYears()) cards.push({ slug: `rates/${y.taxYear}`, title: `Rates and allowances ${y.label}`, tail: 'Every figure with its source and the date it was checked' });
	for (const amount of liveAmounts('salary')) {
		const b = takeHome({ gross: amount, nation: 'england-ni', asAt: BUILD_DATE }, { withMarginal: false });
		cards.push({
			slug: `salary/${amount}`,
			title: `${money(amount, 0)} after tax`,
			tail: `a month in ${b.label}, England and Northern Ireland, standard tax code`,
			figure: money(b.periods.monthly, 0),
			ruler: { marks: b.thresholds.map((t) => t.value), you: amount, top: Math.max(150000, amount * 1.1) },
		});
	}
	return cards.map((c) => ({ params: { slug: c.slug }, props: c }));
}

export async function GET({ props }: { props: Card }) {
	const display = fs.readFileSync('./design/fonts/newsreader-static-600.ttf');
	const body = fs.readFileSync('./design/fonts/publicsans-regular.ttf');
	const { title, tail, figure, ruler } = props;

	const rulerNode = ruler
		? {
				type: 'div',
				props: {
					style: { display: 'flex', position: 'relative', height: '40px', marginTop: '28px', width: '100%' },
					children: [
						{ type: 'div', props: { style: { position: 'absolute', left: 0, right: 0, top: '19px', height: '2px', backgroundColor: INK } } },
						...ruler.marks.map((m) => ({ type: 'div', props: { style: { position: 'absolute', left: `${Math.min(100, (m / ruler.top) * 100)}%`, top: '10px', width: '3px', height: '20px', backgroundColor: THRESHOLD } } })),
						{ type: 'div', props: { style: { position: 'absolute', left: `${Math.min(100, (ruler.you / ruler.top) * 100)}%`, top: '12px', width: '16px', height: '16px', marginLeft: '-8px', borderRadius: '8px', backgroundColor: INK } } },
					],
				},
			}
		: null;

	const svg = await satori(
		{
			type: 'div',
			props: {
				style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', padding: '60px 72px 52px', fontFamily: 'Public Sans', color: INK },
				children: [
					{ type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', fontSize: '26px', color: QUIET, borderBottom: `1px solid ${LEDGER}`, paddingBottom: '18px' }, children: [{ type: 'span', props: { children: SITE_NAME } }, { type: 'span', props: { children: 'Facts, not advice' } }] } },
					{ type: 'div', props: { style: { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }, children: [
						{ type: 'div', props: { style: { fontFamily: 'Newsreader', fontSize: figure ? '56px' : '68px', lineHeight: 1.05, letterSpacing: '-0.01em' }, children: title } },
						figure ? { type: 'div', props: { style: { fontFamily: 'Newsreader', fontSize: '132px', lineHeight: 1, letterSpacing: '-0.02em', marginTop: '18px' }, children: figure } } : null,
						figure ? { type: 'div', props: { style: { fontSize: '30px', color: QUIET, marginTop: '6px' }, children: tail } } : { type: 'div', props: { style: { fontSize: '32px', color: QUIET, marginTop: '22px', lineHeight: 1.3 }, children: tail ?? '' } },
						rulerNode,
					].filter(Boolean) } },
				],
			},
		},
		{
			width: 1200,
			height: 630,
			fonts: [
				{ name: 'Newsreader', data: display, weight: 600, style: 'normal' },
				{ name: 'Public Sans', data: body, weight: 400, style: 'normal' },
			],
		},
	);
	const png = await sharp(Buffer.from(svg)).png().toBuffer();
	return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
