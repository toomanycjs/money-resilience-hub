// The guides registry: one entry per explainer in src/pages/guides. The
// index, the guide pages, the share images and the RSS feed read from here.
// Titles and descriptions that carry a figure build it from the rules, so
// they move when the rules do.

import { bandsFor, defaultTaxCode, getYear, listYears, nextYear, pensionTaxAllowance, previousYear, resolve } from '@money-resilience-hub/rules';
import { longDate, money, pct } from '@money-resilience-hub/calculators';
import { BUILD_DATE, CURRENT_YEAR } from '../config/site';

export interface GuideCalculator {
	href: string;
	title: string;
	/** One line on what the tool adds to the guide. */
	desc: string;
}

export interface Guide {
	slug: string;
	/** The page title, at most 60 characters. */
	title: string;
	/** The question the guide answers. */
	h1: string;
	/** The meta description and the line on the index, at most 160 characters. */
	description: string;
	/** ISO dates. */
	published: string;
	reviewedOn: string;
	/** The calculator the guide belongs to. */
	calculator: GuideCalculator;
	/** A draft lives in src/drafts/guides and is built only with DRAFTS=1, at /drafts/<slug>/, noindex. */
	draft?: boolean;
	/** A date the draft is planned to go live, if one has been chosen. */
	publishOn?: string;
}

const TAKE_HOME: GuideCalculator = {
	href: '/calculators/take-home-pay/',
	title: 'Take-home pay calculator',
	desc: 'Enter your own salary, tax code, pension and student loan plan, and see every deduction on its own line.',
};
const STATE_PENSION: GuideCalculator = {
	href: '/calculators/state-pension-tax/',
	title: 'State Pension tax calculator',
	desc: 'Enter your State Pension and other income, and see the tax with and without the Pension Tax Allowance.',
};

const SAVINGS_TAX: GuideCalculator = {
	href: '/calculators/savings-tax/',
	title: 'Savings interest tax calculator',
	desc: 'Enter your interest and other income, and see how much is tax free and what the rest costs this year and from April 2027.',
};
const LANDLORD: GuideCalculator = {
	href: '/calculators/landlord-tax/',
	title: 'Landlord tax calculator',
	desc: 'Enter your rent, expenses, mortgage interest and other income, and see the tax on your profit this year and next, with the reduction on its own line.',
};
const SIDE_HUSTLE: GuideCalculator = {
	href: '/calculators/side-hustle-tax/',
	title: 'Side hustle tax calculator',
	desc: 'Enter what the side hustle brought in, its costs and your other income, and see the tax, Class 4 and what Self Assessment asks for and when.',
};

const PUBLISHED = '2026-11-09';

const year = CURRENT_YEAR;
const asAt = BUILD_DATE;
const pa = resolve(year.incomeTax.personalAllowance, 'incomeTax.personalAllowance', asAt).value;
const taperStart = resolve(year.incomeTax.taperStart, 'incomeTax.taperStart', asAt).value;
const taperRate = resolve(year.incomeTax.taperRate, 'incomeTax.taperRate', asAt).value;
const taperEnd = taperStart + pa / taperRate;
const taperWords = `${money(1, 0)} for every ${money(1 / taperRate, 0)}`;
const code = defaultTaxCode(year, asAt);
const scottishBands = bandsFor(year, 'scotland').length;

/** The savings rates of the following tax year, read as at the day it starts, for the savings guide. */
const following = nextYear(year.taxYear);
const savingsNext = following
	? {
			starts: following.starts,
			basic: resolve(following.incomeTax.savings.rates.basic, 'incomeTax.savings.rates.basic', following.starts).value,
			higher: resolve(following.incomeTax.savings.rates.higher, 'incomeTax.savings.rates.higher', following.starts).value,
			additional: resolve(following.incomeTax.savings.rates.additional, 'incomeTax.savings.rates.additional', following.starts).value,
		}
	: null;
const psaBasic = resolve(year.incomeTax.savings.personalSavingsAllowance.basic, 'incomeTax.savings.personalSavingsAllowance.basic', asAt).value;
/** The middle of the savings guide's assumed interest rates; a scenario assumption, not market data. */
const SAVINGS_RATE = 0.04;

/** The first tax year that has a Pension Tax Allowance, with its maximum. */
const ptaYear = listYears().find((y) => y.pensionTaxAllowance) ?? null;
const pta = ptaYear ? pensionTaxAllowance(0, ptaYear, ptaYear.starts) : null;

/** The year the property income rates start, the year before it, and the rates and relief the landlord guide names. */
const propertyYear = getYear('2027-28');
const propertyYearBefore = previousYear(propertyYear.taxYear);
if (!propertyYearBefore) throw new Error(`No tax year recorded before ${propertyYear.label}`);
const propertyRates = (['basic', 'higher', 'additional'] as const).map((n) => pct(resolve(propertyYear.incomeTax.property.rates[n], `incomeTax.property.rates.${n}`, propertyYear.starts).value));
const propertyMonth = longDate(propertyYear.starts).replace(/^\d+ /, '');

