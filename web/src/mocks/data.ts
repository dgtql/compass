/**
 * Mock data driving the slice-11+ UI prototype.
 *
 * Everything in this file gets replaced by real backend calls when the
 * data model is wired in. Until then, the React components consume these
 * objects directly so the design can be evaluated without a commitment.
 */

import type {
  Analyst,
  AnalystMemo,
  AnalystSubtask,
  AnalystTask,
  ChatSession,
  ChatTask,
  DataInventoryRow,
  DataItem,
  KnowledgeNote,
  MasterAgentMessage,
  Skill,
  TickerInfo,
} from '@/types/domain';

// ---------------------------------------------------------------------------
// Analysts
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Ticker universe
// ---------------------------------------------------------------------------

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
  { symbol: 'AAPL', name: 'Apple Inc.',                  sector: 'Technology',  industry: 'Consumer Electronics',   exchange: 'NASDAQ', price: 232.10, dayChangePct: 0.3,  marketCapB: 3500, coveredBy: [] },
  { symbol: 'TSLA', name: 'Tesla, Inc.',                 sector: 'Consumer',    industry: 'Auto Manufacturers',     exchange: 'NASDAQ', price: 348.70, dayChangePct: -2.1, marketCapB: 1110, coveredBy: [] },
  { symbol: 'META', name: 'Meta Platforms',              sector: 'Technology',  industry: 'Internet Content',       exchange: 'NASDAQ', price: 612.30, dayChangePct: 0.8,  marketCapB: 1540, coveredBy: [] },
  { symbol: 'GOOG', name: 'Alphabet Inc.',               sector: 'Technology',  industry: 'Internet Content',       exchange: 'NASDAQ', price: 198.40, dayChangePct: 0.5,  marketCapB: 2450, coveredBy: [] },
];

// ---------------------------------------------------------------------------
// Memos + tasks + knowledge
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Master agent messages + suggested prompts
// ---------------------------------------------------------------------------

export const mockMasterMessages: MasterAgentMessage[] = [
  { id: 'mm1', role: 'pm', text: 'Who covers semis?', ts: '2026-05-12T08:14:00Z' },
  { id: 'mm2', role: 'master',
    text: 'Maria Chen covers semis and semi-cap: NVDA, AMD, INTC, TSM, ASML, AVGO, MRVL. Her latest work is an earnings reaction on NVDA (yesterday) and a maintenance update on AMD (last Thursday). She is actively working on tonight\'s NVDA Q1 earnings reaction.',
    ts: '2026-05-12T08:14:02Z' },
  { id: 'mm3', role: 'pm', text: 'Summarize what everyone produced in the last 24h.', ts: '2026-05-12T08:15:00Z' },
  { id: 'mm4', role: 'master',
    text: 'Three pieces of work in the last 24h. David Park shipped the SOC pitch memo (18 citations). Maria Chen is on tonight\'s NVDA earnings call. Tom Kovacs is finishing a COST morning note. No activity from Aisha; her last deliverable was the JPM NIM deep dive on May 7. Want me to queue something for her?',
    ts: '2026-05-12T08:15:04Z' },
];

export const mockSuggestedPrompts: string[] = [
  'Synthesize today\'s morning notes',
  'Who has spare capacity?',
  'Find every mention of going-concern this week',
  'Summarize the SOC thesis in 3 bullets',
  'Which analyst should I ask about banking sector spread comp?',
];

// ---------------------------------------------------------------------------
// Per-analyst conversations (re-used by sessions)
// ---------------------------------------------------------------------------

