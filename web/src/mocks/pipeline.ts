/**
 * Pipeline + coverage mock data (slice 16).
 *
 * Per-ticker engagement: structured thesis brief + ordered tasks across
 * stages + artifacts on disk. Wires together with the existing mock
 * skills + analysts but lives in its own file to keep `data.ts` from
 * growing past readability.
 *
 * `FRESH_INSTALL` matches `mocks/data.ts`: flip to `false` to seed the
 * demo coverages (NVDA, SOC); leave `true` to see the brand-new-install
 * UX with no coverages on file.
 */

import type {
  Artifact,
  CoverageBrief,
  PipelineTask,
  StageId,
  TickerCoverage,
} from '@/types/domain';

const FRESH_INSTALL = true;

export const STAGES: { id: StageId; label: string; description: string }[] = [
  { id: 'setup',    label: 'Setup',    description: 'Initial Q&A · scope · thesis sketch' },
  { id: 'ingest',   label: 'Ingest',   description: 'Pull filings · snapshots · transcripts' },
  { id: 'analyze',  label: 'Analyze',  description: 'Tone shifts · KPIs · contradictions · comps' },
  { id: 'compose',  label: 'Compose',  description: 'Write the memo · pitch / earnings / maintenance' },
  { id: 'maintain', label: 'Maintain', description: 'Refresh thesis · monitor catalysts' },
];

/** Mechanical skill suggestion by stage — read by the UI without an LLM call. */
export const stageSkillMap: Record<StageId, string[]> = {
  setup:    ['coverage-planner'],
  ingest:   ['fetch-edgar-filing', 'yahoo-snapshot', 'transcript-fetcher'],
  analyze:  ['extract-tone-shifts', 'kpi-tracker', 'find-contradictions'],
  compose:  ['pitch-memo', 'earnings-reaction', 'maintenance-update', 'deep-dive'],
  maintain: ['maintenance-update', 'morning-brief'],
};

const SOC_BRIEF: CoverageBrief = {
  ticker: 'SOC',
  thesisOneLiner:
    'Restart-or-bust: $922M PIK loan maturing March 2027, no revenue, going-concern flag.',
  thesisBody:
    'Sable Offshore is a zero-revenue California offshore oil producer carrying a $921.6M PIK term loan at 15% that matures by the earlier of March 2027 or 90 days after first hydrocarbon sales. Production physically restarted on May 15, 2025, but no crude has been sold pending pipeline regulatory approvals. The binary catalyst is the consolidated Ninth Circuit appeal challenging PHMSA jurisdiction. Going-concern qualification + strong-buy analyst consensus ($27 target) reflect this asymmetry — neither side is wrong, they\'re pricing different scenarios.',
  keyQuestions: [
    'When does the Ninth Circuit rule, and which way?',
    'If they lose #1, how viable is the OS&T vessel alternative at $475M capex?',
    'What is the realistic refi window before the March 2027 maturity wall?',
    'Are there any leading indicators from PHMSA / Coastal Commission ahead of formal decisions?',
    'How does Sable\'s liquidity bridge break — and what triggers the breakpoint?',
  ],
  kpis: [
    { name: 'Unrestricted cash (Q-end, $M)', target: '> 150',   current: '97.7',  trend: 'down' },
    { name: 'Total debt incl. PIK ($M)',      target: 'flat',    current: '921.6', trend: 'up'   },
    { name: 'BBL/d produced (offshore)',      target: 'restart', current: '6,000', trend: 'up'   },
    { name: 'BBL/d sold',                     target: '> 0',     current: '0',     trend: 'flat' },
    { name: 'Equity issued YTD ($M, ATM)',    target: '< 250',   current: '0',     trend: 'flat' },
  ],
  risks: [
    { rank: 1, risk: 'Ninth Circuit reverses PHMSA Restart Plan approval',                          severity: 'high'   },
    { rank: 2, risk: 'March 2027 term-loan maturity arrives before any oil sales',                  severity: 'high'   },
    { rank: 3, risk: 'OS&T vessel path slips past Q4 2026 → no Plan B',                             severity: 'high'   },
    { rank: 4, risk: 'SDNY / SEC subpoenas escalate into formal action',                            severity: 'medium' },
    { rank: 5, risk: 'Coastal Commission expands the $18M penalty / issues additional orders',      severity: 'medium' },
  ],
  catalysts: [
    { date: '2026-05-20', description: 'Coastal Commission MJP hearing (Santa Barbara Superior)',   impact: 'medium' },
    { date: '2026-Q3',    description: 'OS&T vessel acquisition deadline (mgmt guide)',             impact: 'high'   },
    { date: '2026-Q4',    description: 'Ninth Circuit ruling expected on consolidated pipeline appeal', impact: 'high' },
    { date: '2026-Q4',    description: 'First targeted oil sales (mgmt guide, all three platforms)', impact: 'high'  },
    { date: '2027-03-31', description: 'Senior Secured Term Loan maturity',                          impact: 'high'   },
  ],
  startStage: 'analyze',
  mode: 'plan',
  updatedAt: '2026-05-12T10:30:00Z',
};

