// Regenerate gen_* fixtures: one filing per trade, filed = tx + delay (some intentionally late).
const fs = require('fs');
const idx = JSON.parse(fs.readFileSync(__dirname + '/index.json', 'utf8'));

idx.filings = idx.filings.filter((f) => !f.external_doc_id.startsWith('FTM-GEN-'));
for (const f of fs.readdirSync(__dirname).filter((x) => x.startsWith('gen_'))) fs.unlinkSync(__dirname + '/' + f);

const ro = JSON.parse(fs.readFileSync(__dirname + '/lawmakers_full.json', 'utf8')).lawmakers;
const byBio = Object.fromEntries(ro.map((l) => [l.bioguide_id, l]));

const T = [
  ['M001157', 'NVDA', 'NVIDIA Corp', 'Technology', 'P', '2024-05-01', '$100,001 - $250,000', 'filer'],
  ['M001157', 'V', 'Visa Inc', 'Financials', 'P', '2024-06-10', '$50,001 - $100,000', 'spouse'],
  ['M001157', 'AVGO', 'Broadcom Inc', 'Technology', 'P', '2024-07-02', '$250,001 - $500,000', 'filer'],
  ['M001157', 'LMT', 'Lockheed Martin Corp', 'Industrials', 'P', '2024-03-05', '$15,001 - $50,000', 'filer'],
  ['M001157', 'RTX', 'RTX Corp', 'Industrials', 'P', '2024-04-12', '$50,001 - $100,000', 'joint'],
  ['T000250', 'COIN', 'Coinbase Global Inc', 'Financials', 'P', '2024-08-01', '$100,001 - $250,000', 'filer'],
  ['T000250', 'PLD', 'Prologis Inc', 'Real Estate', 'S', '2024-09-05', '$15,001 - $50,000', 'spouse'],
  ['C001120', 'XOM', 'Exxon Mobil Corp', 'Energy', 'P', '2024-02-20', '$50,001 - $100,000', 'filer'],
  ['C001120', 'CVX', 'Chevron Corp', 'Energy', 'P', '2024-10-01', '$100,001 - $250,000', 'filer'],
  ['K000389', 'AAPL', 'Apple Inc', 'Technology', 'P', '2024-01-15', '$15,001 - $50,000', 'filer'],
  ['K000389', 'AMD', 'Advanced Micro Devices', 'Technology', 'S', '2024-11-01', '$250,001 - $500,000', 'filer'],
  ['W000817', 'JPM', 'JPMorgan Chase & Co', 'Financials', 'P', '2024-05-10', '$1,001 - $15,000', 'spouse'],
  ['W000817', 'PFE', 'Pfizer Inc', 'Health Care', 'S', '2024-06-20', '$15,001 - $50,000', 'spouse'],
  ['G000555', 'DVN', 'Devon Energy Corp', 'Energy', 'P', '2024-04-03', '$50,001 - $100,000', 'spouse'],
  ['G000555', 'UNH', 'UnitedHealth Group Inc', 'Health Care', 'P', '2024-08-12', '$100,001 - $250,000', 'spouse'],
  ['C000127', 'MSFT', 'Microsoft Corp', 'Technology', 'P', '2024-03-14', '$15,001 - $50,000', 'spouse'],
  ['C000127', 'AMZN', 'Amazon.com Inc', 'Consumer Discretionary', 'P', '2024-09-10', '$50,001 - $100,000', 'spouse'],
  ['S000033', 'KO', 'Coca-Cola Co', 'Consumer Staples', 'P', '2024-02-05', '$1,001 - $15,000', 'spouse'],
  ['S000033', 'HD', 'Home Depot Inc', 'Consumer Discretionary', 'S', '2024-07-08', '$15,001 - $50,000', 'spouse'],
  ['D000563', 'JNJ', 'Johnson & Johnson', 'Health Care', 'P', '2024-05-06', '$100,001 - $250,000', 'spouse'],
  ['D000563', 'PG', 'Procter & Gamble Co', 'Consumer Staples', 'P', '2024-10-07', '$50,001 - $100,000', 'spouse'],
  ['B001261', 'XEL', 'Xcel Energy Inc', 'Utilities', 'P', '2024-03-11', '$15,001 - $50,000', 'spouse'],
  ['B001261', 'SO', 'Southern Co', 'Utilities', 'P', '2024-06-03', '$50,001 - $100,000', 'spouse'],
  ['F000454', 'DIS', 'Walt Disney Co', 'Communication Services', 'P', '2024-04-08', '$50,001 - $100,000', 'spouse'],
  ['F000454', 'NFLX', 'Netflix Inc', 'Communication Services', 'P', '2024-09-16', '$100,001 - $250,000', 'spouse'],
  ['C001056', 'NVDA', 'NVIDIA Corp', 'Technology', 'S', '2024-12-02', '$250,001 - $500,000', 'filer'],
  ['C001056', 'GOOGL', 'Alphabet Inc', 'Technology', 'P', '2024-01-22', '$100,001 - $250,000', 'filer'],
  ['S001217', 'META', 'Meta Platforms Inc', 'Technology', 'P', '2024-05-13', '$15,001 - $50,000', 'filer'],
  ['S001217', 'LLY', 'Eli Lilly and Co', 'Health Care', 'P', '2024-08-05', '$100,001 - $250,000', 'filer'],
  ['O000172', 'TSLA', 'Tesla Inc', 'Consumer Discretionary', 'P', '2024-06-17', '$15,001 - $50,000', 'filer'],
  ['O000172', 'MRK', 'Merck & Co Inc', 'Health Care', 'S', '2024-10-14', '$50,001 - $100,000', 'filer'],
  ['H001042', 'NOC', 'Northrop Grumman Corp', 'Industrials', 'P', '2024-02-12', '$100,001 - $250,000', 'spouse'],
  ['H001042', 'NEE', 'NextEra Energy Inc', 'Utilities', 'P', '2024-11-04', '$50,001 - $100,000', 'spouse'],
  ['W000805', 'COP', 'ConocoPhillips', 'Energy', 'P', '2024-03-18', '$50,001 - $100,000', 'spouse'],
  ['W000805', 'ADBE', 'Adobe Inc', 'Technology', 'S', '2024-07-15', '$100,001 - $250,000', 'spouse'],
  ['E000294', 'PEP', 'PepsiCo Inc', 'Consumer Staples', 'P', '2024-04-15', '$15,001 - $50,000', 'filer'],
  ['E000294', 'COST', 'Costco Wholesale Corp', 'Consumer Staples', 'P', '2024-09-09', '$100,001 - $250,000', 'filer'],
  ['M000355', 'T', 'AT&T Inc', 'Communication Services', 'P', '2024-05-20', '$1,001 - $15,000', 'filer'],
  ['M000355', 'VZ', 'Verizon Communications', 'Communication Services', 'P', '2024-08-19', '$15,001 - $50,000', 'filer'],
  ['R000575', 'GS', 'Goldman Sachs Group', 'Financials', 'P', '2024-06-24', '$250,001 - $500,000', 'filer'],
  ['R000575', 'MS', 'Morgan Stanley', 'Financials', 'P', '2024-10-21', '$100,001 - $250,000', 'filer'],
];

