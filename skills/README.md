# Compass Skills

This directory holds the markdown skill playbooks the agent reads on demand.
Skills are the unit of business logic in Compass — each one is a folder with a
`SKILL.md` (and optional `references/`) that tells the agent how to perform a
specific task.

## Layout

```
skills/
├── README.md                       # this file
├── _reference/                     # NOT loaded by the agent — see below
│   └── ...
└── <skill-name>/                   # production skills, symlinked into each workspace
    ├── SKILL.md
    └── references/                 # optional, lazy-loaded by the agent
```

## Production skills

Each production skill folder is symlinked into every per-ticker workspace at
`data/tickers/<TICKER>/.claude/skills/<skill-name>/` at workspace materialization
time. The agent discovers them through its own `Read` tool — `CLAUDE.md`
instructs the agent to consult `.claude/skills/` and read the relevant
`SKILL.md` when its `description:` frontmatter matches the current task.

Production skills: *none authored yet.*

The first attempt — `parse-edgar-filing` for HTML preprocessing — was retired in Slice 2.5 when we adopted [edgartools](https://github.com/dgunning/edgartools) (Anthropic-blessed) for both filing fetch and Markdown conversion. The skill folder became redundant because edgartools' `Filing.markdown()` already produces the clean output the skill was reaching for. See the Slice 2.5 / 3.5 notes in the [design doc](../docs/design/README.md) for full context.

The real production skill catalogue arrives in Slice 5 once the skill-discovery infrastructure (workspace `.claude/skills/` symlinks, `CLAUDE.md` template, agent loop reads `SKILL.md`) is in place.

Planned (to be authored — placeholder list, will evolve):

- `research-planner` — interactive Q&A → generates `dossier.json` + `tasks.json` for a ticker
- `ingest-and-triage` — pulls primary sources, produces the missing-context report
- `pitch-memo` — produces an initial pitch memo with citations
- `maintenance-update` — refreshes a thesis against new filings/transcripts
- `earnings-reaction` — post-earnings memo comparing thesis vs. actual
- `analyst-brief` — one-page synthesis brief for the PM
- `morning-brief` — daily across-watchlist briefing
- `pm-interrogation` — PM Q&A over an existing memo
- `citation-audit` — validates that every claim cites the evidence ledger
- `extract-tone-shifts` — detects management tone changes across filings
- `find-contradictions` — surfaces internal inconsistencies in the corpus

## `_reference/` — pattern library, not active skills

The `_reference/` directory holds skill files from the Dr. Claw research-assistant
codebase. They are kept here as **shape and pattern inspiration** for the
Compass-native skills we'll author. They are **not loaded by the agent**: the
leading underscore signals that and they're excluded from the symlink step at
workspace materialization.

Specifically:

| File | What it demonstrates | What we'll model on it |
|---|---|---|
| `inno-pipeline-planner/` | Interactive Q&A → JSON state files; "load only what you need" reference pattern | `research-planner` |
| `inno-reference-audit/` | Citation verification, anti-hallucination rules | `citation-audit` (evidence-ledger validator) |
| `inno-paper-reviewer/` | Structured adversarial review with checklists | `pm-interrogation` / bear-case stress test |
| `inno-deep-research/` | Multi-source synthesis with citations | `pitch-memo` / adversarial dossier |
| `paper-analyzer/` | Deep analysis of a single document | `analyze-10k` / `analyze-earnings-call` |

The content of these reference skills is academic / ML-research flavored and
needs to be rewritten in domain language (filings, transcripts, theses, PMs)
when we author the corresponding production skills. The *shape* is what we're
keeping — frontmatter conventions, numbered workflows, non-negotiables,
reference-file offloading, etc.

## Authoring conventions (TBD)

To be filled in once we lock the skill catalogue and write the first production
skill. Will cover: frontmatter fields, when to add `references/`, how to write
non-negotiables, how to interact with the evidence ledger.