const SOC_TASKS: PipelineTask[] = [
  // Setup (done)
  { id: 'soc-1', stage: 'setup', title: 'Confirm initial thesis with PM', status: 'done', priority: 'high', taskType: 'planning', suggestedSkills: ['coverage-planner'], dependencies: [], artifactPath: '.pipeline/docs/coverage_brief.json' },

  // Ingest (done)
  { id: 'soc-2', stage: 'ingest', title: 'Fetch SOC latest 10-K',         status: 'done', priority: 'high', taskType: 'ingestion', suggestedSkills: ['fetch-edgar-filing'], dependencies: ['soc-1'], artifactPath: 'corpus/filings/10-K/0001831481-26-000026/primary.md' },
  { id: 'soc-3', stage: 'ingest', title: 'Fetch SOC latest 10-Q',         status: 'done', priority: 'medium', taskType: 'ingestion', suggestedSkills: ['fetch-edgar-filing'], dependencies: ['soc-1'], artifactPath: 'corpus/filings/10-Q/0001831481-26-000022/primary.md' },
  { id: 'soc-4', stage: 'ingest', title: 'Yahoo snapshot for SOC',        status: 'done', priority: 'medium', taskType: 'ingestion', suggestedSkills: ['yahoo-snapshot'], dependencies: ['soc-1'], artifactPath: 'corpus/snapshots/yahoo/2026-05-12.md' },

  // Analyze (mostly done, one in flight)
  { id: 'soc-5', stage: 'analyze', title: 'Extract tone shifts in MD&A (FY24 vs FY25)', status: 'done', priority: 'high', taskType: 'analysis', suggestedSkills: ['extract-tone-shifts'], dependencies: ['soc-2'], artifactPath: 'analysis/tone-shifts/mda-yoy.json' },
  { id: 'soc-6', stage: 'analyze', title: 'Track Q-over-Q KPI deltas (cash, debt, opex)', status: 'in-progress', priority: 'high', taskType: 'analysis', suggestedSkills: ['kpi-tracker'], dependencies: ['soc-2', 'soc-3'], artifactPath: 'analysis/kpi-tracking/q-deltas.json',
    nextActionPrompt: 'Run kpi-tracker on SOC. Compare the 10-Q (Q1 2026) line items to the 10-K (FY 2025) close — focus on unrestricted cash, total debt incl. PIK accretion, opex run-rate, and ATM equity drawdown if any. Save to analysis/kpi-tracking/q-deltas.json.' },
  { id: 'soc-7', stage: 'analyze', title: 'Find contradictions: management guidance vs litigation filings', status: 'pending', priority: 'medium', taskType: 'analysis', suggestedSkills: ['find-contradictions'], dependencies: ['soc-2'], artifactPath: 'analysis/contradictions/mgmt-vs-court.md',
    nextActionPrompt: 'Run find-contradictions: compare CEO earnings-call language about pipeline timeline to the PHMSA Restart Plan filings + the Coastal Commission cease-and-desist text. Surface any inconsistencies.' },
  { id: 'soc-8', stage: 'analyze', title: 'Build pipeline-restart timeline (PHMSA → 9th Cir. → BOEM)', status: 'pending', priority: 'high', taskType: 'analysis', suggestedSkills: ['extract-tone-shifts'], dependencies: ['soc-2'], artifactPath: 'analysis/timelines/regulatory.md' },

  // Compose (pending)
  { id: 'soc-9',  stage: 'compose', title: 'Pitch memo (initial)', status: 'done', priority: 'high', taskType: 'writing', suggestedSkills: ['pitch-memo'], dependencies: ['soc-5'], artifactPath: 'memos/pitch/2026-05-12.md' },
  { id: 'soc-10', stage: 'compose', title: 'Bear-case dossier (30-day position memo)', status: 'pending', priority: 'high', taskType: 'writing', suggestedSkills: ['deep-dive'], dependencies: ['soc-6', 'soc-7'], artifactPath: 'memos/deep-dive/bear-case-30d.md',
    nextActionPrompt: 'Compose a 30-day bear-case position memo: what does SOC look like if Ninth Circuit rules against them next quarter? Include liquidity bridge, capital structure implications, and a sizing recommendation. Cite from analysis/kpi-tracking and the litigation timeline.', requiresHumanApproval: true },

  // Maintain (pending)
  { id: 'soc-11', stage: 'maintain', title: 'Q2 maintenance update (post-10-Q)', status: 'pending', priority: 'medium', taskType: 'writing', suggestedSkills: ['maintenance-update'], dependencies: ['soc-9'], artifactPath: 'memos/maintenance/2026-08-15.md' },
  { id: 'soc-12', stage: 'maintain', title: 'Weekly morning-brief surface for SOC', status: 'pending', priority: 'low', taskType: 'workflow', suggestedSkills: ['morning-brief'], dependencies: ['soc-9'] },
];

