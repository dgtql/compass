/**
 * Mock data driving the slice 11 UI prototype.
 *
 * Everything in this file gets replaced by real backend calls in slice
 * 12+. Until then, the React components consume these objects directly
 * so the design can be evaluated without a data model commitment.
 */

import type {
  Analyst,
  AnalystMemo,
  AnalystTask,
  KnowledgeNote,
  MasterAgentMessage,
  TickerInfo,
} from '@/types/domain';

export const mockAnalysts: Analyst[] = [
  {
    id: 'a1',
    slug: 'maria-chen',
    name: 'Maria Chen',
    title: 'Senior Analyst · TMT',
    sector: 'Technology',
    coverage: ['NVDA', 'AMD', 'INTC', 'TSM', 'ASML', 'AVGO', 'MRVL'],
    avatarColor: 'cyan',
    avatarInitials: 'MC',
    status: 'working',
    persona:
      'Quantitative-leaning semis specialist. Treats every thesis as a supply-chain question first; comfortable with hyperscaler capex framing. Writes in plain English, no superlatives.',
    hiredAt: '2026-04-02',
    stats: { memos: 14, tasksDone: 31, activeTasks: 1 },
    currentFocus: 'NVDA earnings reaction · tonight',
  },
  {
    id: 'a2',
    slug: 'david-park',
    name: 'David Park',
    title: 'Analyst · Energy',
    sector: 'Energy',
    coverage: ['SOC', 'XOM', 'CVX', 'OXY', 'COP', 'EOG'],
    avatarColor: 'amber',
    avatarInitials: 'DP',
    status: 'review',
    persona:
      'Upstream E&P focus, particularly distressed and offshore. Strong on regulatory and litigation risk. Skeptical of management guidance by default; cites filings verbatim.',
    hiredAt: '2026-04-08',
    stats: { memos: 9, tasksDone: 22, activeTasks: 0 },
    currentFocus: null,
  },
  {
    id: 'a3',
    slug: 'aisha-patel',
    name: 'Aisha Patel',
    title: 'Analyst · Financials',
    sector: 'Financials',
    coverage: ['JPM', 'BAC', 'GS', 'MS', 'C', 'WFC'],
    avatarColor: 'violet',
    avatarInitials: 'AP',
    status: 'idle',
    persona:
      'Universal banks + I-banks. Rate-sensitive coverage. Built early career on credit-spread reading; goes to the 10-Q schedules before the headlines.',
    hiredAt: '2026-04-15',
    stats: { memos: 6, tasksDone: 14, activeTasks: 0 },
    currentFocus: null,
  },
  {
    id: 'a4',
    slug: 'tom-kovacs',
    name: 'Tom Kovacs',
    title: 'Analyst · Consumer',
    sector: 'Consumer',
    coverage: ['AMZN', 'COST', 'WMT', 'TGT', 'HD', 'LOW'],
    avatarColor: 'emerald',
    avatarInitials: 'TK',
    status: 'working',
    persona:
      'Consumer staples and big-box retail. Strong on inventory cycles + margin compression patterns. Quick to flag when a retailer is using buybacks to mask weakening unit economics.',
    hiredAt: '2026-05-01',
    stats: { memos: 4, tasksDone: 8, activeTasks: 1 },
    currentFocus: 'COST morning note',
  },
];

