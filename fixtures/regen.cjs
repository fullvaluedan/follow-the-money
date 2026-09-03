// Big fixture expansion: ~200 trades across ~85 members, deterministic.
// One filing per trade (PTR cadence), filed = tx + delay, ~20% intentionally late.
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

const idx = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
idx.filings = idx.filings.filter((f) => !f.external_doc_id.startsWith('FTM-GEN-'));
for (const f of fs.readdirSync(DIR).filter((x) => x.startsWith('gen_'))) fs.unlinkSync(path.join(DIR, f));

const ro = JSON.parse(fs.readFileSync(path.join(DIR, 'lawmakers_full.json'), 'utf8')).lawmakers;

// Deterministic RNG
let seed = 1337;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// Ticker pool: [ticker, name, sector, bias] bias: +1 winner 2024, -1 laggard, 0 neutral
const POOL = [
  ['NVDA', 'NVIDIA Corp', 'Technology', 1],
  ['AVGO', 'Broadcom Inc', 'Technology', 1],
  ['META', 'Meta Platforms Inc', 'Technology', 1],
  ['ANET', 'Arista Networks', 'Technology', 1],
  ['MSFT', 'Microsoft Corp', 'Technology', 1],
  ['AAPL', 'Apple Inc', 'Technology', 0],
  ['GOOGL', 'Alphabet Inc', 'Technology', 1],
  ['AMD', 'Advanced Micro Devices', 'Technology', 1],
  ['CRM', 'Salesforce Inc', 'Technology', 0],
  ['ORCL', 'Oracle Corp', 'Technology', 1],
  ['INTC', 'Intel Corp', 'Technology', -1],
  ['ADBE', 'Adobe Inc', 'Technology', -1],
  ['NOW', 'ServiceNow Inc', 'Technology', 0],
  ['MU', 'Micron Technology', 'Technology', 1],
  ['SMCI', 'Super Micro Computer', 'Technology', 1],
  ['JPM', 'JPMorgan Chase & Co', 'Financials', 1],
  ['GS', 'Goldman Sachs Group', 'Financials', 1],
  ['MS', 'Morgan Stanley', 'Financials', 1],
  ['V', 'Visa Inc', 'Financials', 0],
  ['MA', 'Mastercard Inc', 'Financials', 0],
  ['BAC', 'Bank of America', 'Financials', 0],
  ['COIN', 'Coinbase Global Inc', 'Financials', 1],
  ['BLK', 'BlackRock Inc', 'Financials', 1],
  ['SCHW', 'Charles Schwab Corp', 'Financials', 0],
  ['AXP', 'American Express Co', 'Financials', 1],
  ['LLY', 'Eli Lilly and Co', 'Health Care', 1],
  ['UNH', 'UnitedHealth Group Inc', 'Health Care', 0],
  ['JNJ', 'Johnson & Johnson', 'Health Care', -1],
  ['MRK', 'Merck & Co Inc', 'Health Care', -1],
  ['PFE', 'Pfizer Inc', 'Health Care', -1],
  ['ABBV', 'AbbVie Inc', 'Health Care', 1],
  ['ISRG', 'Intuitive Surgical', 'Health Care', 0],
  ['VRTX', 'Vertex Pharmaceuticals', 'Health Care', 0],
  ['CVX', 'Chevron Corp', 'Energy', 0],
  ['XOM', 'Exxon Mobil Corp', 'Energy', 0],
  ['COP', 'ConocoPhillips', 'Energy', 0],
  ['DVN', 'Devon Energy Corp', 'Energy', -1],
  ['SLB', 'Schlumberger NV', 'Energy', -1],
  ['PSX', 'Phillips 66', 'Energy', -1],
  ['LMT', 'Lockheed Martin Corp', 'Industrials', 1],
  ['RTX', 'RTX Corp', 'Industrials', 1],
  ['NOC', 'Northrop Grumman Corp', 'Industrials', 0],
  ['GE', 'GE Aerospace', 'Industrials', 1],
  ['CAT', 'Caterpillar Inc', 'Industrials', 1],
  ['UNP', 'Union Pacific Corp', 'Industrials', 0],
  ['HON', 'Honeywell International', 'Industrials', -1],
  ['BA', 'Boeing Co', 'Industrials', -1],
  ['AMZN', 'Amazon.com Inc', 'Consumer Discretionary', 1],
  ['TSLA', 'Tesla Inc', 'Consumer Discretionary', 1],
  ['HD', 'Home Depot Inc', 'Consumer Discretionary', -1],
  ['MCD', "McDonald's Corp", 'Consumer Discretionary', 0],
  ['NKE', 'Nike Inc', 'Consumer Discretionary', -1],
  ['LOW', 'Lowe\u2019s Companies', 'Consumer Discretionary', -1],
  ['TJX', 'TJX Companies', 'Consumer Discretionary', 0],
  ['COST', 'Costco Wholesale Corp', 'Consumer Staples', 1],
  ['WMT', 'Walmart Inc', 'Consumer Staples', 1],
  ['PG', 'Procter & Gamble Co', 'Consumer Staples', 0],
  ['KO', 'Coca-Cola Co', 'Consumer Staples', 0],
  ['PEP', 'PepsiCo Inc', 'Consumer Staples', -1],
  ['MDLZ', 'Mondelez International', 'Consumer Staples', -1],
  ['CL', 'Colgate-Palmolive Co', 'Consumer Staples', -1],
  ['NFLX', 'Netflix Inc', 'Communication Services', 1],
  ['DIS', 'Walt Disney Co', 'Communication Services', -1],
  ['T', 'AT&T Inc', 'Communication Services', 0],
  ['VZ', 'Verizon Communications', 'Communication Services', -1],
  ['TMUS', 'T-Mobile US Inc', 'Communication Services', 1],
  ['NEE', 'NextEra Energy Inc', 'Utilities', 0],
  ['SO', 'Southern Co', 'Utilities', 0],
  ['DUK', 'Duke Energy Corp', 'Utilities', -1],
  ['XEL', 'Xcel Energy Inc', 'Utilities', -1],
  ['PLD', 'Prologis Inc', 'Real Estate', -1],
  ['AMT', 'American Tower Corp', 'Real Estate', -1],
  ['SPG', 'Simon Property Group', 'Real Estate', 0],
];