const delays = [14, 19, 21, 23, 38, 76, 139, 105, 207];
let n = 0;
const sectorMap = {};
for (const [bio, tk, nm, sector, type, tx, range, owner] of T) {
  const lm = byBio[bio];
  if (!lm) { console.error('unknown bioguide', bio); continue; }
  n++;
  const delay = delays[(n * 7) % delays.length];
  const filed = new Date(tx + 'T00:00:00Z');
  filed.setUTCDate(filed.getUTCDate() + delay);
  const filedAt = filed.toISOString().slice(0, 10);
  const id = 'FTM-GEN-' + String(1000 + n);
  const file = 'gen_' + bio.toLowerCase() + '_' + tk.toLowerCase() + '.txt';
  const ownerCell = owner === 'filer' ? '' : owner;
  const body =
    'House of Representatives / United States Senate\nPeriodic Transaction Report\nFiler: ' +
    lm.name.toUpperCase() +
    '\nFiling Date: ' + filedAt +
    '\n\nOwner | Asset | Type | Transaction Date | Amount\n' +
    ownerCell + ' | ' + nm + ' (' + tk + ') | ' + type + ' | ' +
    tx.slice(5, 7) + '/' + tx.slice(8, 10) + '/' + tx.slice(0, 4) + ' | ' + range + '\n';
  fs.writeFileSync(__dirname + '/' + file, body);
  idx.filings.push({
    file,
    chamber: lm.chamber,
    source: lm.chamber === 'senate' ? 'senate_efd' : 'house_clerk_yearly',
    external_doc_id: id,
    filed_at: filedAt,
    source_url: 'https://disclosures-clerk.house.gov/PublicDisclosure/FinancialDisclosure/ViewFiling?FilingReferenceID=' + id,
    raw_kind: 'pdf',
    filer: { printed_name: lm.name.toUpperCase(), bioguide_id: bio, state: lm.state, district: lm.district },
  });
  sectorMap[id] = { [tk]: sector };
}
fs.writeFileSync(__dirname + '/sectors.json', JSON.stringify(sectorMap, null, 1));
fs.writeFileSync(__dirname + '/index.json', JSON.stringify(idx, null, 1));
console.log('total filings in index:', idx.filings.length, '| generated:', n);
