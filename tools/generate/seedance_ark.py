"""Seedance 2.0 video generation via Volcano Ark Agent Plan (direct API).

No fal.ai / Replicate proxy — calls Ark Plan v3 directly.
Requires ARK_API_KEY in .env (Agent Plan key).
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool, Determinism, ExecutionMode, ResourceProfile,
    RetryPolicy, ToolResult, ToolRuntime, ToolStability, ToolStatus, ToolTier,
)


class SeedanceArkVideo(BaseTool):
    name = "seedance_ark"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "video_generation"
    provider = "seedance"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = []
    install_instructions = (
        "Set ARK_API_KEY to your Volcano Ark Agent Plan API key.\n"
        "  Get one at https://console.volcengine.com/ark/"
    )
    agent_skills = ["seedance-2-0", "ai-video-gen"]

    capabilities = ["text_to_video", "image_to_video", "reference_to_video"]
    supports = {
        "text_to_video": True,
        "image_to_video": True,
        "reference_to_video": True,
        "native_audio": True,
        "cinematic_quality": True,
        "aspect_ratio": True,
        "seed": True,
    }
    best_for = [
        "Direct Ark Agent Plan video gen — no proxy, no extra fees",
        "preferred when ARK_API_KEY is set (bypasses fal.ai / Replicate)",
    ]
    not_good_for = ["offline generation", "non-Ark subscription users"]
    fallback_tools = ["seedance_video", "seedance_replicate"]
    quality_score = 0.94

    input_schema = {
        "type": "object",
        "required": ["prompt"],
        "properties": {
            "prompt": {"type": "string"},
            "operation": {
                "type": "string",
                "enum": ["text_to_video", "image_to_video"],
                "default": "text_to_video",
            },
            "model_variant": {
                "type": "string",
                "enum": ["standard", "fast", "mini"],
                "default": "fast",
            },
            "duration": {"type": "integer", "default": 5, "minimum": 3, "maximum": 15},
            "aspect_ratio": {
                "type": "string",
                "enum": ["16:9", "9:16", "1:1", "4:3", "3:4"],
                "default": "16:9",
            },
            "resolution": {
                "type": "string",
                "enum": ["480P", "720P", "1080P"],
                "default": "720P",
            },
            "generate_audio": {"type": "boolean", "default": True},
            "image_url": {"type": "string", "description": "Start frame URL for image_to_video"},
            "image_path": {"type": "string", "description": "Local start-frame path, auto-converted to base64"},
            "seed": {"type": "integer"},
            "output_path": {"type": "string"},
        },
    }

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=500, network_required=True)
    retry_policy = RetryPolicy(max_retries=2, retryable_errors=["rate_limit", "timeout"])
    idempotency_key_fields = ["prompt", "model_variant", "operation", "duration", "seed"]
    side_effects = ["writes video file", "calls Ark API"]
    user_visible_verification = ["Watch generated clip"]

    ARK_BASE = "https://ark.cn-beijing.volces.com/api/plan/v3/contents/generations/tasks"

    MODEL_MAP = {
        "standard": "doubao-seedance-2.0",
        "fast": "doubao-seedance-2.0-fast",
        "mini": "doubao-seedance-2.0-mini",
    }

    def _get_api_key(self) -> str | None:
        return os.environ.get("ARK_API_KEY")

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE if self._get_api_key() else ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0  # covered by Agent Plan subscription

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        variant = inputs.get("model_variant", "fast")
        return 60.0 if variant == "fast" else 180.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        if not api_key:
            return ToolResult(success=False, error="ARK_API_KEY not set. " + self.install_instructions)

        import requests, base64

        start = time.time()
        operation = inputs.get("operation", "text_to_video")
        variant = inputs.get("model_variant", "fast")
        model = self.MODEL_MAP.get(variant, "doubao-seedance-2.0-fast")

        # ═══ Build payload ═══
        content: list[dict] = [{"type": "text", "text": inputs["prompt"]}]

        if operation == "image_to_video":
            img_url = inputs.get("image_url")
            if not img_url and inputs.get("image_path"):
                with open(inputs["image_path"], "rb") as f:
                    b64 = base64.b64encode(f.read()).decode()
                img_url = f"data:image/png;base64,{b64}"
            if img_url:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": img_url},
                    "role": "first_frame",
                })

        body: dict[str, Any] = {
            "model": model,
            "content": content,
            "parameters": {
                "resolution": inputs.get("resolution", "720P"),
                "duration": inputs.get("duration", 5),
                "ratio": inputs.get("aspect_ratio", "16:9"),
            },
        }
        if "generate_audio" in inputs:
            body["generate_audio"] = inputs["generate_audio"]
        if inputs.get("seed") is not None:
            body["parameters"]["seed"] = inputs["seed"]

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            # ═══ Submit ═══
            resp = requests.post(self.ARK_BASE, headers=headers, json=body, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            task_id = data.get("id")
            if not task_id:
                return ToolResult(success=False, error=f"Ark: no task_id in response: {data}")

            # ═══ Poll ═══
            poll_url = f"{self.ARK_BASE}/{task_id}"
            for _ in range(300):
                time.sleep(5)
                poll = requests.get(poll_url, headers=headers, timeout=15)
                poll.raise_for_status()
                pd = poll.json()
                status = pd.get("status", "?")
                if status == "succeeded":
                    video_url = pd.get("content", {}).get("video_url", "")
                    break
                if status == "failed":
                    err = pd.get("error", {}).get("message", "unknown")
                    return ToolResult(success=False, error=f"Ark Seedance failed: {err}")
            else:
                return ToolResult(success=False, error="Ark Seedance timed out after 300 polls")

            if not video_url:
                return ToolResult(success=False, error="Ark: no video_url in response")

            # ═══ Download ═══
            vresp = requests.get(video_url, timeout=120)
            vresp.raise_for_status()

            output_path = Path(inputs.get("output_path", "seedance_ark_output.mp4"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_bytes(vresp.content)

        except Exception as e:
            return ToolResult(success=False, error=f"Ark Seedance failed: {e}")

        from tools.video._shared import probe_output
        probed = probe_output(output_path)

        return ToolResult(
            success=True,
            data={
                "provider": "seedance",
                "gateway": "ark",
                "model": model,
                "prompt": inputs["prompt"],
                "operation": operation,
                "variant": variant,
                "aspect_ratio": inputs.get("aspect_ratio", "16:9"),
                "resolution": inputs.get("resolution", "720P"),
                "output": str(output_path),
                "format": "mp4",
                **probed,
            },
            artifacts=[str(output_path)],
            cost_usd=self.estimate_cost(inputs),
            duration_seconds=round(time.time() - start, 2),
            model=model,
        )