export const mockAnalystConversations: Record<string, MasterAgentMessage[]> = {
  'maria-chen': [
    { id: 'maria-1', role: 'master',
      text: "Morning. Reading the AVGO 10-K I just pulled (ev#42-58). Three things stand out so far: VMware integration is tracking ahead on opex synergies, networking attach in AI clusters is now 22% of accelerator dollars (vs my 18% model), and they're guiding sequential capex *down* — first time in five quarters. Want a full memo or just the AI-networking angle?",
      ts: '2026-05-12T09:14:00Z' },
    { id: 'maria-2', role: 'pm',
      text: 'Just the AI-networking angle. And tie it to NVDA — does this make NVDA networking pricing weaker or stronger?',
      ts: '2026-05-12T09:14:48Z' },
    { id: 'maria-3', role: 'master',
      text: "Weaker on a 6–12 month view. AVGO's Tomahawk 5 + Jericho ramp gives hyperscalers a credible alternative for east-west traffic — exactly the slot NVIDIA InfiniBand has owned. Hyperscaler capex commentary on the next round of calls will confirm. I'll put a one-pager on your desk by 2pm with the comp tear-down and the bull/bear lines I'd watch.",
      ts: '2026-05-12T09:15:30Z' },
    { id: 'maria-4', role: 'pm',
      text: 'Perfect. Also can you flag any names where the AVGO networking ramp is structurally bad? Not just NVDA.',
      ts: '2026-05-12T09:16:00Z' },
  ],
  'david-park': [
    { id: 'david-1', role: 'master',
      text: "Morning. SOC pitch memo is live (memo · 2026-05-12). The headline I'd lead with: the auditor's going-concern paragraph is paired with a hard 90-days-from-first-sales debt trigger — that's not normal distressed E&P math, it's vendor-financing structure. Want me to run the same lens on OXY?",
      ts: '2026-05-12T08:32:00Z' },
    { id: 'david-2', role: 'pm',
      text: 'Not OXY. What are the catalysts I should be watching this quarter for SOC specifically?',
      ts: '2026-05-12T08:33:10Z' },
    { id: 'david-3', role: 'master',
      text: "Four, ranked by impact: (1) Ninth Circuit ruling on the consolidated pipeline petitions; (2) PHMSA permanent Special Permit decision; (3) May 20 Coastal Commission hearing in Santa Barbara Superior Court; (4) OS&T vessel acquisition signaling. The binary one is #1.",
      ts: '2026-05-12T08:33:42Z' },
    { id: 'david-4', role: 'pm',
      text: 'OK. If #1 goes against them, what does the position look like in 30 days?',
      ts: '2026-05-12T08:34:30Z' },
  ],
  'aisha-patel': [
    { id: 'aisha-1', role: 'master',
      text: "Hi. Spread comp across my coverage is the most interesting it's been all year. Q1 NIM divergence: JPM 3.78, BAC 3.85, WFC 3.88, C 3.95. JPM's outflow story has two readings and they imply opposite trades. Want the deep dive or just the takeaway?",
      ts: '2026-05-12T08:50:00Z' },
    { id: 'aisha-2', role: 'pm', text: 'Just the takeaway.', ts: '2026-05-12T08:50:30Z' },
    { id: 'aisha-3', role: 'master',
      text: "Long C / Short JPM as a pair. C is the cleanest beneficiary of the higher-for-longer wholesale-funding regime; JPM is paying up for deposits the market hasn't yet priced as costly. Two-quarter half-life on this trade; convergence event is JPM's Q2 NIM print.",
      ts: '2026-05-12T08:51:00Z' },
  ],
  'tom-kovacs': [
    { id: 'tom-1', role: 'master',
      text: "Morning note on COST is queued (running, eta ~2 min). Quick read: April comp +5.2% vs Street 4.6%. Membership renewal 92%. The fee-hike commentary on the next call is the only thing that matters for the multiple.",
      ts: '2026-05-12T08:05:00Z' },
    { id: 'tom-2', role: 'pm', text: "What's the historical pattern when membership renewal drops below 92%?", ts: '2026-05-12T08:05:40Z' },
    { id: 'tom-3', role: 'master',
      text: "Three precedents (2008, 2015, 2020). All three preceded comp deceleration within 2 quarters, R² ~0.72. 90% renewal is the hard floor; below that, multiple compresses ~3-4 turns. Currently at 92% — not a screaming sell, but the asymmetry is no longer favorable.",
      ts: '2026-05-12T08:06:15Z' },
  ],
};

// ---------------------------------------------------------------------------
// Chat sessions (slice 13 — multiple threads per chat owner)
// ---------------------------------------------------------------------------