const SOC_ARTIFACTS: Artifact[] = [
  // Setup
  { path: '.pipeline/docs/coverage_brief.json',                                  stage: 'setup',   type: 'brief',     name: 'coverage_brief.json',     taskId: 'soc-1',  size: '3 KB',   updatedAt: '2026-05-12' },

  // Ingest
  { path: 'corpus/filings/10-K/0001831481-26-000026/primary.md',                stage: 'ingest',  type: 'filing',    name: '10-K · 2025 annual',      taskId: 'soc-2',  size: '581 KB', updatedAt: '2026-02-27' },
  { path: 'corpus/filings/10-Q/0001831481-26-000022/primary.md',                stage: 'ingest',  type: 'filing',    name: '10-Q · Q1 2026',          taskId: 'soc-3',  size: '188 KB', updatedAt: '2026-05-07' },
  { path: 'corpus/snapshots/yahoo/2026-05-12.md',                                stage: 'ingest',  type: 'snapshot',  name: 'Yahoo · 2026-05-12',      taskId: 'soc-4',  size: '6 KB',   updatedAt: '2026-05-12' },

  // Analyze
  { path: 'analysis/tone-shifts/mda-yoy.json',                                   stage: 'analyze', type: 'analysis',  name: 'MD&A tone shifts',        taskId: 'soc-5',  size: '12 KB',  updatedAt: '2026-05-10' },

  // Compose
  { path: 'memos/pitch/2026-05-12.md',                                            stage: 'compose', type: 'memo',      name: 'Pitch memo',              taskId: 'soc-9',  size: '6.4 KB', updatedAt: '2026-05-12' },
];

const NVDA_BRIEF: CoverageBrief = {
  ticker: 'NVDA',
  thesisOneLiner: 'Networking attach + hyperscaler capex are the only two numbers that matter.',
  thesisBody:
    'NVIDIA\'s data-center revenue is a derivative of hyperscaler capex. Q1 was a $52.4B beat (Street $50.1B) with networking attach at 19% of DC revenue and rising. The forward signal is total capex guides from MSFT, GOOG, AMZN, META, and ORCL — when two raise capex >10% mid-year, NVDA estimates have a 1-quarter lag before catching up. AVGO\'s networking ramp is the structural threat.',
  keyQuestions: [
    'Does AVGO\'s Tomahawk 5 ramp materially compress NVDA InfiniBand attach?',
    'What is hyperscaler capex run-rate guidance for the back half of 2026?',
    'Are sovereign deals adding a third leg to revenue?',
  ],
  kpis: [
    { name: 'DC revenue YoY %',           target: '> 150', current: '212',  trend: 'up' },
    { name: 'Networking attach (DC %)',    target: '> 18', current: '19',   trend: 'up' },
    { name: 'GAAP gross margin %',         target: '> 70', current: '70.8', trend: 'flat' },
  ],
  risks: [
    { rank: 1, risk: 'Hyperscaler capex deceleration in H2 2026',           severity: 'high'   },
    { rank: 2, risk: 'AVGO networking ramp displaces InfiniBand attach',     severity: 'medium' },
    { rank: 3, risk: 'China export-control expansion narrows TAM',          severity: 'medium' },
  ],
  catalysts: [
    { date: '2026-Q2', description: 'MSFT/GOOG/META Q1 capex calls',  impact: 'high' },
    { date: '2026-Q2', description: 'Computex Blackwell roadmap',       impact: 'medium' },
    { date: '2026-Q3', description: 'Sovereign-deal commentary on call', impact: 'medium' },
  ],
  startStage: 'compose',
  mode: 'plan',
  updatedAt: '2026-05-11T20:00:00Z',
};

