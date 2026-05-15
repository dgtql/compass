---
name: ray
description: |
  Activate this skill when the user wants to analyze a macro investment thesis, evaluate an asset class through the lens of global economic cycles, or apply Ray Dalio's systematic macro framework to a specific opportunity or portfolio decision.

  This skill is also appropriate when the user asks about debt crises, deleveraging dynamics (the "d-process"), risk parity portfolio construction, currency or fixed income positioning, or geopolitical shifts affecting capital flows. It applies Dalio's documented frameworks: the Economic Machine template, the Big Debt Cycle, the All Weather / risk parity approach, and the Changing World Order thesis on empire cycles and reserve currency dynamics.

  Do not activate for single-stock fundamental analysis or bottom-up equity screening — this skill is calibrated to global macro thinking, asset class allocation, and systemic risk assessment in the Dalio tradition.
phase: compose
runner: agent
allowed-tools: Read Write
model: claude-sonnet-4-6
max_turns: 40
needs:
  - brief
  - filings(10-K)
  - filings(10-Q)
  - snapshots
  - news
  - overview
  - segments
  - kpis
output: memos/ray-pitch/{date}.md
---

# Ray Dalio Investment Thinking System

What this skill embodies is Ray Dalio's systematic global macro framework: the Economic Machine template, the Big Debt Cycle, the risk parity approach pioneered at Bridgewater's All Weather fund, and the Changing World Order thesis on geopolitical capital flows — applied with the principle-driven rigor and stress-tested thinking that defines Dalio's recorded methodology.

Not pattern-matching to headlines — thinking the way the Economic Machine actually works.

> **Read reference files:** Use the Read tool, with path = the `Base directory` shown at the top when the skill loads + `/references/filename`.
> Construction: `{Base directory}/references/01-economic-machine.md` (replace `{Base directory}` with the actual path displayed).
> **Files must actually be read before analysis — do not rely on built-in knowledge as a substitute.**

---

## Quick Filter (5 minutes, 7 questions)

Run these 7 questions first. Two "No" answers require strong justification; four "No" answers means pass and move to the next opportunity.

| # | Dimension | Question | No = Red Flag |
|---|-----|-----|------------|
| 1 | **Macro Legibility** | Can I explain in one paragraph which economic force is driving this thesis (credit, inflation, growth, currency)? | Can't explain = thesis is not macro-grounded |
| 2 | **Debt Cycle Position** | Have I identified where the relevant economy sits in its long-term debt cycle (leveraging / late-cycle / deleveraging)? | No = missing the most critical structural context |
| 3 | **D-Process Risk** | If a deleveraging event occurs, does the asset or position survive or benefit? | No = unacceptable tail risk left unexamined |
| 4 | **Currency Sensitivity** | Is the currency exposure identified and stress-tested against central bank policy divergence? | No = major unpriced risk |
| 5 | **Risk Parity Balance** | Is the portfolio risk contribution balanced across growth, inflation, and rate factors — not merely dollar-weighted? | No = concentration masquerading as diversification |
| 6 | **Historical Analogue** | Is there a prior debt cycle or world order transition episode that validates or challenges this thesis? | No = thesis lacks empirical grounding |
| 7 | **World Order Alignment** | Does the thesis account for the relative rise or decline of the dominant reserve-currency power? | No = ignoring the structural geopolitical backdrop |

> D-Process risk (Q3) and Currency Sensitivity (Q4) together constitute a structural floor — either one, unchecked, can invalidate an otherwise coherent macro thesis.

---

## Reference File Reading Protocol

**Core principle: read on demand, do not read everything at once.** Decide which files to read based on task type.

### Task Type → Reading Path

**A · Quick Orientation** ("Is this macro setup worth deeper analysis?")
→ Use the 7-question filter directly — no reference files needed until the filter is passed.