function makeSession(
  id: string,
  ownerKey: string,
  taskId: string,
  title: string,
  lastMessageAt: string,
  messages: MasterAgentMessage[],
): ChatSession {
  const last = messages[messages.length - 1];
  return {
    id,
    ownerKey,
    taskId,
    title,
    lastMessageAt,
    preview: last?.text?.replace(/\s+/g, ' ').slice(0, 90) ?? '',
    messages,
  };
}

// ---------------------------------------------------------------------------
// Chat tasks (slice 17 — groups sessions by task)
// ---------------------------------------------------------------------------

export const mockChatTasks: ChatTask[] = [
  // Maria
  { id: 't-maria-nvda',  ownerKey: 'maria-chen',  title: 'NVDA / AVGO networking thesis', status: 'active', createdAt: '2026-05-11T10:00:00Z', updatedAt: '2026-05-12T09:16:00Z' },
  { id: 't-maria-tsm',   ownerKey: 'maria-chen',  title: 'TSM capex read-through',        status: 'done',   createdAt: '2026-05-09T10:00:00Z', updatedAt: '2026-05-09T11:12:00Z' },

  // David
  { id: 't-david-soc',   ownerKey: 'david-park',  title: 'SOC restart catalyst tracking', status: 'active', createdAt: '2026-05-10T08:00:00Z', updatedAt: '2026-05-12T08:35:00Z' },
  { id: 't-david-oxy',   ownerKey: 'david-park',  title: 'OXY Permian model refresh',     status: 'done',   createdAt: '2026-05-10T14:00:00Z', updatedAt: '2026-05-10T14:22:00Z' },

  // Aisha
  { id: 't-aisha-nim',   ownerKey: 'aisha-patel', title: 'Bank NIM divergence trade',     status: 'active', createdAt: '2026-05-12T08:00:00Z', updatedAt: '2026-05-12T08:51:00Z' },

  // Tom
  { id: 't-tom-cost',    ownerKey: 'tom-kovacs',  title: 'COST coverage refresh',         status: 'active', createdAt: '2026-05-12T08:00:00Z', updatedAt: '2026-05-12T08:06:00Z' },
  { id: 't-tom-hd-low',  ownerKey: 'tom-kovacs',  title: 'HD vs LOW pair trade',          status: 'done',   createdAt: '2026-05-08T17:00:00Z', updatedAt: '2026-05-08T17:10:00Z' },

  // Master
  { id: 't-master-ops',  ownerKey: 'master',      title: 'Daily PM operations',           status: 'active', createdAt: '2026-05-12T08:00:00Z', updatedAt: '2026-05-12T08:15:00Z' },
  { id: 't-master-audit',ownerKey: 'master',      title: 'Position audits',                status: 'paused', createdAt: '2026-05-09T15:00:00Z', updatedAt: '2026-05-09T15:30:00Z' },
];

