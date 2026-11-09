// Plain labels for the config values added for the landlord and side hustle
// tools: finance cost relief, rent a room, Self Assessment payments, Making
// Tax Digital for Income Tax and digital platform reporting. Keyed by config
// path, in the same form as LABELS in rates.ts.
//
// Values that are not money, for whoever formats them on the rates pages:
//   - incomeTax.property.financeCostReliefBasis is text ("basic rate" or "property basic rate").
//   - selfAssessment.paymentDue, selfAssessment.registerBy, selfAssessment.paymentsOnAccount.secondDue
//     and digitalPlatforms.reportBy are a day and month ("31 January").
//   - makingTaxDigital.incomeTest.startDate is an ISO date; makingTaxDigital.inUse.incomeYear is a tax year id ("2024-25").
//   - digitalPlatforms.salesOfGoodsLimit is a count of sales and digitalPlatforms.salesValueLimitEuros is in euros.

export const PROPERTY_LABELS: Record<string, string> = {
	'incomeTax.property.financeCostReliefRate': 'Finance cost relief rate for residential landlords',
	'incomeTax.property.financeCostReliefBasis': 'Finance cost relief is given at',
	'incomeTax.property.rentARoomLimit': 'Rent a room limit',
	'incomeTax.property.rentARoomSharedLimit': 'Rent a room limit when the income is shared',
	'selfAssessment.paymentDue': 'Self Assessment bill and first payment on account due, after the tax year ends',
	'selfAssessment.registerBy': 'Register for Self Assessment by, after the tax year ends',
	'selfAssessment.paymentsOnAccount.billThreshold': 'Payments on account: none when the last bill was less than',
	'selfAssessment.paymentsOnAccount.deductedAtSourceFraction': 'Payments on account: none when more than this share of the tax was paid outside Self Assessment',
	'selfAssessment.paymentsOnAccount.eachPaymentFraction': 'Payments on account: each payment as a share of the last bill',
	'selfAssessment.paymentsOnAccount.secondDue': 'Second payment on account due, in the year after the tax year ends',
	'makingTaxDigital.incomeTest.threshold': "Making Tax Digital for Income Tax: threshold tested on this tax year's qualifying income",
	'makingTaxDigital.incomeTest.startDate': "Making Tax Digital for Income Tax: applies from, when this tax year's qualifying income is over the threshold",
	'makingTaxDigital.inUse.threshold': 'Making Tax Digital for Income Tax: threshold that decides who uses it during this tax year',
	'makingTaxDigital.inUse.incomeYear': 'Making Tax Digital for Income Tax: tax year whose qualifying income decides who uses it during this tax year',
	'digitalPlatforms.salesOfGoodsLimit': 'Digital platforms: a seller of goods is not reported below this number of sales in a calendar year',
	'digitalPlatforms.salesValueLimitEuros': 'Digital platforms: and when those sales bring in less than, in euros',
	'digitalPlatforms.salesValueLimitApproxPounds': 'Digital platforms: approximate value of the euro limit in pounds',
	'digitalPlatforms.reportBy': 'Digital platforms: report to HMRC by, in the year after the calendar year',
};