**B · Full Macro Deep Analysis** (standard path, execute in order)
```
Required (in order):
  references/01-economic-machine.md      ← Credit cycles, productivity, debt cycles, economic levers
  references/02-debt-crises.md           ← Big Debt Cycle, d-process, deleveraging archetypes
  references/03-risk-parity.md           ← All Weather framework, risk factor balance, portfolio construction

Supplemental as needed:
  references/04-currencies-rates.md      ← Currency dynamics, reserve currency cycles, fixed income positioning
  references/05-world-order.md           ← Changing World Order thesis, empire arcs, geopolitical capital flows
  references/06-principles.md            ← Stress-testing beliefs, principle-based decision rules, scenario weighting
```

**C · Specific Topics** (jump directly to the corresponding file)

| User is asking about… | Read |
|---------|---|
| Credit expansion / contraction / short-term vs. long-term debt cycle | `references/01-economic-machine.md` |
| Deleveraging, d-process, debt crises, austerity vs. money printing | `references/02-debt-crises.md` |
| Risk parity, All Weather, factor balance, volatility-weighted allocation | `references/03-risk-parity.md` |
| Currency depreciation, reserve currency status, central bank divergence | `references/04-currencies-rates.md` |
| U.S.–China rivalry, empire decline, geopolitical capital flows, gold | `references/05-world-order.md` |
| Stress-testing a thesis, principle-based decision rules, scenario weighting | `references/06-principles.md` |

---

## Deep Analysis Framework (Path B expanded)

### 1 · Economic Machine Positioning (do first — cannot skip)

> "The economy works like a simple machine. But many people don't understand it."

- **Cycle identification**: Is the relevant economy in a short-term credit expansion, short-term contraction, long-term leveraging, or long-term deleveraging phase?
- **Three drivers check**: Productivity growth (slow and steady), short-term debt cycle (~5–8 years), long-term debt cycle (~50–75 years) — which force is dominant right now?
- **Central bank levers**: Are interest rates and money supply operating normally, or approaching constraint limits (zero lower bound, QE exhaustion, credibility erosion)?

---

### 2 · Debt Cycle & D-Process Analysis (read 02)

Dalio distinguishes the d-process (deleveraging) from a normal recession. Four policy levers are available; the mix determines whether the outcome is deflationary, inflationary, or a "beautiful deleveraging":

```
1. Austerity              → deflationary
2. Debt defaults / restructuring → deflationary
3. Wealth redistribution  → transfers, politically driven
4. Debt monetization      → inflationary
```

**"Beautiful deleveraging"** balances deflationary and inflationary forces so nominal growth exceeds nominal interest rates without triggering hyperinflation.

Key judgment: Is the current environment a **deflationary deleveraging** (cash and nominal bonds favored) or an **inflationary deleveraging** (real assets, commodities, and gold favored)?

---

### 3 · Risk Parity & All Weather Construction (read 03)

Dalio's All Weather insight: assets perform differently across four economic environments. A truly balanced portfolio holds something that performs well in each:

```
Rising Growth    → Equities, Corporate Credit, Commodities
Falling Growth   → Nominal Bonds, Inflation-Linked Bonds
Rising Inflation → Commodities, Gold, TIPS, Emerging Market real assets
Falling Inflation → Nominal Bonds, Developed-Market Equities
```

Risk parity weights by **risk contribution**, not dollar allocation. A conventional 60/40 portfolio derives roughly 90% of its risk from equities — it is not balanced in any meaningful sense.

Key judgment: Does the proposed position add to or reduce risk-factor concentration relative to existing exposures?

---

### 4 · Currency & Fixed Income Dynamics (read 04 when relevant)

- **Reserve currency cycle**: Is the dominant reserve currency being debased? What is the trajectory of its share in global reserves and central bank holdings?
- **Debt-to-GDP stress**: At what level does sovereign debt servicing crowd out productive investment or force monetization?
- **Triple deficit signal**: When a country runs large fiscal deficits, large debt loads, and a deteriorating current account simultaneously, its currency faces structural — not cyclical — pressure.

---

### 5 · Changing World Order Context (read 05 when relevant)

Dalio's historical study of reserve-currency empires (Dutch, British, American) identifies a recurring arc and late-cycle warning signs:

```
Empire Arc:   Rise → Consolidation → Overextension → Decline
Late Signals: Wealth inequality spike → Internal conflict → Military overreach
              → Currency debasement → Loss of reserve currency status
```

Key judgment: Does the investment thesis depend on continuation of a geopolitical order that may itself be in transition? If so, does the thesis hold — or improve — if that transition accelerates?

---

## Standard Output Format

**All sections are required outputs and cannot be omitted.** Quick orientation (Path A) may use one sentence per section; full macro analysis (Path B) requires complete expansion.

```
## Macro Conclusion
[Proceed / Do Not Proceed / Monitor / Reduce Exposure] — one-sentence core rationale

## Macro Thesis Statement              ← required, cannot skip
[State the single driving force: which economic lever, which cycle phase, which geopolitical shift]

## Economic Machine Positioning
- Short-term debt cycle phase: [expansion / peak / contraction / trough]
- Long-term debt cycle phase: [leveraging / late-cycle / deleveraging]
- Central bank constraint: [normal / limited / exhausted]
- Dominant driver right now: [productivity growth / short cycle / long cycle]

## Debt Cycle & D-Process Assessment
- D-process present? [Yes / No / Early warning]
- Deleveraging type: [deflationary / inflationary / beautiful balance / not applicable]
- Policy lever being deployed: [austerity / restructuring / redistribution / monetization / mix]
- Asset class implication: [which regime — bonds, cash, real assets, equities — is favored]

## Risk Parity Factor Exposure
- Growth factor contribution: [over / neutral / under]
- Inflation factor contribution: [over / neutral / under]
- Rate factor contribution: [over / neutral / under]
- Concentration warning: [present / absent — state basis]
- All Weather alignment: [aligned / misaligned / partial]

## Currency & Fixed Income View
- Currency trajectory: [appreciating / depreciating / range-bound — and why]
- Reserve currency stress indicators: [present / absent]
- Sovereign debt sustainability: [sustainable / watch / stressed]
- Fixed income positioning implication: [duration / credit / TIPS / avoid]

## World Order Context
- Geopolitical cycle phase of dominant power: [rising / consolidated / declining]
- U.S.–China dynamic relevance to thesis: [high / medium / low — why]
- Capital flow implication: [inflows to / outflows from which regions or asset classes]
- Tail risk from order transition: [quantify or qualify]

## Historical Analogues (1–2)
[Identify the closest prior episode from Dalio's documented cycle research — what happened, what it implies for the current thesis]

## Key Assumptions (3–5)            ← required, cannot skip
[Core assumptions the thesis depends on — listed explicitly for later verification]

## Key Risks (max 3)
[Focus on the most critical systemic risks — do not list everything]

## Monitoring Indicators              ← required, cannot skip
- Track each quarter:
- Signals that trigger a thesis review:
- Signals that confirm thesis remains on track:

## Overall Macro Assessment
[From Dalio's systematic, principle-driven perspective — state the thesis verdict, the confidence level, and the single most important variable to watch going forward]
```

---

## Reference File Index

| File | Contents |
|-----|-----|
| `references/01-economic-machine.md` | Credit cycle mechanics, productivity trend, short- vs. long-term debt cycles, central bank levers, income vs. debt servicing dynamics |
| `references/02-debt-crises.md` | Big Debt Cycle template, d-process vs. recession distinction, deflationary and inflationary deleveraging archetypes, "beautiful deleveraging" conditions, four policy levers |
| `references/03-risk-parity.md` | All Weather four-environment framework, risk-factor contribution weighting, volatility targeting, diversification beyond dollar allocation, Pure Alpha vs. All Weather distinction |
| `references/04-currencies-rates.md` | Reserve currency dynamics, currency debasement signals, triple deficit framework, central bank divergence, sovereign debt stress thresholds, fixed income positioning across regimes |
| `references/05-world-order.md` | Changing World Order thesis, empire arc template, U.S.–China rivalry indicators, internal conflict metrics, capital flight patterns, gold as reserve asset alternative |
| `references/06-principles.md` | Stress-testing beliefs, radical transparency applied to investment decisions, principle-based decision rules, scenario probability weighting, separating signal from noise |