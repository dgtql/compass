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

/**
 * Per-analyst conversation history. Used by AnalystDetailView's Chat tab.
 * Each conversation is a 4–6 message sketch of how a PM might actually
 * talk with an analyst — opinionated enough to feel real, generic
 * enough to not pretend to be load-bearing.
 */
export const mockAnalystConversations: Record<string, MasterAgentMessage[]> = {
  'maria-chen': [
    {
      id: 'maria-1',
      role: 'master',
      text:
        "Morning. Reading the AVGO 10-K I just pulled (ev#42-58). Three things stand out so far: VMware integration is tracking ahead on opex synergies, networking attach in AI clusters is now 22% of accelerator dollars (vs my 18% model), and they’re guiding sequential capex *down* — first time in five quarters. Want a full memo or just the AI-networking angle?",
      ts: '2026-05-12T09:14:00Z',
    },
    {
      id: 'maria-2',
      role: 'pm',
      text: 'Just the AI-networking angle. And tie it to NVDA — does this make NVDA networking pricing weaker or stronger?',
      ts: '2026-05-12T09:14:48Z',
    },
    {
      id: 'maria-3',
      role: 'master',
      text:
        "Weaker on a 6–12 month view. AVGO’s Tomahawk 5 + Jericho ramp gives hyperscalers a credible alternative for east-west traffic — exactly the slot NVIDIA InfiniBand has owned. Hyperscaler capex commentary on the next round of calls will confirm. I’ll put a one-pager on your desk by 2pm with the comp tear-down and the bull/bear lines I'd watch.",
      ts: '2026-05-12T09:15:30Z',
    },
    {
      id: 'maria-4',
      role: 'pm',
      text: 'Perfect. Also can you flag any names where the AVGO networking ramp is structurally bad? Not just NVDA.',
      ts: '2026-05-12T09:16:00Z',
    },
  ],
  'david-park': [
    {
      id: 'david-1',
      role: 'master',
      text:
        "Morning. SOC pitch memo is live (memo · 2026-05-12). The headline I'd lead with: the auditor's going-concern paragraph is paired with a hard 90-days-from-first-sales debt trigger — that's not normal distressed E&P math, it's vendor-financing structure. Want me to run the same lens on OXY?",
      ts: '2026-05-12T08:32:00Z',
    },
    {
      id: 'david-2',
      role: 'pm',
      text: 'Not OXY. What are the catalysts I should be watching this quarter for SOC specifically?',
      ts: '2026-05-12T08:33:10Z',
    },
    {
      id: 'david-3',
      role: 'master',
      text:
        "Four, ranked by impact:\n\n1. Ninth Circuit ruling on the consolidated pipeline petitions — petitioners' opening brief was due March 23.\n2. PHMSA permanent Special Permit decision (the Emergency Special Permit expired Feb 21).\n3. May 20 Coastal Commission hearing in Santa Barbara Superior Court.\n4. OS&T vessel acquisition signaling — they targeted Q1 2026 for acquisition; if no announcement by end of May, the alternative path is slipping.\n\nThe binary one is #1.",
      ts: '2026-05-12T08:33:42Z',
    },
    {
      id: 'david-4',
      role: 'pm',
      text: 'OK. If #1 goes against them, what does the position look like in 30 days?',
      ts: '2026-05-12T08:34:30Z',
    },
  ],
  'aisha-patel': [
    {
      id: 'aisha-1',
      role: 'master',
      text:
        "Hi. Spread comp across my coverage is the most interesting it’s been all year. Q1 NIM divergence: JPM 3.78, BAC 3.85, WFC 3.88, C 3.95. JPM’s outflow story has two readings and they imply opposite trades. Want the deep dive or just the takeaway?",
      ts: '2026-05-12T08:50:00Z',
    },
    {
      id: 'aisha-2',
      role: 'pm',
      text: 'Just the takeaway.',
      ts: '2026-05-12T08:50:30Z',
    },
    {
      id: 'aisha-3',
      role: 'master',
      text:
        "Long C / Short JPM as a pair. C is the cleanest beneficiary of the higher-for-longer wholesale-funding regime; JPM is paying up for deposits the market hasn't yet priced as costly. Two-quarter half-life on this trade; convergence event is JPM's Q2 NIM print.",
      ts: '2026-05-12T08:51:00Z',
    },
  ],
  'tom-kovacs': [
    {
      id: 'tom-1',
      role: 'master',
      text:
        "Morning note on COST is queued (running, eta ~2 min). Quick read: April comp +5.2% vs Street 4.6%. Membership renewal 92%. The fee-hike commentary on the next call is the only thing that matters for the multiple.",
      ts: '2026-05-12T08:05:00Z',
    },
    {
      id: 'tom-2',
      role: 'pm',
      text: 'What’s the historical pattern when membership renewal drops below 92%?',
      ts: '2026-05-12T08:05:40Z',
    },
    {
      id: 'tom-3',
      role: 'master',
      text:
        "Three precedents (2008, 2015, 2020). All three preceded comp deceleration within 2 quarters, R² ~0.72. 90% renewal is the hard floor; below that, multiple compresses ~3-4 turns. Currently at 92% — not a screaming sell, but the asymmetry is no longer favorable.",
      ts: '2026-05-12T08:06:15Z',
    },
  ],
};