export const mockUniverse: TickerInfo[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation',          sector: 'Technology',  industry: 'Semiconductors',         exchange: 'NASDAQ', price: 487.20, dayChangePct: 2.1,  marketCapB: 1190, coveredBy: ['maria-chen'] },
  { symbol: 'AMD',  name: 'Advanced Micro Devices',      sector: 'Technology',  industry: 'Semiconductors',         exchange: 'NASDAQ', price: 152.40, dayChangePct: 1.5,  marketCapB: 245,  coveredBy: ['maria-chen'] },
  { symbol: 'INTC', name: 'Intel Corporation',           sector: 'Technology',  industry: 'Semiconductors',         exchange: 'NASDAQ', price: 31.55,  dayChangePct: -0.8, marketCapB: 132,  coveredBy: ['maria-chen'] },
  { symbol: 'TSM',  name: 'Taiwan Semiconductor',        sector: 'Technology',  industry: 'Semiconductors',         exchange: 'NYSE',   price: 118.30, dayChangePct: 0.6,  marketCapB: 613,  coveredBy: ['maria-chen'] },
  { symbol: 'ASML', name: 'ASML Holding',                sector: 'Technology',  industry: 'Semiconductor Equipment',exchange: 'NASDAQ', price: 712.80, dayChangePct: 1.2,  marketCapB: 282,  coveredBy: ['maria-chen'] },
  { symbol: 'AVGO', name: 'Broadcom',                    sector: 'Technology',  industry: 'Semiconductors',         exchange: 'NASDAQ', price: 1480.00,dayChangePct: 0.4,  marketCapB: 690,  coveredBy: ['maria-chen'] },
  { symbol: 'MRVL', name: 'Marvell Technology',          sector: 'Technology',  industry: 'Semiconductors',         exchange: 'NASDAQ', price: 71.20,  dayChangePct: 1.8,  marketCapB: 61,   coveredBy: ['maria-chen'] },

  { symbol: 'SOC',  name: 'Sable Offshore Corp.',        sector: 'Energy',      industry: 'Oil & Gas E&P',          exchange: 'NYSE',   price: 13.66,  dayChangePct: 3.1,  marketCapB: 2.1,  coveredBy: ['david-park'] },
  { symbol: 'XOM',  name: 'Exxon Mobil',                 sector: 'Energy',      industry: 'Integrated Oil & Gas',   exchange: 'NYSE',   price: 117.40, dayChangePct: -0.3, marketCapB: 470,  coveredBy: ['david-park'] },
  { symbol: 'CVX',  name: 'Chevron Corporation',         sector: 'Energy',      industry: 'Integrated Oil & Gas',   exchange: 'NYSE',   price: 155.10, dayChangePct: -0.1, marketCapB: 290,  coveredBy: ['david-park'] },
  { symbol: 'OXY',  name: 'Occidental Petroleum',        sector: 'Energy',      industry: 'Oil & Gas E&P',          exchange: 'NYSE',   price: 56.20,  dayChangePct: 0.9,  marketCapB: 49,   coveredBy: ['david-park'] },
  { symbol: 'COP',  name: 'ConocoPhillips',              sector: 'Energy',      industry: 'Oil & Gas E&P',          exchange: 'NYSE',   price: 109.60, dayChangePct: 0.4,  marketCapB: 130,  coveredBy: ['david-park'] },
  { symbol: 'EOG',  name: 'EOG Resources',               sector: 'Energy',      industry: 'Oil & Gas E&P',          exchange: 'NYSE',   price: 124.30, dayChangePct: 0.7,  marketCapB: 70,   coveredBy: ['david-park'] },

  { symbol: 'JPM',  name: 'JPMorgan Chase',              sector: 'Financials',  industry: 'Diversified Banks',      exchange: 'NYSE',   price: 248.50, dayChangePct: 0.5,  marketCapB: 700,  coveredBy: ['aisha-patel'] },
  { symbol: 'BAC',  name: 'Bank of America',             sector: 'Financials',  industry: 'Diversified Banks',      exchange: 'NYSE',   price: 43.80,  dayChangePct: 0.7,  marketCapB: 340,  coveredBy: ['aisha-patel'] },
  { symbol: 'GS',   name: 'Goldman Sachs',               sector: 'Financials',  industry: 'Investment Banking',     exchange: 'NYSE',   price: 615.20, dayChangePct: 1.1,  marketCapB: 200,  coveredBy: ['aisha-patel'] },
  { symbol: 'MS',   name: 'Morgan Stanley',              sector: 'Financials',  industry: 'Investment Banking',     exchange: 'NYSE',   price: 138.40, dayChangePct: 0.6,  marketCapB: 225,  coveredBy: ['aisha-patel'] },

  { symbol: 'AMZN', name: 'Amazon.com',                  sector: 'Consumer',    industry: 'Internet Retail',        exchange: 'NASDAQ', price: 222.50, dayChangePct: 0.9,  marketCapB: 2380, coveredBy: ['tom-kovacs'] },
  { symbol: 'COST', name: 'Costco Wholesale',            sector: 'Consumer',    industry: 'Hypermarkets',           exchange: 'NASDAQ', price: 1042.10,dayChangePct: 0.2,  marketCapB: 462,  coveredBy: ['tom-kovacs'] },
  { symbol: 'WMT',  name: 'Walmart',                     sector: 'Consumer',    industry: 'Hypermarkets',           exchange: 'NYSE',   price: 102.40, dayChangePct: -0.4, marketCapB: 820,  coveredBy: ['tom-kovacs'] },
  { symbol: 'HD',   name: 'Home Depot',                  sector: 'Consumer',    industry: 'Home Improvement Retail',exchange: 'NYSE',   price: 380.20, dayChangePct: -0.6, marketCapB: 378,  coveredBy: ['tom-kovacs'] },

  // unassigned ideas the PM can pick up later
  { symbol: 'AAPL', name: 'Apple Inc.',                  sector: 'Technology',  industry: 'Consumer Electronics',   exchange: 'NASDAQ', price: 232.10, dayChangePct: 0.3,  marketCapB: 3500, coveredBy: [] },
  { symbol: 'TSLA', name: 'Tesla, Inc.',                 sector: 'Consumer',    industry: 'Auto Manufacturers',     exchange: 'NASDAQ', price: 348.70, dayChangePct: -2.1, marketCapB: 1110, coveredBy: [] },
  { symbol: 'META', name: 'Meta Platforms',              sector: 'Technology',  industry: 'Internet Content',       exchange: 'NASDAQ', price: 612.30, dayChangePct: 0.8,  marketCapB: 1540, coveredBy: [] },
  { symbol: 'GOOG', name: 'Alphabet Inc.',               sector: 'Technology',  industry: 'Internet Content',       exchange: 'NASDAQ', price: 198.40, dayChangePct: 0.5,  marketCapB: 2450, coveredBy: [] },
];

