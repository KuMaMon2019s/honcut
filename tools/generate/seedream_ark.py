"""Doubao Seedream image generation via Volcano Ark Agent Plan (direct API)."""

from __future__ import annotations

import base64, io, os, time
from pathlib import Path
from typing import Any

import requests
from PIL import Image

from tools.base_tool import (
    BaseTool, Determinism, ExecutionMode, ResourceProfile,
    RetryPolicy, ToolResult, ToolRuntime, ToolStability, ToolStatus, ToolTier,
)


class SeedreamArkImage(BaseTool):
    name = "seedream_ark"
    version = "0.1.0"
    tier = ToolTier.GENERATE
    capability = "image_generation"
    provider = "seedream"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.STOCHASTIC
    runtime = ToolRuntime.API

    dependencies = ["Pillow", "requests"]
    install_instructions = (
        "Set ARK_API_KEY to your Volcano Ark Agent Plan API key.\n"
        "  Get one at https://console.volcengine.com/ark/"
    )
    agent_skills = ["seedream-5-0", "ai-image-gen"]

    capabilities = ["text_to_image"]
    supports = {
        "text_to_image": True,
        "cinematic_quality": True,
        "seed": True,
    }
    best_for = [
        "Doubao Seedream 5.0 Lite via Ark Agent Plan",
        "High-quality Chinese aesthetic image generation",
    ]
    not_good_for = ["image_to_image", "inpainting"]
    quality_score = 0.90

    input_schema = {
        "type": "object",
        "required": ["prompt"],
        "properties": {
            "prompt": {"type": "string", "description": "Image generation prompt"},
            "size": {"type": "string", "default": "1920x1920", "description": "Min 3,686,400 pixels"},
            "n": {"type": "integer", "default": 1, "minimum": 1, "maximum": 4},
            "output_path": {"type": "string", "default": "seedream_output.png"},
        },
    }

    resource_profile = ResourceProfile(cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=200, network_required=True)
    retry_policy = RetryPolicy(max_retries=2, retryable_errors=["rate_limit", "timeout"])
    idempotency_key_fields = ["prompt", "size"]
    side_effects = ["writes image file", "calls Ark API"]
    user_visible_verification = ["View generated image"]

    ARK_IMAGE_URL = "https://ark.cn-beijing.volces.com/api/plan/v3/images/generations"

    def _get_api_key(self) -> str | None:
        return os.environ.get("ARK_API_KEY")

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE if self._get_api_key() else ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def estimate_runtime(self, inputs: dict[str, Any]) -> float:
        return 15.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        api_key = self._get_api_key()
        if not api_key:
            return ToolResult(success=False, error="ARK_API_KEY not set.")

        start = time.time()
        body = {
            "model": "doubao-seedream-5.0-lite",
            "prompt": inputs["prompt"],
            "size": inputs.get("size", "1920x1920"),
            "n": inputs.get("n", 1),
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            resp = requests.post(self.ARK_IMAGE_URL, headers=headers, json=body, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            image_url = data["data"][0]["url"]
            img_resp = requests.get(image_url, timeout=30)
            img_resp.raise_for_status()
            img = Image.open(io.BytesIO(img_resp.content))

            output_path = Path(inputs.get("output_path", "seedream_output.png"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(output_path, "PNG")

        except Exception as e:
            return ToolResult(success=False, error=f"Seedream Ark failed: {e}")

        return ToolResult(
            success=True,
            data={
                "provider": "seedream",
                "gateway": "ark",
                "model": "doubao-seedream-5.0-lite",
                "prompt": inputs["prompt"],
                "size": inputs.get("size", "1920x1920"),
                "output": str(output_path),
                "width": img.width,
                "height": img.height,
                "format": "png",
            },
            artifacts=[str(output_path)],
            cost_usd=0.0,
            duration_seconds=round(time.time() - start, 2),
            model="doubao-seedream-5.0-lite",
        )
