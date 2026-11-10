// Share image per page, generated at build: the page's heading, and for
// salary pages the headline figure with a small ruler. Same tokens as the
// site, drawn with satori and rasterised with sharp.

import { listYears, takeHome, type Nation } from '@money-resilience-hub/rules';
import { money } from '@money-resilience-hub/calculators';
import fs from 'node:fs';
import satori from 'satori';
import sharp from 'sharp';
import { BUILD_DATE, SITE_NAME } from '../../config/site';
import { LIVE_GUIDES as GUIDES } from '../../lib/guides';
import { HOURS_PER_WEEK, liveAmounts, salaryForHourly, salaryForMonthlyPay } from '../../lib/pages';
import { pagesPassingGuard } from '../../lib/salaryPage';

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
		{ slug: 'calculators/pay-rise', title: 'Pay rise calculator', tail: 'What a rise adds to take-home pay, and the share of it kept' },
		{ slug: 'calculators/bonus-tax', title: 'Bonus tax calculator', tail: 'Tax, National Insurance and student loan on a one-off bonus' },
		{ slug: 'calculators/pension-contributions', title: 'Pension contribution calculator', tail: 'Relief at source, net pay and salary sacrifice side by side' },
		{ slug: 'calculators/hourly-to-salary', title: 'Hourly rate to salary calculator', tail: 'An hourly rate as a salary, with take-home pay' },
		{ slug: 'calculators/child-benefit-charge', title: 'High Income Child Benefit Charge calculator', tail: 'Child benefit for the year, the charge and what is kept' },
		{ slug: 'calculators/mileage-allowance', title: 'Mileage allowance calculator', tail: 'The approved amount for business miles, and the relief when an employer pays less' },
		{ slug: 'calculators/maternity-pay', title: 'Statutory Maternity Pay calculator', tail: 'Week by week and in total, from average weekly earnings' },
		{ slug: 'calculators/paternity-pay', title: 'Statutory Paternity Pay calculator', tail: 'For a week and in total, with the earnings test' },
		{ slug: 'rates/scotland-2027-28', title: 'Scottish income tax 2027/28', tail: 'Bands and rates as they are set, with sources' },
		{ slug: 'salary', title: 'Salary after tax', tail: 'One page per salary, with a Scottish version of each' },
		{ slug: 'hourly', title: 'Hourly pay after tax', tail: 'One page per hourly rate, with the working shown' },
		{ slug: 'monthly', title: 'Monthly pay after tax', tail: 'What a monthly amount leaves, and the salary that leaves it' },
		{ slug: 'rates', title: 'Rates and allowances', tail: 'Every figure with its source, the date it was checked and its status' },
		{ slug: 'budget/2026-autumn', title: 'Budget 2026: what changed', tail: 'Measures, effective dates and worked examples' },
		{ slug: 'methodology', title: 'Methodology', tail: 'How the figures are sourced, computed and tested' },
		{ slug: 'about', title: `About ${SITE_NAME}`, tail: 'Information, not advice' },
		{ slug: 'privacy', title: 'Privacy', tail: 'Your inputs stay in your browser' },
		{ slug: 'editorial-policy', title: 'Editorial policy', tail: 'How figures and pages are checked' },
		{ slug: 'corrections', title: 'Corrections', tail: 'What was wrong, when, and what changed' },
	];
	for (const y of listYears()) cards.push({ slug: `rates/${y.taxYear}`, title: `Rates and allowances ${y.label}`, tail: 'Every figure with its source and the date it was checked' });
	for (const g of [{ slug: '', h1: 'Guides', description: 'One question each, answered with the number first and the gov.uk sources listed' }, ...GUIDES]) cards.push({ slug: g.slug ? `guides/${g.slug}` : 'guides', title: g.h1, tail: g.description });
	const figureCard = (slug: string, title: string, gross: number, nation: Nation, tail: string): Card => {
		const b = takeHome({ gross, nation, asAt: BUILD_DATE }, { withMarginal: false });
		return { slug, title, tail: `a month in ${b.label}, ${tail}`, figure: money(b.periods.monthly, 0), ruler: { marks: b.thresholds.map((t) => t.value), you: gross, top: Math.max(150000, gross * 1.1) } };
	};
	for (const amount of pagesPassingGuard(liveAmounts('salary'), BUILD_DATE)) cards.push(figureCard(`salary/${amount}`, `${money(amount, 0)} after tax`, amount, 'england-ni', 'England, Wales and Northern Ireland'));
	for (const amount of pagesPassingGuard(liveAmounts('salary'), BUILD_DATE, 'scotland')) cards.push(figureCard(`salary/${amount}/scotland`, `${money(amount, 0)} after tax in Scotland`, amount, 'scotland', 'Scottish income tax bands'));
	for (const rate of liveAmounts('hourly')) cards.push(figureCard(`hourly/${rate}`, `${money(rate, 0)} an hour after tax`, salaryForHourly(rate), 'england-ni', `on a ${HOURS_PER_WEEK}-hour week`));
	for (const monthly of liveAmounts('monthly')) cards.push(figureCard(`monthly/${monthly}`, `${money(monthly, 0)} a month after tax`, salaryForMonthlyPay(monthly), 'england-ni', 'from that pay before tax'));
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