export const mockSessions: ChatSession[] = [
  // Maria’s first session — agent ends by asking the PM a clarifying question
  makeSession('s-maria-1', 'maria-chen', 't-maria-nvda', 'AVGO vs NVDA networking', '2026-05-12T09:16:00Z', [
    ...mockAnalystConversations['maria-chen']!,
    {
      id: 'maria-ask-1',
      role: 'master',
      text: 'Before I write the one-pager — quick clarification on scope:',
      ts: '2026-05-12T09:16:30Z',
      ask: {
        requestId: 'ask-maria-1',
        questions: [
          {
            question: 'Which framing do you want for the bull/bear lines?',
            header: 'Framing',
            multiSelect: false,
            options: [
              { label: 'PM-facing thesis lines (action-oriented)', description: 'Short, specific, suitable for an IC meeting.' },
              { label: 'Sell-side comp tear-down', description: 'Tables with multiples vs peers, less narrative.' },
              { label: 'Quant signal extraction', description: 'KPIs and leading indicators only; no prose.' },
            ],
          },
          {
            question: 'How many comps to include in the AVGO vs NVDA table?',
            header: 'Scope',
            multiSelect: false,
            options: [
              { label: 'Just AVGO + NVDA' },
              { label: 'Add ASML + MRVL' },
              { label: 'Full semis basket (8 names)' },
            ],
          },
        ],
      },
    },
  ]),
  makeSession('s-maria-2', 'maria-chen', 't-maria-nvda', 'NVDA Q1 read-through', '2026-05-11T18:42:00Z', [
    { id: 'sm2-1', role: 'pm', text: 'Quick pre-call read on NVDA tonight?', ts: '2026-05-11T18:40:00Z' },
    { id: 'sm2-2', role: 'master',
      text: 'Street ~$50.1B revenue, ~70% GM. Watch: Networking attach, Blackwell timing color, and any commentary on sovereign deals. The asymmetry tonight is sovereign — if they raise a sovereign run rate, multiple expands.',
      ts: '2026-05-11T18:42:00Z' },
  ]),
  makeSession('s-maria-3', 'maria-chen', 't-maria-tsm', 'TSM capex implications', '2026-05-09T11:12:00Z', [
    { id: 'sm3-1', role: 'pm', text: 'TSM raised capex on the call. How does that flow into the semi-cap names?', ts: '2026-05-09T11:10:00Z' },
    { id: 'sm3-2', role: 'master',
      text: "ASML is the cleanest beneficiary: TSM's capex bump is ~$3B above the prior range and most of that is leading-edge, which is ~85% EUV-bound. AMAT/LRCX get the trailing-edge spillover. The interesting low-correlation play is KLA — metrology attach is structurally rising.",
      ts: '2026-05-09T11:12:00Z' },
  ]),

  // David’s first session has a rich todo list mid-conversation (inline)
  makeSession('s-david-1', 'david-park', 't-david-soc', 'SOC catalyst map', '2026-05-12T08:34:30Z', [
    ...mockAnalystConversations['david-park']!,
    {
      id: 'david-todos-1',
      role: 'master',
      text: "Got it. Here's the plan to size what happens if #1 goes against them:",
      ts: '2026-05-12T08:35:00Z',
      todos: [
        { id: 't1', content: 'Re-fetch SOC 10-K + 10-Q to confirm liquidity math',     status: 'completed',   priority: 'high' },
        { id: 't2', content: 'Run worst-case operating-cash-burn under no-revenue path', status: 'in_progress', priority: 'high' },
        { id: 't3', content: 'Pull bond / term-loan secondary marks (if any)',          status: 'pending',     priority: 'medium' },
        { id: 't4', content: 'Draft 30-day position memo with two scenarios',           status: 'pending',     priority: 'high' },
        { id: 't5', content: 'Flag to PM if liquidity bridge breaks before Q3',         status: 'pending',     priority: 'medium' },
      ],
    },
  ]),
  makeSession('s-david-2', 'david-park', 't-david-oxy', 'OXY Permian decline curves', '2026-05-10T14:22:00Z', [
    { id: 'sd2-1', role: 'pm', text: "Are OXY's Permian decline curves still tracking?", ts: '2026-05-10T14:20:00Z' },
    { id: 'sd2-2', role: 'master',
      text: "Yes — Q1 wedge production was 528 MBoe/d (Street 521). Type-curve assumptions held. The story to watch is CrownRock integration: G&A synergies are ahead of plan but base decline on the acquired acreage is steeper than they guided. Net-net: thesis intact, but the multi-year FCF bridge needs a wider error band.",
      ts: '2026-05-10T14:22:00Z' },
  ]),

  makeSession('s-aisha-1', 'aisha-patel', 't-aisha-nim', 'NIM divergence — long C / short JPM', '2026-05-12T08:51:00Z',
    mockAnalystConversations['aisha-patel']!),

  makeSession('s-tom-1', 'tom-kovacs', 't-tom-cost', 'COST renewal dynamics', '2026-05-12T08:06:15Z',
    mockAnalystConversations['tom-kovacs']!),
  makeSession('s-tom-2', 'tom-kovacs', 't-tom-hd-low', 'HD vs LOW spread', '2026-05-08T17:10:00Z', [
    { id: 'st2-1', role: 'pm', text: 'Why has HD been widening vs LOW the last 30 days?', ts: '2026-05-08T17:08:00Z' },
    { id: 'st2-2', role: 'master',
      text: "Three things: (1) HD pro-customer mix is back to 50%+ — pricing power that LOW lacks, (2) hurricane rebuild tailwind started Q1, (3) HD raised gross margin guide while LOW held. The catch: HD now trades at a richer EV/EBITDA — most of the alpha has been collected. I'd trim the long-HD leg, hold the short.",
      ts: '2026-05-08T17:10:00Z' },
  ]),

  makeSession('s-master-1', 'master', 't-master-ops', 'Morning round-up', '2026-05-12T08:15:04Z', mockMasterMessages),
  makeSession('s-master-2', 'master', 't-master-audit', 'Bear-case audit on top longs', '2026-05-09T15:30:00Z', [
    { id: 'sma2-1', role: 'pm', text: 'Run the strongest bear case on each of our top 5 longs. One paragraph each.', ts: '2026-05-09T15:28:00Z' },
    { id: 'sma2-2', role: 'master',
      text: 'Working through them — asking each covering analyst to deliver in their voice. Maria has NVDA + ASML, David has SOC, Aisha has JPM, Tom has COST. ETA 90 min. Saving the output as a knowledge-base entry.',
      ts: '2026-05-09T15:30:00Z' },
  ]),
];