/** The trading allowance now and in the next tax year, where the rules file has one. */
const tradingAllowance = resolve(year.incomeTax.tradingAllowance, 'incomeTax.tradingAllowance', asAt).value;
const nextTradingAllowance = following ? resolve(following.incomeTax.tradingAllowance, 'incomeTax.tradingAllowance', following.starts).value : null;
const tradingAllowanceVerb = nextTradingAllowance === tradingAllowance * 3 ? 'triples' : nextTradingAllowance === tradingAllowance * 2 ? 'doubles' : 'changes';

export const GUIDES: Guide[] = [
	{
		slug: 'tax-codes-explained',
		title: `Tax codes explained: ${code}, BR, 0T, K and emergency codes`,
		h1: 'What does my tax code mean?',
		description: `What tax code ${code} means in ${year.label}, how the number sets your allowance, and what BR, D0, 0T, NT, K, emergency and S or C codes do to take-home pay.`,
		published: PUBLISHED,
		reviewedOn: PUBLISHED,
		calculator: TAKE_HOME,
	},
	{
		slug: 'why-your-payslip-differs',
		title: 'Why your payslip differs from a take-home pay calculator',
		h1: 'Why is my payslip different from the calculator?',
		description: 'Six reasons a payslip differs from an annual take-home figure: PAYE by pay period, tax code changes, pension method, student loan plan, benefits and part years.',
		published: PUBLISHED,
		reviewedOn: PUBLISHED,
		calculator: TAKE_HOME,
	},
	{
		slug: '100000-personal-allowance-trap',
		title: `The ${money(taperStart, 0)} personal allowance trap (${year.label})`,
		h1: `What happens to the personal allowance above ${money(taperStart, 0)}?`,
		description: `Above ${money(taperStart, 0)} the personal allowance falls by ${taperWords} and is gone at ${money(taperEnd, 0)}. The marginal rate inside the band in ${year.label}, as arithmetic.`,
		published: PUBLISHED,
		reviewedOn: PUBLISHED,
		calculator: TAKE_HOME,
	},
	{
		slug: 'which-student-loan-plan',
		title: `Which student loan plan am I on? Thresholds for ${year.label}`,
		h1: 'Which student loan plan am I on?',
		description: `Who is on Plan 1, 2, 4, 5 and the postgraduate loan, each repayment threshold and rate for ${year.label}, and what each plan repays at three salaries.`,
		published: PUBLISHED,
		reviewedOn: PUBLISHED,
		calculator: TAKE_HOME,
	},
	{
		slug: 'scottish-income-tax',
		title: `Scottish income tax ${year.label}: bands, rates and take-home`,
		h1: 'How is income tax different in Scotland?',
		description: `The ${scottishBands} Scottish income tax bands for ${year.label}, the gross pay where each starts, and take-home pay in Scotland against the rest of the UK at four salaries.`,
		published: PUBLISHED,
		reviewedOn: PUBLISHED,
		calculator: TAKE_HOME,
	},
	{
		slug: 'pension-tax-allowance',
		title: 'Pension Tax Allowance: who gets it and how much',
		h1: 'What is the Pension Tax Allowance?',
		description:
			ptaYear && pta
				? `The Pension Tax Allowance takes up to ${money(pta.maximum, 0)} off income tax for people over State Pension age from ${longDate(ptaYear.starts)}. Who gets it, the taper and where it ends.`
				: 'The Pension Tax Allowance for people over State Pension age: who gets it, the taper and where it ends.',
		published: PUBLISHED,
		reviewedOn: PUBLISHED,
		calculator: STATE_PENSION,
	},
	{
		slug: 'marginal-rate-at-every-salary',
		title: `The marginal tax rate at every salary, ${year.label}`,
		h1: 'What is the marginal tax rate at every salary?',
		description: `The share of the next pound taken at every salary in ${year.label}, charted from the rules file: each band, the ${money(taperStart, 0)} taper, loans and child benefit.`,
		published: PUBLISHED,
		reviewedOn: PUBLISHED,
		calculator: TAKE_HOME,
		draft: true,
	},
	{
		slug: 'fiscal-drag-how-many-more-pay-40',
		title: 'Fiscal drag: how many more people pay the higher rate',
		h1: 'How many more people pay the higher rate than in 1990?',
		description: 'Taxpayers at the higher and additional rates every year since 1990/91, from HMRC tables, next to the higher rate threshold in cash and in current prices.',
		published: '2026-11-10',
		reviewedOn: '2026-11-10',
		calculator: TAKE_HOME,
		draft: true,
	},
	{
		slug: 'pensioners-and-income-tax',
		title: 'Pensioners and income tax: who pays, and the State Pension',
		h1: 'How many pensioners pay income tax?',
		description: 'Taxpayers aged 65 and over since 1990/91 from HMRC tables, the State Pension against the personal allowance, and what the Pension Tax Allowance removes.',
		published: '2026-11-10',
		reviewedOn: '2026-11-10',
		calculator: STATE_PENSION,
		draft: true,
	},
	{
		slug: 'savings-tax-24-how-much-before-tax',
		title: savingsNext ? `Savings tax at ${pct(savingsNext.basic)}: how much can you hold before paying tax?` : 'Savings tax: how much can you hold before paying tax?',
		h1: 'How much can I hold in savings before paying tax on the interest?',
		description: savingsNext
			? `The balance whose interest uses up the ${money(psaBasic, 0)} personal savings allowance at ${pct(SAVINGS_RATE)}, by band, and the tax above it at ${pct(savingsNext.basic)}, ${pct(savingsNext.higher)} and ${pct(savingsNext.additional)} from ${longDate(savingsNext.starts)}.`
			: `The balance whose interest uses up the ${money(psaBasic, 0)} personal savings allowance at ${pct(SAVINGS_RATE)}, by band, and the tax on interest above it in ${year.label}.`,
		published: '2026-11-10',
		reviewedOn: '2026-11-10',
		calculator: SAVINGS_TAX,
		draft: true,
	},
	{
		slug: 'landlords-mortgage-interest-2027',
		title: `Landlords: mortgage interest and the ${propertyYear.starts.slice(0, 4)} rate rise`,
		h1: `How does mortgage interest relief work, and what changes in ${propertyMonth}?`,
		description: `How finance cost relief works, one landlord's tax in ${propertyYearBefore.label} and ${propertyYear.label}, and what property rates of ${propertyRates[0]}, ${propertyRates[1]} and ${propertyRates[2]} do to the reduction.`,
		published: '2026-11-10',
		reviewedOn: '2026-11-10',
		calculator: LANDLORD,
		draft: true,
	},
	{
		slug: 'side-hustles-after-the-trading-allowance-triples',
		title: `Side hustles after the trading allowance ${tradingAllowanceVerb}`,
		h1: 'What does the higher trading allowance mean for a side hustle?',
		description:
			following && nextTradingAllowance !== null
				? `The trading allowance is ${money(tradingAllowance, 0)} in ${year.label} and ${money(nextTradingAllowance, 0)} from ${longDate(following.starts)}. Three side hustles worked for both years: tax, Class 4, what is due and when.`
				: `The trading allowance of ${money(tradingAllowance, 0)} in ${year.label} and what follows it. Three side hustles worked through the rules: tax, Class 4, what is due and when.`,
		published: '2026-11-10',
		reviewedOn: '2026-11-10',
		calculator: SIDE_HUSTLE,
		draft: true,
	},
	{
		slug: 'salary-sacrifice-now-and-from-april-2029',
		title: 'Salary sacrifice now, and from April 2029',
		h1: 'What does the salary sacrifice limit change from April 2029?',
		description: 'The National Insurance a sacrificed pension contribution saves today, for employee and employer, and what the limit announced for April 2029 takes back.',
		published: '2026-11-10',
		reviewedOn: '2026-11-10',
		calculator: TAKE_HOME,
		draft: true,
	},
	{
		slug: 'thresholds-and-inflation-since-2021',
		title: 'Tax thresholds against inflation since 2021',
		h1: 'What has the freeze on tax thresholds cost since 2021?',
		description: 'The personal allowance, the higher rate threshold and the National Insurance thresholds since 2021/22, in cash and in current prices, and what the freeze adds.',
		published: '2026-11-10',
		reviewedOn: '2026-11-10',
		calculator: TAKE_HOME,
		draft: true,
	},
	{
		slug: 'are-savers-losing-to-inflation',
		title: 'Are savers losing to inflation?',
		h1: 'Are savers losing to inflation?',
		description: 'Average instant access and cash ISA rates against CPI inflation each month since 2016, from the Bank of England and the ONS, and the return after tax.',
		published: '2026-11-10',
		reviewedOn: '2026-11-10',
		calculator: TAKE_HOME,
		draft: true,
	},
];

// The build's own limits, checked here so a rules change that lengthens a
// figure fails loudly rather than shipping a long title.
for (const g of GUIDES) {
	if (g.title.length > 60) throw new Error(`Guide ${g.slug}: title is ${g.title.length} characters ("${g.title}")`);
	if (g.description.length > 160) throw new Error(`Guide ${g.slug}: description is ${g.description.length} characters`);
}

/** Guides on the live site, in the index, the feed and the share cards. */
export const LIVE_GUIDES = GUIDES.filter((g) => !g.draft);
/** Drafts, in the order they were written. */
export const DRAFT_GUIDES = GUIDES.filter((g) => g.draft);

export function guideBySlug(slug: string): Guide {
	const g = GUIDES.find((x) => x.slug === slug);
	if (!g) throw new Error(`No guide registered with the slug ${slug}`);
	return g;
}

/** A link to a guide in the shape Related.astro takes. */
export function guideLink(slug: string, desc?: string): { title: string; href: string; desc?: string } {
	const g = guideBySlug(slug);
	return { title: g.h1, href: `/guides/${g.slug}/`, desc };
}
