"""checkpoint.py — Verify that required artifacts exist before advancing stages.

Usage:
    python checkpoint.py animation script projects/001/
    → ✅ OK  or  ❌ MISSING: projects/001/script.yaml

Integrate into SKILL.md as a hard gate: no checkpoint pass = no stage advance.
"""

from __future__ import annotations

import sys
import yaml
from pathlib import Path

# ─── Required artifacts per stage ─── (pipeline-agnostic base set)

STAGE_GATES: dict[str, list[str]] = {
    "script": [],           # Stage 2: no prerequisites (user can provide)
    "scene_plan": ["script.yaml"],
    "assets": ["scene_plan.yaml"],
    "compose": ["asset_manifest.yaml"],
    "publish": ["render_report.yaml", "final_review.yaml"],
}

# Maps pipeline name → optional per-pipeline overrides
# For now, animation pipeline uses the base gates above.

PIPELINE_GATES: dict[str, dict[str, list[str]]] = {}


def check_stage(pipeline: str, stage: str, project_dir: str) -> tuple[bool, list[str]]:
    """Check all prerequisites for advancing to `stage`.

    Returns (passed, [missing_file_paths]).
    """
    gates = PIPELINE_GATES.get(pipeline, {}).get(stage) or STAGE_GATES.get(stage, [])
    if not gates:
        return True, []

    proj = Path(project_dir)
    missing = []
    for required in gates:
        path = proj / required
        if not path.exists():
            missing.append(str(path))
        else:
            # Optional: verify YAML is valid
            try:
                with open(path) as f:
                    yaml.safe_load(f)
            except yaml.YAMLError as e:
                missing.append(f"{path} (invalid YAML: {e})")

    return len(missing) == 0, missing


def check_all(pipeline: str, project_dir: str) -> dict[str, bool]:
    """Check ALL stages; return {stage: passed}."""
    results = {}
    for stage, required in STAGE_GATES.items():
        passed, missing = check_stage(pipeline, stage, project_dir)
        results[stage] = passed
        if not passed:
            print(f"  ❌ {stage}: missing {', '.join(missing)}")
        else:
            print(f"  ✅ {stage}: OK")
    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python checkpoint.py <pipeline> <stage> <project_dir>")
        print("  python checkpoint.py animation assets projects/001/")
        print("  python checkpoint.py animation ALL projects/001/")
        sys.exit(1)

    pipeline = sys.argv[1]
    stage_or_all = sys.argv[2]
    project_dir = sys.argv[3] if len(sys.argv) > 3 else "."

    if stage_or_all.upper() == "ALL":
        check_all(pipeline, project_dir)
    else:
        passed, missing = check_stage(pipeline, stage_or_all, project_dir)
        if passed:
            print(f"✅ {stage_or_all}: checkpoint passed")
            sys.exit(0)
        else:
            print(f"❌ {stage_or_all}: checkpoint FAILED")
            for m in missing:
                print(f"   MISSING: {m}")
            sys.exit(1)