// ---------------------------------------------------------------------------
// Skills catalog
// ---------------------------------------------------------------------------

export const mockSkills: Skill[] = [
  {
    slug: 'coverage-planner',
    name: 'Coverage planner',
    category: 'planner',
    status: 'planned',
    description:
      'Q&A flow that turns a PM goal into coverage_brief.json + tasks.json for a ticker. The orchestrator that defines what the analyst will do next.',
    inputs: ['ticker', 'PM Q&A'],
    outputs: ['coverage_brief.json', 'tasks.json'],
    usedBy: [],
    calls: ['pitch-memo', 'earnings-reaction', 'extract-tone-shifts'],
    stages: ['setup'],
  },
  {
    slug: 'fetch-edgar-filing',
    name: 'Fetch EDGAR filing',
    category: 'ingestion',
    status: 'production',
    description: 'Pull a specific SEC form (10-K, 10-Q, 8-K) via edgartools, write to the workspace, chunk into evidence ledger.',
    inputs: ['ticker', 'form_type'],
    outputs: ['primary.md', 'evidence-rows'],
    usedBy: ['david-park', 'maria-chen'],
    stages: ['ingest'],
  },
  {
    slug: 'yahoo-snapshot',
    name: 'Yahoo snapshot',
    category: 'ingestion',
    status: 'production',
    description: 'Daily Yahoo Finance snapshot — price, analyst consensus, financials, news. Written as Markdown + chunked into ledger.',
    inputs: ['ticker'],
    outputs: ['snapshot.md', 'evidence-rows'],
    usedBy: ['david-park', 'maria-chen'],
    stages: ['ingest'],
  },
  {
    slug: 'transcript-fetcher',
    name: 'Transcript fetcher',
    category: 'ingestion',
    status: 'planned',
    description: 'Pull the latest earnings call transcript (Motley Fool / Yahoo IR fallback). Cleans into Markdown.',
    inputs: ['ticker', 'quarter'],
    outputs: ['transcript.md'],
    usedBy: [],
    stages: ['ingest'],
  },
  {
    slug: 'kpi-tracker',
    name: 'KPI tracker',
    category: 'analysis',
    status: 'planned',
    description: 'Computes Q-over-Q deltas on the analyst\'s declared KPIs (cash, debt, opex, etc.). Writes a JSON snapshot per quarter.',
    inputs: ['ticker', 'kpi list', 'filings'],
    outputs: ['kpi-deltas.json'],
    usedBy: [],
    stages: ['analyze'],
  },
  {
    slug: 'pitch-memo',
    name: 'Pitch memo',
    category: 'memo',
    status: 'production',
    description: 'Initial pitch memo on a covered ticker. Thesis / Business / Financials / Risks / Catalysts, every claim cited to the evidence ledger.',
    inputs: ['ticker', 'corpus'],
    outputs: ['memo.md', 'audit'],
    usedBy: ['david-park', 'maria-chen'],
    calls: ['kpi-tracker', 'extract-tone-shifts'],
    stages: ['compose'],
  },
  {
    slug: 'earnings-reaction',
    name: 'Earnings reaction',
    category: 'memo',
    status: 'planned',
    description: 'Post-call write-up. Beat/miss vs Street, guide quality, thesis impact, recommended action.',
    inputs: ['ticker', 'transcript', 'last memo'],
    outputs: ['memo.md', 'thesis-delta'],
    usedBy: [],
    calls: ['transcript-fetcher', 'kpi-tracker'],
    stages: ['compose'],
  },
  {
    slug: 'maintenance-update',
    name: 'Maintenance update',
    category: 'memo',
    status: 'planned',
    description: 'Quarterly refresh of an active thesis. Did KPIs trend as expected? Update price targets.',
    inputs: ['ticker', 'last pitch', 'recent filings'],
    outputs: ['memo.md'],
    usedBy: [],
    calls: ['kpi-tracker', 'extract-tone-shifts'],
    stages: ['maintain'],
  },
  {
    slug: 'deep-dive',
    name: 'Deep dive',
    category: 'memo',
    status: 'planned',
    description: 'Ad-hoc multi-section memo on a specific question (bear case, capital structure, single-issue analysis).',
    inputs: ['ticker', 'question', 'corpus'],
    outputs: ['memo.md'],
    usedBy: [],
    calls: ['kpi-tracker', 'find-contradictions'],
    stages: ['compose'],
  },
  {
    slug: 'morning-brief',
    name: 'Morning brief',
    category: 'workflow',
    status: 'planned',
    description: 'Cross-watchlist note: overnight news, filings, pre-market moves, tone shifts. Delivered before 8am.',
    inputs: ['watchlist', 'corpus'],
    outputs: ['brief.md'],
    usedBy: [],
    calls: ['fetch-edgar-filing', 'yahoo-snapshot', 'extract-tone-shifts'],
    stages: ['maintain'],
  },
  {
    slug: 'pm-interrogation',
    name: 'PM interrogation',
    category: 'workflow',
    status: 'planned',
    description: 'Q&A loop on an existing memo. Pulls evidence rows on demand; never speculates outside the corpus.',
    inputs: ['memo', 'question'],
    outputs: ['chat-thread'],
    usedBy: [],
  },
  {
    slug: 'analyst-brief',
    name: 'Analyst brief',
    category: 'memo',
    status: 'planned',
    description: 'One-page synthesis brief for the PM. Distilled view across multiple memos on a single name.',
    inputs: ['ticker', 'memos'],
    outputs: ['brief.md'],
    usedBy: [],
  },
  {
    slug: 'extract-tone-shifts',
    name: 'Extract tone shifts',
    category: 'analysis',
    status: 'planned',
    description: 'Detects management tone changes across consecutive filings or earnings calls. Useful for early-warning.',
    inputs: ['ticker', 'filings'],
    outputs: ['tone-delta.json'],
    usedBy: [],
    stages: ['analyze'],
  },
  {
    slug: 'find-contradictions',
    name: 'Find contradictions',
    category: 'analysis',
    status: 'planned',
    description: 'Surfaces internal inconsistencies in the corpus — guidance vs results, narrative vs filings.',
    inputs: ['ticker', 'corpus'],
    outputs: ['contradictions.md'],
    usedBy: [],
    stages: ['analyze'],
  },
  {
    slug: 'citation-audit',
    name: 'Citation audit',
    category: 'analysis',
    status: 'planned',
    description: 'Validates that every [ev#N] tag in a memo actually points at a row whose content supports the claim.',
    inputs: ['memo'],
    outputs: ['audit-report'],
    usedBy: [],
  },
  {
    slug: 'parse-edgar-filing',
    name: 'Parse EDGAR filing',
    category: 'ingestion',
    status: 'retired',
    description: 'HTML→clean-text preprocessing for EDGAR primary documents. Retired in Slice 2.5 when we adopted edgartools.',
    inputs: ['html'],
    outputs: ['txt'],
    usedBy: [],
  },
];

