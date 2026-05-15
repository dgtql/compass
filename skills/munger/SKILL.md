---
name: munger
description: |
  Activate this skill when a user wants to analyze a potential investment through Charlie Munger's lens: the "elementary, worldly wisdom" latticework of mental models, the Lollapalooza effect, the psychology of human misjudgment, and the discipline of concentrated, high-conviction positions in ethical businesses understood deeply across multiple disciplines.

  Use it when the question is about whether a business possesses genuine, durable value when examined from several independent analytical vantage points simultaneously — not just through a single financial lens. Particularly suited for situations where the analyst suspects behavioral biases (social proof, auction fever, commitment bias, deprivation super-reaction) may be distorting the thesis, or where multiple converging forces need to be disentangled to distinguish a real opportunity from an illusion.

  Also activate when a user needs to decide whether an idea carries a "big edge" large enough to warrant concentration, or whether the odds are simply not favorable enough to act — the card-playing discipline of folding early versus backing a clear edge heavily.

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
output: memos/munger-pitch/{date}.md
---

# Munger Investment Thinking System

What this skill embodies is Charlie Munger's lifelong project of "elementary, worldly wisdom": building a latticework of mental models drawn from multiple disciplines — psychology, mathematics, economics, history, and the natural sciences — and applying them simultaneously to cut through complexity and reach sound judgments about businesses and investments.

Not applying a single formula. Thinking across frameworks at once, watching for where multiple forces converge, always checking for the biases that turn human brains into mush.

> **Read reference files:** Use the Read tool, with path = the `Base directory` shown at the top when the skill loads + `/references/filename`.
> Construction: `{Base directory}/references/03-business-quality.md` (replace `{Base directory}` with the actual path displayed).
> **Files must actually be read before analysis — do not rely on built-in knowledge as a substitute.**

---

## Quick Filter (5 minutes, 8 questions)

Run these 8 questions first. Two "No" answers require strong justification; four "No" answers means fold early and move on to the next opportunity.

| # | Dimension | Question | No = Red Flag |
|---|-----|-----|------------|
| 1 | **Multi-Model Coherence** | Does this business make sense when examined through at least three independent analytical lenses (e.g., competitive economics, customer psychology, capital efficiency)? | No = surface-level, single-variable thesis |
| 2 | **Ethics Foundation** | Does the business model create genuine value honestly, without relying on trickery, deception, or exploitation of customers? | No = **automatic veto** |
| 3 | **Lollapalooza (Bullish)** | Are multiple independent forces — pricing power, switching costs, brand psychology, scale economics — converging to strengthen this business simultaneously? | No = fragile single-factor thesis |
| 4 | **Lollapalooza (Bias Trap)** | Am I being pulled toward this idea by social proof, auction fever, commitment bias, or fear of missing out rather than genuine cross-disciplinary analysis? | Yes = stop and restart the analysis cold |
| 5 | **Deep Understanding** | Can I describe in detail how this business earns money, retains customers, and defends its position — well enough to convince a skeptic? | No = outside circle; do not invest |
| 6 | **Decision Accountability** | Do the people running this business bear the consequences of their decisions, or do they offload risk onto others? | No = **automatic veto** |
| 7 | **Big Edge Clarity** | Is the analytical edge here genuinely large and clear, or merely marginally favorable? | Marginal = fold; only back a clear big edge heavily |
| 8 | **Concentration Worthy** | Is this idea good enough to deserve a meaningful position in a concentrated portfolio of businesses known extremely well? | No = pass or reduce to a token position |

> Ethics (Q2) and Decision Accountability (Q6) are automatic vetoes — no exceptions.
> Q4 (Bias Trap) is a mandatory pause: if Yes, all further analysis must restart without the anchoring influence that triggered the bias.

---

## Reference File Reading Protocol

**Core principle: read on demand, do not read everything at once.** Decide which files to read based on task type.

### Task Type → Reading Path

**A · Quick Judgment** ("Is this worth deeper analysis?")
→ Run the 8-question filter directly — no reference files needed. Pass the filter before proceeding to B.

**B · Full Company Deep Analysis** (standard path, execute in order)
```
Required (in order):
  references/03-business-quality.md       ← Business model, moat, ethics, durability, concentration test
  references/04-management-governance.md  ← Management character, decision accountability, incentive alignment
  references/05-financial-metrics.md      ← Financial health, earnings quality, ROIC, capital returns
  references/06-valuation-capital.md      ← Valuation, concentration decision, opportunity cost, edge sizing

Supplemental as needed:
  references/01-mental-models.md          ← Latticework frameworks, cross-discipline lenses, inversion
  references/02-psychology-biases.md      ← Lollapalooza effect, misjudgment tendencies, bias audit
```

**C · Specific Topics** (jump directly to the corresponding file)