const RANGES = [
  '$1,001 - $15,000', '$1,001 - $15,000', '$15,001 - $50,000', '$15,001 - $50,000',
  '$50,001 - $100,000', '$100,001 - $250,000', '$250,001 - $500,000',
];
const OWNERS = ['filer', 'filer', 'filer', 'spouse', 'spouse', 'joint'];
const DELAYS = [14, 16, 18, 19, 21, 23, 25, 28, 31, 33, 38, 44, 52, 61, 76, 88, 105, 120, 139, 160, 207];

// Choose ~85 members deterministically: prefer well-known names first for recognizability
const PRIORITY = ['P000197','M001157','C001120','K000389','T000250','W000817','C000127','S000033','G000555','D000563','B001261','F000454','C001056','S001217','O000172','H001042','W000805','E000294','M000355','R000575','M000355','R000122','J000293','B001230','P000595','K000367','H001046','C001098','B001267','S001150','W000779','M001111','C000174','C001070','B000575','T000461','R000595','M000639','F000062','E000215','L000551','S000510','N000002','M000087','J000126','C001067','R000576','G000546','R000601','M001190','D000628','J000299','H001053','B001248','L000577','C001095','S001198','P000616','M001208','O000173','T000483','A000377','B001285','G000583','L000578','C001103','W000812','G000577','D000617','B001260','F000462','L000582','S000344','H001047','K000384','B001288','V000128','H001061','C001113','B001275','E000295','I000024','L000575','C001056'];
const seen = new Set();
const members = [];
for (const b of PRIORITY) {
  const lm = ro.find((l) => l.bioguide_id === b);
  if (lm && !seen.has(b)) { members.push(lm); seen.add(b); }
}
for (const lm of ro) {
  if (members.length >= 85) break;
  if (!seen.has(lm.bioguide_id)) { members.push(lm); seen.add(lm.bioguide_id); }
}

// Date helpers
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return iso(x); };

let n = 0;
const sectorMap = {};
const usedByTicker = new Map(); // spread same-ticker trades across members

for (const lm of members) {
  const nTrades = 2 + Math.floor(rnd() * 3); // 2-4
  for (let i = 0; i < nTrades; i++) {
    n++;
    // bias ticker choice: some members get winners, some laggards, most mixed
    const memberBias = rnd() < 0.25 ? 1 : rnd() < 0.2 ? -1 : 0;
    let cand = POOL.filter(([, , , b]) => (memberBias === 0 ? Math.abs(b) <= 1 : b === memberBias));
    if (cand.length === 0) cand = POOL;
    const [tk, nm, sector] = pick(cand);
    const type = rnd() < 0.62 ? 'P' : rnd() < 0.85 ? 'S' : 'E';
    const owner = pick(OWNERS);
    const range = pick(RANGES);
    // random tx date within last 360 days
    const txDate = new Date();
    txDate.setUTCDate(txDate.getUTCDate() - Math.floor(rnd() * 360));
    const tx = iso(txDate);
    const delay = rnd() < 0.2 ? pick([61, 76, 88, 105, 120, 139, 160, 207]) : pick([14, 16, 18, 21, 23, 25, 28, 33, 38, 44]);
    const filedAt = addDays(tx, delay);
    const id = 'FTM-GEN-' + String(1000 + n);
    const file = `gen_${lm.bioguide_id.toLowerCase()}_${tk.toLowerCase()}.txt`;
    const ownerCell = owner === 'filer' ? '' : owner;
    const mm = tx.slice(5, 7), dd = tx.slice(8, 10), yy = tx.slice(0, 4);
    const body =
      'House of Representatives / United States Senate\nPeriodic Transaction Report\nFiler: ' +
      lm.name.toUpperCase() + '\nFiling Date: ' + filedAt +
      '\n\nOwner | Asset | Type | Transaction Date | Amount\n' +
      ownerCell + ' | ' + nm + ' (' + tk + ') | ' + type + ' | ' + mm + '/' + dd + '/' + yy + ' | ' + range + '\n';
    fs.writeFileSync(path.join(DIR, file), body);
    idx.filings.push({
      file,
      chamber: lm.chamber,
      source: lm.chamber === 'senate' ? 'senate_efd' : 'house_clerk_yearly',
      external_doc_id: id,
      filed_at: filedAt,
      source_url: 'https://disclosures-clerk.house.gov/PublicDisclosure/FinancialDisclosure/ViewFiling?FilingReferenceID=' + id,
      raw_kind: 'pdf',
      filer: { printed_name: lm.name.toUpperCase(), bioguide_id: lm.bioguide_id, state: lm.state, district: lm.district },
    });
    sectorMap[id] = { [tk]: sector };
  }
}
fs.writeFileSync(path.join(DIR, 'sectors.json'), JSON.stringify(sectorMap, null, 1));
fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(idx, null, 1));
console.log('members:', members.length, '| generated filings:', n, '| index total:', idx.filings.length);