export const mockMemos: AnalystMemo[] = [
  { id: 'm1', analystSlug: 'david-park',  ticker: 'SOC',  type: 'pitch',             title: 'SOC — Pitch Memo',                    date: '2026-05-12', excerpt: 'Sable Offshore is a zero-revenue California offshore oil producer carrying a $921.6M PIK term loan at 15% that matures by March 2027…', citationCount: 18 },
  { id: 'm2', analystSlug: 'maria-chen',  ticker: 'NVDA', type: 'earnings-reaction', title: 'NVDA — Q1 Earnings Reaction',         date: '2026-05-11', excerpt: 'Revenue $52.4B vs Street $50.1B (+4.5% beat). Data Center segment +212% YoY at $44.3B. Networking attach now 19% of DC rev…', citationCount: 12 },
  { id: 'm3', analystSlug: 'maria-chen',  ticker: 'AMD',  type: 'maintenance',       title: 'AMD — Q2 Maintenance Update',         date: '2026-05-09', excerpt: 'Thesis intact. MI350 ramp tracking schedule. Software stack (ROCm) still the bottleneck vs CUDA — discount to NVDA justified…', citationCount: 8 },
  { id: 'm4', analystSlug: 'tom-kovacs',  ticker: 'COST', type: 'morning-note',      title: 'COST — Morning Note',                 date: '2026-05-12', excerpt: 'April comp +5.2% (Street 4.6%). Membership renewals tracking 92%. Watch fee hike commentary on next call…', citationCount: 5 },
  { id: 'm5', analystSlug: 'aisha-patel', ticker: 'JPM',  type: 'deep-dive',         title: 'JPM — Deep Dive: Net Interest Margin', date: '2026-05-07', excerpt: 'NIM compression deeper than peers in Q1 (3.78% vs 3.92% Q4). Reciprocal-deposit mix shifted; not yet a thesis killer but worth watching…', citationCount: 14 },
];

export const mockTasks: AnalystTask[] = [
  { id: 't1', analystSlug: 'maria-chen', type: 'earnings-reaction', ticker: 'NVDA', status: 'running', description: 'NVDA earnings reaction — call drops at 5pm ET', createdAt: '2026-05-12T20:45:00Z', durationSec: 312 },
  { id: 't2', analystSlug: 'tom-kovacs', type: 'morning-note',      ticker: 'COST', status: 'running', description: 'COST morning note',                       createdAt: '2026-05-12T21:00:00Z', durationSec: 47 },
  { id: 't3', analystSlug: 'david-park', type: 'pitch',             ticker: 'SOC',  status: 'done',    description: 'SOC pitch memo',                        createdAt: '2026-05-12T15:20:00Z', durationSec: 265 },
  { id: 't4', analystSlug: 'maria-chen', type: 'fetch_filing',      ticker: 'AVGO', status: 'done',    description: 'Fetch AVGO 10-K',                       createdAt: '2026-05-12T13:00:00Z', durationSec: 18 },
  { id: 't5', analystSlug: 'aisha-patel',type: 'deep-dive',         ticker: 'JPM',  status: 'done',    description: 'JPM NIM deep dive',                     createdAt: '2026-05-07T16:30:00Z', durationSec: 412 },
];