| User is asking about… | Read |
|---------|---|
| Business model / moat / ethical foundation / competitive durability | `references/03-business-quality.md` |
| Management character / accountability / incentive structures | `references/04-management-governance.md` |
| Financials / ROIC / earnings quality / balance sheet health | `references/05-financial-metrics.md` |
| Valuation / concentration / opportunity cost / fold vs. back heavily | `references/06-valuation-capital.md` |
| Mental models / cross-discipline analysis / latticework construction | `references/01-mental-models.md` |
| Cognitive biases / Lollapalooza / social proof / auction fever / self-audit | `references/02-psychology-biases.md` |

---

## Deep Analysis Framework (Path B expanded)

### 1 · Latticework of Mental Models (do first — cannot skip)

Munger's worldly wisdom holds that "a set of mental models framed as a latticework" is the right tool for solving critical business problems. Apply at minimum three independent lenses before forming any view.

- **Economics lens**: What is the competitive structure? Do returns on capital exceed cost of capital durably, and why?
- **Psychology lens**: What keeps customers returning? Is loyalty driven by genuine preference, switching friction, or manufactured dependency?
- **Mathematics lens**: What do the unit economics look like? What does the compounding trajectory imply over ten years at conservative assumptions?
- **History lens**: Have businesses with this profile succeeded or failed over long periods? What specifically killed the ones that failed?
- **Systems lens**: Does this business exhibit the characteristics of a resilient, self-reinforcing system — or is its apparent strength a single point of failure in disguise?

**Inversion check — do this before building the bull case:**
In how many ways could this investment produce permanent capital loss? List the three most credible paths. If they cannot be articulated clearly, the business is not understood well enough to invest.

---

### 2 · Lollapalooza Effect Assessment

The Lollapalooza effect occurs when multiple forces act simultaneously in the same direction, producing extreme outcomes. Munger identified it as operating in both directions: powerfully positive for durable compounding businesses, and powerfully negative when multiple cognitive biases converge to drive irrational investor behavior.

**Bullish Lollapalooza — Does this business benefit from multiple genuinely compounding advantages?**

List each reinforcing force independently, then test whether they truly amplify each other or are actually different expressions of one underlying factor:
- Brand loyalty + pricing power + low capital intensity → do all three independently reinforce returns?
- Network effects + switching costs + data accumulation → does each independently raise barriers, or is one derivative of another?
- Scale economies + distribution control + regulatory standing → are all three structurally present and defensible?

Verdict: converging forces qualify as a Bullish Lollapalooza only if three or more independently reinforce each other. Fewer than three is a standard moat — valuable but not an extreme outcome.

**Bias Lollapalooza — Are multiple psychological tendencies pushing toward an irrational decision?**

Explicitly check each tendency that may be active in this analysis:
- **Social proof**: Others the analyst respects already own or recommend this
- **Commitment and consistency**: A view has already been stated publicly or internally
- **Deprivation super-reaction**: Fear of missing an opportunity that feels scarce or fleeting
- **Reciprocation**: Management has been unusually accessible or generous with information
- **Authority bias**: A prominent investor's ownership anchored the initial thesis
- **Auction fever**: A rising price or competitive dynamic has escalated conviction beyond the evidence

If three or more bias tendencies are active simultaneously, this is a Bias Lollapalooza trap: step back, wait at least 48 hours, and re-examine from a cold start before proceeding.

---

### 3 · Business Quality and Ethical Foundation

> "Good businesses are ethical businesses. A business model that relies on trickery is doomed to fail."

- **Ethics test**: Does the business create value for customers honestly? Would its standard operating practices survive complete public transparency without reputational damage?
- **Moat durability**: Is the competitive advantage genuinely structural, or a temporary lead that a well-resourced competitor could erode within five years?
- **Concentration worthiness**: Munger held that a concentrated number of stocks known extremely well would produce superior long-term returns. The standard is high — this business must be genuinely exceptional, not merely above average.
- **Frankel accountability principle**: Do the people who make consequential decisions bear the consequences when those decisions prove right or wrong? A system that allows decision-makers to offload risk onto others — lenders, customers, employees, shareholders — is structurally irresponsible and should be treated as a red flag regardless of near-term financial results.

---

### 4 · Psychology of Human Misjudgment

> "[W]hen three, four, five of these things work together, it turns human brains into mush."

This section is a mandatory self-audit. It applies to the analyst, not just the business being analyzed.

**On the business**: Are customers or partners subject to Lollapalooza manipulation that could unwind sharply? Examples include businesses built on artificial scarcity, open-outcry auction dynamics, social proof loops, or reciprocation traps. These can produce spectacular revenue until the mechanism breaks.

**On management**: Are incentive structures designed so that decision-makers genuinely bear consequences? Or are compensation, severance, and liability structures arranged to let executives capture upside while externalizing downside onto others?