const NVDA_TASKS: PipelineTask[] = [
  { id: 'nvda-1', stage: 'setup',    title: 'Confirm thesis with PM',                                status: 'done',        priority: 'high',   taskType: 'planning',  suggestedSkills: ['coverage-planner'],   dependencies: [] },
  { id: 'nvda-2', stage: 'ingest',   title: 'Fetch NVDA 10-K',                                       status: 'done',        priority: 'high',   taskType: 'ingestion', suggestedSkills: ['fetch-edgar-filing'], dependencies: ['nvda-1'] },
  { id: 'nvda-3', stage: 'ingest',   title: 'Q1 transcript fetch',                                    status: 'done',        priority: 'high',   taskType: 'ingestion', suggestedSkills: ['transcript-fetcher'], dependencies: ['nvda-1'] },
  { id: 'nvda-4', stage: 'analyze',  title: 'Extract networking-attach mentions across hyperscaler calls', status: 'in-progress', priority: 'high',   taskType: 'analysis',  suggestedSkills: ['extract-tone-shifts'], dependencies: ['nvda-3'], nextActionPrompt: 'Sweep MSFT/META/GOOG Q1 call transcripts for AVGO Tomahawk 5 and InfiniBand mentions; tag positive/neutral/negative valence.' },
  { id: 'nvda-5', stage: 'compose',  title: 'Earnings reaction (live during tonight\'s call)',         status: 'in-progress', priority: 'high',   taskType: 'writing',   suggestedSkills: ['earnings-reaction'],  dependencies: ['nvda-2', 'nvda-4'], requiresHumanApproval: true, nextActionPrompt: 'Compose a live earnings reaction during tonight\'s call. Headline: was Networking attach > 19%? Was Blackwell timing reaffirmed? What did sovereign run-rate commentary look like?' },
  { id: 'nvda-6', stage: 'maintain', title: 'Maintenance update (post-earnings)',                     status: 'pending',     priority: 'medium', taskType: 'writing',   suggestedSkills: ['maintenance-update'],  dependencies: ['nvda-5'] },
];

const NVDA_ARTIFACTS: Artifact[] = [
  { path: '.pipeline/docs/coverage_brief.json',                                stage: 'setup',   type: 'brief',     name: 'coverage_brief.json',  taskId: 'nvda-1', size: '3 KB',   updatedAt: '2026-05-11' },
  { path: 'corpus/filings/10-K/0001045810-26-000019/primary.md',              stage: 'ingest',  type: 'filing',    name: '10-K · FY25 annual',   taskId: 'nvda-2', size: '912 KB', updatedAt: '2026-02-19' },
  { path: 'corpus/transcripts/q1-2026.md',                                     stage: 'ingest',  type: 'transcript',name: 'Q1 2026 call',         taskId: 'nvda-3', size: '24 KB',  updatedAt: '2026-05-04' },
  { path: 'memos/earnings-reaction/2026-05-11.md',                             stage: 'compose', type: 'memo',      name: 'Earnings reaction',    taskId: 'nvda-5', size: '4.2 KB', updatedAt: '2026-05-11' },
];

export const mockCoverages: TickerCoverage[] = FRESH_INSTALL
  ? []
  : [
      { ticker: 'SOC',  analystSlug: 'david-park',  brief: SOC_BRIEF,  tasks: SOC_TASKS,  artifacts: SOC_ARTIFACTS },
      { ticker: 'NVDA', analystSlug: 'maria-chen',  brief: NVDA_BRIEF, tasks: NVDA_TASKS, artifacts: NVDA_ARTIFACTS },
    ];

export function getCoverage(ticker: string): TickerCoverage | undefined {
  return mockCoverages.find((c) => c.ticker === ticker.toUpperCase());
}