export const mockNotes: KnowledgeNote[] = [
  {
    id: 'n1',
    title: 'PIK debt as a tell in distressed E&P',
    body:
      'When upstream E&Ps with no revenue accept PIK structures, the lender is usually the seller of the asset (vendor financing in disguise). See [[SOC]] / Exxon Term Loan — Exxon is both the prior operator AND the lender, and the 15% PIK is essentially a deferred purchase price. The 90-days-from-first-sales maturity trigger is the giveaway.',
    tags: ['SOC', 'PIK', 'distressed-debt', 'vendor-financing'],
    createdAt: '2026-05-12',
    source: 'memo',
    linkCount: 4,
  },
  {
    id: 'n2',
    title: 'Hyperscaler capex as the only [[NVDA]] number that matters',
    body:
      'Quarterly NVDA revenue prints are interesting but already priced in. The forward signal is total capex guides from MSFT + GOOG + AMZN + META + ORCL. When two or more raise capex by >10% mid-year, NVDA estimates have a 1-quarter lag before catching up.',
    tags: ['NVDA', 'hyperscalers', 'AI-capex', 'leading-indicators'],
    createdAt: '2026-05-11',
    source: 'chat',
    linkCount: 6,
  },
  {
    id: 'n3',
    title: 'Going-concern qualifications: not always a death knell',
    body:
      'Auditor going-concern paragraphs in 10-Ks have ~60% recovery rate when paired with: (a) a clear refinancing path within 12 months, (b) credible operational catalyst (restart, asset sale, divestiture), (c) committed equity backstop. [[SOC]] has (a) and (c) but (b) is the binary.',
    tags: ['going-concern', 'distressed', 'SOC', 'auditor-flags'],
    createdAt: '2026-05-10',
    source: 'manual',
    linkCount: 3,
  },
  {
    id: 'n4',
    title: 'Costco membership renewal rate threshold',
    body:
      'Historical break point: when [[COST]] US/Canada renewal drops below 90%, comp deceleration follows within 2 quarters with R² ~0.72. Current Q1 print 92%; bear case is the 90% line.',
    tags: ['COST', 'consumer-retail', 'membership-economics'],
    createdAt: '2026-05-09',
    source: 'memo',
    linkCount: 2,
  },
  {
    id: 'n5',
    title: 'Bank NIM divergence in Q1 — JPM lagging peers',
    body:
      '[[JPM]] NIM of 3.78% vs [[BAC]] 3.85%, [[WFC]] 3.88%, [[C]] 3.95%. JPM has been most aggressive on deposit cost recapture — interpretation A: paying up for stickier balances (bullish). Interpretation B: outflows forcing higher beta (bearish). Watching cross-sells.',
    tags: ['JPM', 'BAC', 'WFC', 'C', 'NIM', 'banks'],
    createdAt: '2026-05-07',
    source: 'memo',
    linkCount: 5,
  },
];

export const mockMasterMessages: MasterAgentMessage[] = [
  {
    id: 'mm1',
    role: 'pm',
    text: 'Who covers semis?',
    ts: '2026-05-12T08:14:00Z',
  },
  {
    id: 'mm2',
    role: 'master',
    text:
      'Maria Chen covers semis and semi-cap: NVDA, AMD, INTC, TSM, ASML, AVGO, MRVL. Her latest work is an earnings reaction on NVDA (yesterday) and a maintenance update on AMD (last Thursday). She’s actively working on tonight’s NVDA Q1 earnings reaction.',
    ts: '2026-05-12T08:14:02Z',
  },
  {
    id: 'mm3',
    role: 'pm',
    text: 'Summarize what everyone produced in the last 24h.',
    ts: '2026-05-12T08:15:00Z',
  },
  {
    id: 'mm4',
    role: 'master',
    text:
      "Three pieces of work in the last 24h:\n\n• **David Park** shipped the SOC pitch memo (18 citations). Headline: zero-revenue producer with a $921.6M PIK loan maturing March 2027; key gate is Ninth Circuit pipeline litigation.\n• **Maria Chen** is on tonight's NVDA earnings call. Pre-read: Street ~ $50B revenue, expecting Networking attach commentary and any new Blackwell timing details.\n• **Tom Kovacs** is finishing a COST morning note. April comp +5.2% on a Street 4.6%. Watching membership renewal commentary.\n\nNo activity from Aisha; her last deliverable was the JPM NIM deep dive on May 7. Want me to queue something for her?",
    ts: '2026-05-12T08:15:04Z',
  },
];

export const mockSuggestedPrompts: string[] = [
  'Synthesize today’s morning notes',
  'Who has spare capacity?',
  'Find every mention of going-concern this week',
  'Summarize the SOC thesis in 3 bullets',
  'Which analyst should I ask about banking sector spread comp?',
];
