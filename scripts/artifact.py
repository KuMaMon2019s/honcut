"""artifact.py — Create and validate pipeline artifacts.

Usage:
    python artifact.py create animation script projects/001/script.md Po,hunter_panther
    python artifact.py create animation scene_plan projects/001/ 1,3

Each artifact is a YAML file in projects/<id>/ that carries pipeline stage state.
"""

from __future__ import annotations

import os
import sys
import yaml
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ─── YAML artifact templates ───

SCRIPT_TEMPLATE: dict[str, Any] = {
    "artifact": "script",
    "status": "draft",
    "pipeline": "",
    "project_id": "",
    "created_at": "",
    "approved_at": None,
    "characters": [],
    "scenes": [],
    "duration_seconds": 0,
    "notes": "",
}

SCENE_PLAN_TEMPLATE: dict[str, Any] = {
    "artifact": "scene_plan",
    "status": "draft",
    "pipeline": "",
    "project_id": "",
    "created_at": "",
    "approved_at": None,
    "scene_count": 0,
    "total_duration_seconds": 0,
    "scenes": [],
}


def create_artifact(kind: str, pipeline: str, project_dir: str, content: str) -> str:
    """Create an artifact file and return its path."""
    proj = Path(project_dir)
    proj.mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc).isoformat()
    project_id = proj.name

    if kind == "script":
        artifact = dict(SCRIPT_TEMPLATE)
        artifact["pipeline"] = pipeline
        artifact["project_id"] = project_id
        artifact["created_at"] = now
        artifact["notes"] = content

        # Try to parse character list from content (comma-separated)
        chars_part = content.split("\n")[0] if "\n" in content else content
        if "," in chars_part:
            artifact["characters"] = [c.strip() for c in chars_part.split(",")]

        path = proj / "script.yaml"

    elif kind == "scene_plan":
        artifact = dict(SCENE_PLAN_TEMPLATE)
        artifact["pipeline"] = pipeline
        artifact["project_id"] = project_id
        artifact["created_at"] = now

        # Parse: "scene_count,total_duration" or scene descriptions
        parts = content.replace("\n", "|").split("|")
        nums = parts[0].split(",") if parts else ["1", "12"]
        try:
            artifact["scene_count"] = int(nums[0].strip())
            artifact["total_duration_seconds"] = int(nums[1].strip()) if len(nums) > 1 else 0
        except ValueError:
            pass

        # scenes from remaining parts
        for i, scene_line in enumerate(parts[1:] if len(parts) > 1 else []):
            if scene_line.strip():
                artifact["scenes"].append({"number": i + 1, "description": scene_line.strip()})

        path = proj / "scene_plan.yaml"

    elif kind == "asset_manifest":
        path = proj / "asset_manifest.yaml"
        artifact = {"artifact": "asset_manifest", "status": "generated", "created_at": now, "files": []}
        for f in content.split(","):
            f = f.strip()
            if f:
                artifact["files"].append(f)

    elif kind == "publish_log":
        path = proj / "publish_log.yaml"
        artifact = {"artifact": "publish_log", "status": "published", "created_at": now, "output": content.strip()}

    else:
        print(f"Unknown artifact kind: {kind}")
        return ""

    with open(path, "w") as f:
        yaml.dump(artifact, f, allow_unicode=True, default_flow_style=False)

    print(f"Created: {path}")
    return str(path)


def approve_artifact(path: str) -> bool:
    """Mark an artifact as approved."""
    p = Path(path)
    if not p.exists():
        print(f"File not found: {path}")
        return False
    with open(p) as f:
        data = yaml.safe_load(f)
    data["status"] = "approved"
    data["approved_at"] = datetime.now(timezone.utc).isoformat()
    with open(p, "w") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
    print(f"Approved: {path}")
    return True


# ─── CLI ───

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python artifact.py <create|approve> <kind> <project_dir> [content]")
        print("  python artifact.py create animation script projects/001/ 'Po,Tigress'")
        print("  python artifact.py approve projects/001/script.yaml")
        sys.exit(1)

    action = sys.argv[1]

    if action == "create":
        kind = sys.argv[2]
        proj_dir = sys.argv[3]
        content = sys.argv[4] if len(sys.argv) > 4 else ""
        create_artifact(kind, "animation", proj_dir, content)
    elif action == "approve":
        path = sys.argv[2]
        approve_artifact(path)
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)
