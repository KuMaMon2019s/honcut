"""pipeline_init.py — Initialize a new OpenMontage production project.

Usage:
    python pipeline_init.py animation projects/001/ "panda vs panther scroll duel"

Creates:
    projects/<id>/manifest.yaml    ← pipeline state tracker
    projects/<id>/README.md        ← project brief
"""

from __future__ import annotations

import sys
import yaml
from datetime import datetime, timezone
from pathlib import Path


def init_project(pipeline: str, project_dir: str, title: str = "") -> str:
    """Create project directory with manifest and README. Returns project path."""
    proj = Path(project_dir)
    proj.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc).isoformat()

    # ── manifest.yaml ──
    manifest = {
        "project_id": proj.name,
        "pipeline": pipeline,
        "title": title,
        "created_at": now,
        "current_stage": "script",
        "stages": {
            "script": {"status": "pending", "artifact": None},
            "scene_plan": {"status": "pending", "artifact": None},
            "assets": {"status": "pending", "artifact": None},
            "compose": {"status": "pending", "artifact": None},
            "publish": {"status": "pending", "artifact": None},
        },
        "kb_materials_used": [],
    }

    with open(proj / "manifest.yaml", "w") as f:
        yaml.dump(manifest, f, allow_unicode=True, default_flow_style=False)

    # ── README.md ──
    readme = f"# {title or proj.name}\n\n"
    readme += f"- Pipeline: {pipeline}\n"
    readme += f"- Created: {now}\n"
    readme += f"- Status: Stage 0 — initialized\n\n"
    readme += "## Stages\n\n"
    for s in ["script", "scene_plan", "assets", "compose", "publish"]:
        readme += f"- [ ] {s}\n"

    with open(proj / "README.md", "w") as f:
        f.write(readme)

    print(f"Project initialized: {project_dir}")
    print(f"  manifest.yaml  — pipeline state")
    print(f"  README.md      — project brief")
    return str(proj)


def advance_stage(project_dir: str, stage: str) -> bool:
    """Update manifest to mark a stage as complete."""
    proj = Path(project_dir)
    manifest_path = proj / "manifest.yaml"
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}")
        return False

    with open(manifest_path) as f:
        manifest = yaml.safe_load(f)

    if stage not in manifest.get("stages", {}):
        print(f"Stage '{stage}' not in manifest")
        return False

    manifest["current_stage"] = stage
    manifest["stages"][stage]["status"] = "in_progress"

    with open(manifest_path, "w") as f:
        yaml.dump(manifest, f, allow_unicode=True, default_flow_style=False)

    print(f"Advanced to: {stage}")
    return True


def complete_stage(project_dir: str, stage: str, artifact_path: str = "") -> bool:
    """Mark a stage as completed with artifact path."""
    proj = Path(project_dir)
    manifest_path = proj / "manifest.yaml"
    if not manifest_path.exists():
        return False

    with open(manifest_path) as f:
        manifest = yaml.safe_load(f)

    manifest["stages"][stage] = {
        "status": "completed",
        "artifact": artifact_path or f"{stage}.yaml",
    }

    # Determine next stage
    stage_order = ["script", "scene_plan", "assets", "compose", "publish"]
    try:
        idx = stage_order.index(stage)
        if idx + 1 < len(stage_order):
            manifest["current_stage"] = stage_order[idx + 1]
    except ValueError:
        pass

    with open(manifest_path, "w") as f:
        yaml.dump(manifest, f, allow_unicode=True, default_flow_style=False)

    print(f"Stage '{stage}' completed.")
    if artifact_path:
        print(f"  Artifact: {artifact_path}")
    return True


# ─── CLI ───

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python pipeline_init.py init <pipeline> <project_dir> [title]")
        print("  python pipeline_init.py advance <project_dir> <stage>")
        print("  python pipeline_init.py complete <project_dir> <stage> [artifact_path]")
        sys.exit(1)

    action = sys.argv[1]

    if action == "init":
        pipeline = sys.argv[2]
        proj_dir = sys.argv[3]
        title = sys.argv[4] if len(sys.argv) > 4 else ""
        init_project(pipeline, proj_dir, title)

    elif action == "advance":
        proj_dir = sys.argv[2]
        stage = sys.argv[3]
        advance_stage(proj_dir, stage)

    elif action == "complete":
        proj_dir = sys.argv[2]
        stage = sys.argv[3]
        artifact = sys.argv[4] if len(sys.argv) > 4 else ""
        complete_stage(proj_dir, stage, artifact)

    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