// ---------------------------------------------------------------------------
// Data inventory
// ---------------------------------------------------------------------------

export const mockDataInventory: DataInventoryRow[] = [
  { category: 'filings',    count: 14, lastUpdated: '2026-05-12', tickers: ['SOC', 'NVDA', 'AMD', 'AVGO', 'COST', 'JPM'] },
  { category: 'snapshots',  count: 8,  lastUpdated: '2026-05-12', tickers: ['SOC', 'NVDA', 'AVGO', 'COST', 'JPM', 'AMD', 'AAPL', 'TSLA'] },
  { category: 'transcripts',count: 0,  lastUpdated: null,         tickers: [] },
  { category: 'news',       count: 0,  lastUpdated: null,         tickers: [] },
  { category: 'ir-pages',   count: 0,  lastUpdated: null,         tickers: [] },
];

// ---------------------------------------------------------------------------
// Per-analyst session subtasks (for the TaskProgressPill above the composer)
// ---------------------------------------------------------------------------

/**
 * When an analyst is mid-research, their session has an associated set of
 * subtasks (fetch → analyze → compose → deliver). The pill above the chat
 * composer shows progress through these. Keyed by analyst slug for now.
 */
export const mockAnalystSubtasks: Record<string, AnalystSubtask[]> = {
  'david-park': [
    { id: 'd-st-1', title: 'Re-fetch SOC 10-K + 10-Q',                                status: 'done',        whyNext: 'Already pulled; confirms current liquidity math.' },
    { id: 'd-st-2', title: 'Run worst-case operating-cash-burn',                       status: 'in-progress', whyNext: 'In flight — modeling no-revenue path through Q3.', nextActionPrompt: 'Continue the burn-rate model with March 2027 maturity stress.' },
    { id: 'd-st-3', title: 'Pull term-loan secondary marks',                           status: 'pending',     whyNext: 'Quotes from the desk will set the recovery anchor for the bear case.', nextActionPrompt: 'Check whether the Exxon term loan has any secondary print this week.' },
    { id: 'd-st-4', title: 'Draft 30-day position memo (two scenarios)',               status: 'pending',     whyNext: 'Synthesis of the above — the deliverable.', nextActionPrompt: 'Outline the two-scenario position memo: pipeline restart vs OS&T path.' },
    { id: 'd-st-5', title: 'Flag to PM if liquidity bridge breaks before Q3',          status: 'pending' },
  ],
  'maria-chen': [
    { id: 'm-st-1', title: 'Pull NVDA + AVGO comps tear-down',                         status: 'done' },
    { id: 'm-st-2', title: 'Confirm AVGO networking attach in customer transcripts',   status: 'in-progress', whyNext: 'Hyperscaler earnings calls — pulling MSFT/META call transcripts.', nextActionPrompt: 'Search MSFT/META Q1 calls for AVGO networking mentions.' },
    { id: 'm-st-3', title: 'Write the AI-networking one-pager',                        status: 'pending' },
    { id: 'm-st-4', title: 'Add structural-bad-list for NVDA networking ramp',          status: 'pending',     whyNext: 'The PM asked for names beyond NVDA where AVGO ramp is structurally bad.' },
  ],
};