**On the analyst (mandatory self-audit)**: Record explicitly which bias tendencies from the Lollapalooza Bias check above are active. Named biases are manageable. Unnamed biases operating below the surface are the ones that produce disasters. Writing them down is not optional — it is the mechanism of protection.

---

### 5 · Concentration Decision and Opportunity Cost

> "What you have to learn is to fold early when the odds are against you, or if you have a big edge, back it heavily because you don't get a big edge often. Opportunity comes, but it doesn't come often, so seize it when it does come."

Munger's card-playing framework applied to position sizing:

- **Fold early**: If the latticework analysis does not converge positively across three or more lenses, if the ethics test carries any doubt, or if the inversion exercise surfaces credible large-loss scenarios that cannot be satisfactorily answered — reduce or eliminate. The cost of an early fold is a missed gain. The cost of ignoring warning signs is permanent capital destruction.
- **Back heavily**: When multiple mental models converge positively, the ethics test is clean, the Bias Lollapalooza audit is clear, and the margin of safety is sufficient — concentration is the correct response. A large position in a business known extremely well is less risky than a diversified position in businesses understood only superficially.
- **Opportunity cost is always the benchmark**: The right question is not "is this a good business?" but "is this meaningfully better than the best alternative available use of capital right now?"

---

## Standard Output Format

**All sections are required outputs and cannot be omitted.** Quick judgment (Path A) may use one sentence per section; deep analysis (Path B) requires full expansion.

```
## Conclusion
[Concentrate / Add / Hold / Pass / Fold] — one-sentence core rationale

## Latticework Assessment              ← required output, cannot skip
[List each analytical lens applied and what it revealed — minimum three lenses]
Convergence verdict: [Strong / Partial / Absent]
If absent: stop analysis and explain why further work is unwarranted.

## Lollapalooza Assessment
### Bullish Convergence
[List each reinforcing force and whether they genuinely compound each other independently]
Verdict: [Lollapalooza present / Standard moat / Absent]

### Bias Trap Audit                    ← required output, cannot skip
[Name each active bias tendency explicitly — do not leave this blank]
Verdict: [Bias Lollapalooza trap detected — pause and restart / Clean — proceed]

## Key Assumptions (3–5)              ← required output, cannot skip
[Core assumptions the decision depends on — listed explicitly for later verification]

## Business Quality & Ethics
- Ethics test: [Pass / Fail — specific basis]
- Moat: [type] + [strong/medium/weak] + [widening/stable/narrowing]
- Concentration worthiness: [Yes / No / Conditional — basis]
- Frankel accountability check: [Decision-makers bear consequences / Risk offloaded — basis]

## Financial Snapshot
- ROIC (multi-year average):
- Earnings quality (cash conversion rate):
- Debt safety (stress scenario — revenue −30%):
- Capital returns to owners:

## Valuation & Concentration Decision
- Estimated intrinsic value range:
- Current margin of safety: [%]
- Edge clarity: [Large and clear / Marginal / Unclear]
- Sizing recommendation: [Concentrate / Standard weight / Underweight / Pass]
- Opportunity cost benchmark: [What is being foregone?]

## Psychology Audit — Analyst Self-Check  ← required output, cannot skip
[List every active bias tendency identified in this analysis]
[State whether the thesis was formed before or after observing current price or recent momentum]
[Record any commitment or consistency pressure that may be active]

## Key Risks (max 3)
[The three most credible paths to permanent capital loss — output of the inversion check]

## Monitoring Indicators              ← required output, cannot skip
- Check each quarter:
- Signals that trigger a fold:
- Signals that justify adding to the position:

## Overall Assessment
[From Munger's perspective — direct judgment on whether the latticework supports action,
 whether the ethics and accountability tests are clean, whether the Lollapalooza forces
 are genuinely converging, and whether the edge is large enough to back heavily or fold early]
```

---

## Reference File Index

| File | Contents |
|-----|-----|
| `references/01-mental-models.md` | Latticework construction, cross-discipline lenses (economics, psychology, mathematics, history, systems), inversion methodology, circle of competence |
| `references/02-psychology-biases.md` | Lollapalooza effect, psychology of human misjudgment, cognitive tendencies (social proof, commitment bias, deprivation super-reaction, reciprocation, authority bias, auction fever), analyst self-audit protocol |
| `references/03-business-quality.md` | Business model ethics, moat types and durability, concentration worthiness standard, Frankel accountability principle, trickery red flags |
| `references/04-management-governance.md` | Management character assessment, incentive structure analysis, decision accountability, integrity veto criteria |
| `references/05-financial-metrics.md` | ROIC, earnings quality, cash conversion, balance sheet durability, capital returns to owners |
| `references/06-valuation-capital.md` | Intrinsic value estimation, margin of safety, concentration discipline, opportunity cost framework, fold vs. back-heavily decision |