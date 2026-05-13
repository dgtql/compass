"""gate-coverage-check — verify brief questions + KPIs have evidence backing."""

from __future__ import annotations

import json
from typing import Any

from compass.engagement import Engagement, Task


def _has_evidence(engagement: Engagement) -> list[str]:
    """Return paths (relative) of all artifacts under analyze/ingest trees."""
    out: list[str] = []
    for sub in ("analysis/segments", "corpus/snapshots", "corpus/news", "corpus/filings"):
        d = engagement.root / sub
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if p.is_file():
                out.append(engagement.relative(p))
    return out


async def run(
    *,
    engagement: Engagement,
    task: Task,
    on_event=None,
) -> dict[str, Any]:
    brief = engagement.load_brief()
    if brief is None:
        raise RuntimeError(
            "gate-coverage-check: no brief at .pipeline/docs/coverage_brief.json."
        )

    questions: list[str] = brief.get("key_questions") or brief.get("keyQuestions") or []
    kpis: list[dict] = brief.get("kpis") or []

    evidence = _has_evidence(engagement)

    # v1 heuristic: any evidence under the engagement counts as support.
    # The point is to catch the "no filings at all" pathology, not to
    # gate prose alignment.
    question_results = []
    for q in questions:
        question_results.append({
            "question": q,
            "supported_by": evidence[:5],  # cap to 5 to keep the JSON readable
            "status": "pass" if evidence else "fail",
        })

    # KPI check: requires an extracted kpis.json with `current` values.
    kpi_artifact = engagement.root / "analysis" / "kpis" / f"{engagement.ticker}__kpis.json"
    extracted: dict[str, Any] = {}
    if kpi_artifact.exists():
        extracted = json.loads(kpi_artifact.read_text(encoding="utf-8"))
    extracted_kpis = {k.get("name"): k for k in extracted.get("kpis", [])}

    kpi_results = []
    for kpi in kpis:
        name = kpi.get("name")
        ext = extracted_kpis.get(name)
        cur = (ext or {}).get("current") or ""
        ok = bool(cur) and cur != "<NOT_FOUND>"
        kpi_results.append({
            "name": name,
            "current": cur or None,
            "status": "pass" if ok else "fail",
        })

    overall_pass = (
        bool(question_results) and all(r["status"] == "pass" for r in question_results)
        and (not kpi_results or all(r["status"] == "pass" for r in kpi_results))
    )

    artifact_rel = task.artifact_path or "analysis/gates/coverage-check.json"
    artifact_abs = engagement.artifact_path(artifact_rel)
    artifact_abs.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "passed": overall_pass,
        "questions": question_results,
        "kpis": kpi_results,
        "notes": [
            "v1 heuristic: any artifact under analyze/ingest counts as support for a question.",
            "KPI pass requires extract-kpis to have produced a `current` value that isn't <NOT_FOUND>.",
        ],
    }
    artifact_abs.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return {
        "passed": overall_pass,
        "questions_total": len(questions),
        "questions_failed": sum(1 for r in question_results if r["status"] == "fail"),
        "kpis_total": len(kpis),
        "kpis_failed": sum(1 for r in kpi_results if r["status"] == "fail"),
        "artifact": engagement.relative(artifact_abs),
    }