export const mockDataItems: DataItem[] = [
  { category: 'filings',   ticker: 'SOC',  type: '10-K',     date: '2026-02-27', size: '580 KB' },
  { category: 'filings',   ticker: 'NVDA', type: '10-K',     date: '2026-02-19', size: '912 KB' },
  { category: 'filings',   ticker: 'AVGO', type: '10-K',     date: '2026-01-30', size: '772 KB' },
  { category: 'filings',   ticker: 'AMD',  type: '10-Q',     date: '2026-04-30', size: '320 KB' },
  { category: 'filings',   ticker: 'COST', type: '10-Q',     date: '2026-04-08', size: '410 KB' },
  { category: 'filings',   ticker: 'JPM',  type: '10-Q',     date: '2026-04-12', size: '624 KB' },
  { category: 'snapshots', ticker: 'SOC',  type: 'snapshot', date: '2026-05-12', size: '6 KB'   },
  { category: 'snapshots', ticker: 'NVDA', type: 'snapshot', date: '2026-05-12', size: '8 KB'   },
  { category: 'snapshots', ticker: 'AVGO', type: 'snapshot', date: '2026-05-12', size: '7 KB'   },
  { category: 'snapshots', ticker: 'COST', type: 'snapshot', date: '2026-05-12', size: '6 KB'   },
  { category: 'snapshots', ticker: 'JPM',  type: 'snapshot', date: '2026-05-12', size: '6 KB'   },
];
