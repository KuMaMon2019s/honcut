"""enrich_video_descriptions.py — Generate text descriptions for KB videos.

After kb-mcp scans videos (embedding keyframes), this script:
1. Finds all video/image points in Qdrant that lack a description
2. Extracts a representative keyframe via ffmpeg
3. Calls doubao-seed-2.0-pro (multimodal) to describe the content
4. Updates the Qdrant payload with the description

Result: KB search returns "fluffy creature eating bun in sunny garden" 
        instead of just "seedance_720p.mp4" — enabling real AI editing decisions.
"""

import base64
import io
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

# ─── Config ────────────────────────────────────────────────────────────
ARK_API_KEY = os.environ.get("ARK_API_KEY", "")
ARK_CHAT_URL = "https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions"
ARK_MODEL = "doubao-seed-2.0-pro"
QDRANT_URL = "http://localhost:6333"
QDRANT_COLLECTION = "knowledge_base"
FRAME_CACHE_DIR = os.path.join(tempfile.gettempdir(), "kb_enrich")
FRAME_CACHE_MAX_DIRS = 50  # auto-clean old cache dirs

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXTS = {".mp4", ".mov", ".avi", ".webm", ".mkv"}


# ─── Qdrant ────────────────────────────────────────────────────────────

def qdrant_request(method, path, body=None):
    url = f"{QDRANT_URL}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())


def get_undescribed_media():
    """Scroll all points, return those that are image/video and have no description."""
    results = []
    offset = None
    while True:
        body = {"limit": 50, "with_payload": True, "with_vector": False}
        if offset:
            body["offset"] = offset
        r = qdrant_request("POST", f"/collections/{QDRANT_COLLECTION}/points/scroll", body)
        points = r.get("result", {}).get("points", [])
        if not points:
            break
        for p in points:
            pl = p["payload"]
            ext = pl.get("ext", "").lower()
            desc = pl.get("description", "")
            if (ext in IMAGE_EXTS or ext in VIDEO_EXTS) and not desc:
                results.append({
                    "id": p["id"],
                    "abs_path": pl.get("abs_path", ""),
                    "filename": pl.get("filename", ""),
                    "ext": ext,
                })
        next_offset = r.get("result", {}).get("next_page_offset")
        if next_offset:
            offset = next_offset
        else:
            break
    return results


def update_description(point_id: int, description: str):
    qdrant_request("PUT", f"/collections/{QDRANT_COLLECTION}/points/payload", {
        "points": [point_id],
        "payload": {"description": description},
    })


# ─── Vision Analysis ───────────────────────────────────────────────────

def describe_frame(image_path):
    """Call multimodal LLM to describe what's in the image (auto-compress to 512px)."""
    try:
        from PIL import Image
        img = Image.open(image_path)
        img = img.resize((512, 512))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=40)
        b64 = base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        with open(image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

    body = {
        "model": ARK_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                },
                {
                    "type": "text",
                    "text": (
                        "Describe this image in ONE concise Chinese sentence. "
                        "Focus on: what/who is in frame, what they are doing, "
                        "the setting/background, and the mood/style. "
                        "Keep it under 30 Chinese characters. "
                        "Example output: 一只圆滚滚的黑白熊猫在阳光草地上开心地吃包子"
                    )
                }
            ]
        }],
        "max_tokens": 100,
        "temperature": 0.3,
    }

    req = urllib.request.Request(
        ARK_CHAT_URL,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {ARK_API_KEY}",
        }
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read())
        content = data["choices"][0]["message"]["content"]
        return content.strip().strip('"').strip("。").strip()
    except Exception as e:
        print(f"  LLM error: {e}")
        return None


def describe_video(video_path):
    """Extract midpoint frame to a per-video directory, then describe it."""
    # Per-video frame directory: /tmp/kb_enrich/<video_filename>/
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    # Per-video frame directory (reuses cached frames)
    frame_dir = os.path.join(FRAME_CACHE_DIR, video_name)
    os.makedirs(frame_dir, exist_ok=True)

    # Get duration
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", video_path],
        capture_output=True, text=True
    )
    duration = float(json.loads(r.stdout)["format"]["duration"])

    # Grab frame at midpoint
    midpoint = duration / 2
    frame_path = os.path.join(frame_dir, f"mid_{midpoint:.1f}s.jpg")
    if not os.path.exists(frame_path):
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(midpoint), "-i", video_path,
             "-vframes", "1", "-q:v", "5", frame_path],
            capture_output=True
        )
    return describe_frame(frame_path)


def describe_image(image_path):
    """Describe a static image."""
    return describe_frame(image_path)


# ─── Main ───────────────────────────────────────────────────────────────

def enrich():
    """Find undescribed media and enrich with AI descriptions."""
    # Auto-clean old frame cache
    if os.path.exists(FRAME_CACHE_DIR):
        dirs = sorted(os.listdir(FRAME_CACHE_DIR))
        if len(dirs) > FRAME_CACHE_MAX_DIRS:
            for old in dirs[:-FRAME_CACHE_MAX_DIRS]:
                old_path = os.path.join(FRAME_CACHE_DIR, old)
                if os.path.isdir(old_path):
                    shutil.rmtree(old_path)
    items = get_undescribed_media()
    if not items:
        print("✅ All media already have descriptions.")
        return

    videos = [i for i in items if i["ext"] in VIDEO_EXTS]
    images = [i for i in items if i["ext"] in IMAGE_EXTS]
    print(f"Found: {len(videos)} videos, {len(images)} images needing descriptions")

    for i, item in enumerate(videos + images):
        path = item["abs_path"]
        if not os.path.exists(path):
            print(f"  [{i+1}/{len(items)}] ❌ File not found: {path}")
            continue

        print(f"  [{i+1}/{len(items)}] {item['filename']}...", end=" ", flush=True)
        try:
            if item["ext"] in VIDEO_EXTS:
                desc = describe_video(path)
            else:
                desc = describe_image(path)

            if desc:
                update_description(item["id"], desc)
                print(f"→ \"{desc}\" ✅")
            else:
                print("❌")
        except Exception as e:
            print(f"❌ {e}")
            import time; time.sleep(1)

    print(f"\nDone. Enriched {len(items)} items.")


if __name__ == "__main__":
    enrich()
