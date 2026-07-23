// server/plugins/view-api.ts — 轻量 API，读 OpenChatCut project.json + 渲染管线 + KB 搜索
import type { Plugin } from "vite";
import { readFile, mkdir } from "node:fs/promises";
import { createWriteStream, existsSync, createReadStream } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as https from "node:https";
import * as http from "node:http";

const STORE_DIR = join(homedir(), ".openchatcut", "project-store-v1");
const OUTPUT_DIR = join(homedir(), ".openchatcut", "output");

// KB 搜索配置
const ARK_HOST = "ark.cn-beijing.volces.com";
const ARK_PATH = "/api/plan/v3/embeddings";
const ARK_KEY = process.env.VOLCANO_ARK_API_KEY || "";
const EMBED_MODEL = "doubao-embedding-vision";
const QDRANT_COLLECTION = "knowledge_base";

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function httpsPost(host: string, path: string, headers: Record<string, string>, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const opts = { hostname: host, port: 443, path, method: "POST", headers };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch { reject(new Error("JSON parse error")); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function httpPost(host: string, port: number, path: string, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const opts = { hostname: host, port, path, method: "POST", headers: { "Content-Type": "application/json" } };
    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); } catch { reject(new Error("JSON parse error")); }
        } else {
          reject(new Error(`Qdrant HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function kbSearch(query: string, limit: number = 8) {
  // 1. 获取 embedding
  const embedData = await httpsPost(ARK_HOST, ARK_PATH, {
    "Authorization": `Bearer ${ARK_KEY}`,
    "Content-Type": "application/json",
  }, JSON.stringify({ model: EMBED_MODEL, input: query }));

  const vector = embedData?.data?.[0]?.embedding;
  if (!vector || !Array.isArray(vector)) throw new Error("No embedding returned");

  // 2. 搜索 Qdrant
  const qdrantData = await httpPost("172.17.0.3", 6333,
    `/collections/${QDRANT_COLLECTION}/points/search`,
    JSON.stringify({ vector, limit, with_payload: true, with_vector: false }));

  return (qdrantData?.result ?? []).map((r: any) => ({ score: r.score, ...r.payload }));
}

// ── Render state ──────────────────────────────────────────────

interface RenderJob {
  projectId: string;
  status: "preparing" | "rendering" | "complete" | "error" | "cancelled";
  progress: number;          // 0–100
  startTime: number;         // Date.now() when render began
  estimatedTotalFrames: number;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  process?: ChildProcess;
  outputPath?: string;
  error?: string;
}

const renders = new Map<string, RenderJob>();

function jobToResponse(job: RenderJob) {
  const elapsedMs = Date.now() - job.startTime;
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const min = Math.floor(elapsedSec / 60);
  const sec = elapsedSec % 60;
  const elapsedStr = `${min}:${sec.toString().padStart(2, "0")}`;

  let etaStr = "--:--";
  if (job.progress > 0 && job.status === "rendering") {
    const totalMs = (elapsedMs / job.progress) * 100;
    const remainingMs = totalMs - elapsedMs;
    const rMin = Math.floor(remainingMs / 60000);
    const rSec = Math.floor((remainingMs % 60000) / 1000);
    etaStr = `${rMin}:${rSec.toString().padStart(2, "0")}`;
  }

  return {
    projectId: job.projectId,
    status: job.status,
    progress: Math.min(100, Math.round(job.progress)),
    elapsed: elapsedStr,
    eta: etaStr,
    elapsedMs,
    currentFrame: job.currentFrame,
    totalFrames: job.totalFrames,
    fps: job.fps,
    outputPath: job.outputPath,
    error: job.error,
  };
}

// ── ffmpeg command builder ────────────────────────────────────

async function readProject(projectId: string) {
  const key = `project:${projectId}`;
  const encoded = key.replace(/:/g, "%3A");
  const fp = join(STORE_DIR, `${encoded}.json`);
  const raw = await readFile(fp, "utf-8");
  return JSON.parse(raw);
}

async function buildRenderCommand(
  projectId: string
): Promise<{ cmd: string; args: string[]; totalFrames: number; fps: number; outputPath: string }> {
  const doc = await readProject(projectId);

  // 使用 activeTimeline 或第一个 timeline
  const tlKey = doc.activeTimelineId ? `timelines.${doc.activeTimelineId}` : null;
  const tl = tlKey
    ? doc.timelines?.[doc.activeTimelineId]
    : doc.timelines?.[Object.keys(doc.timelines ?? {})[0]];

  if (!tl) throw new Error("No timeline found in project");

  const fps = tl.fps ?? 24;
  const items = (tl.items ?? []) as any[];

  // 只处理 V1 轨道的视频片段，按 startFrame 排序
  const v1Clips = items
    .filter((i: any) => i.track === "V1" && i.kind === "video")
    .sort((a: any, b: any) => a.startFrame - b.startFrame);

  if (v1Clips.length === 0) throw new Error("No video clips on V1 track");

  // 检查过渡
  const transitions = (tl.transitions ?? []) as any[];

  // 计算总帧数
  const totalFrames = Math.max(
    ...v1Clips.map((c: any) => c.startFrame + c.durationInFrames)
  );

  // 为每个片段解析绝对路径
  const resolvedPaths: string[] = [];
  for (const clip of v1Clips) {
    let src: string = clip.src;
    // Docker 内可能路径不同，尝试多种解析
    if (!existsSync(src)) {
      // 尝试 knowledge-base 下的相对路径
      const alt = join(homedir(), "knowledge-base", path.basename(src));
      if (existsSync(alt)) {
        src = alt;
      }
    }
    resolvedPaths.push(src);
  }

  const outputPath = join(OUTPUT_DIR, `${projectId}.mp4`);
  await mkdir(dirname(outputPath), { recursive: true });

  // 简单模式：无转场 → 使用 concat demuxer
  // 有转场 → 使用 filter_complex xfade
  const hasTransitions = transitions.length > 0;

  if (!hasTransitions) {
    // Concat demuxer approach — 需要创建临时文件列表
    const listPath = join(OUTPUT_DIR, `${projectId}_concat.txt`);
    const { writeFile } = await import("node:fs/promises");
    const listContent = resolvedPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await writeFile(listPath, listContent, "utf-8");

    return {
      cmd: "ffmpeg",
      args: [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", listPath,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-progress", "pipe:1",
        "-nostats",
        outputPath,
      ],
      totalFrames,
      fps,
      outputPath,
    };
  }

  // 有转场：filter_complex xfade
  const inputs: string[] = [];
  const filters: string[] = [];
  const vidLabels: string[] = [];
  const audLabels: string[] = [];

  for (let i = 0; i < resolvedPaths.length; i++) {
    inputs.push("-i", resolvedPaths[i]);
    vidLabels.push(`[${i}:v]`);
    audLabels.push(`[${i}:a]`);
  }

  // 构建 xfade 链
  let prevV = vidLabels[0];
  let prevA = audLabels[0];
  let offsetFrames = v1Clips[0].durationInFrames;

  for (let i = 1; i < resolvedPaths.length; i++) {
    const tx = transitions.find(
      (t: any) => t.fromItemId === v1Clips[i - 1].id && t.toItemId === v1Clips[i].id
    );
    const dur = tx ? tx.durationInFrames : 0;

    const vOut = i === resolvedPaths.length - 1 ? "[v]" : `[v${i}]`;
    const aOut = i === resolvedPaths.length - 1 ? "[a]" : `[a${i}]`;

    if (dur > 0) {
      const offsetSec = (offsetFrames / fps).toFixed(3);
      const durSec = (dur / fps).toFixed(3);
      filters.push(
        `${prevV}${vidLabels[i]}xfade=transition=fade:duration=${durSec}:offset=${offsetSec}${vOut}`
      );
      filters.push(
        `${prevA}${audLabels[i]}acrossfade=d=${durSec}${aOut}`
      );
    } else {
      // 无转场 → concat
      filters.push(`${prevV}${vidLabels[i]}concat=n=2:v=1:a=0${vOut}`);
      filters.push(`${prevA}${audLabels[i]}concat=n=2:v=0:a=1${aOut}`);
    }

    prevV = vOut;
    prevA = aOut;
    offsetFrames += v1Clips[i].durationInFrames - (tx?.durationInFrames ?? 0);
  }

  const filterComplex = filters.join(";");

  return {
    cmd: "ffmpeg",
    args: [
      "-y",
      ...inputs,
      "-filter_complex", filterComplex,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-progress", "pipe:1",
      "-nostats",
      outputPath,
    ],
    totalFrames,
    fps,
    outputPath,
  };
}

// ── ffmpeg process manager ────────────────────────────────────

async function startRender(projectId: string): Promise<RenderJob> {
  const job: RenderJob = {
    projectId,
    status: "preparing",
    progress: 0,
    startTime: Date.now(),
    estimatedTotalFrames: 0,
    currentFrame: 0,
    totalFrames: 0,
    fps: 24,
  };
  renders.set(projectId, job);

  try {
    const { cmd, args, totalFrames, fps, outputPath } = await buildRenderCommand(projectId);
    job.totalFrames = totalFrames;
    job.estimatedTotalFrames = totalFrames;
    job.fps = fps;
    job.outputPath = outputPath;
    job.status = "rendering";
    job.startTime = Date.now();

    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    job.process = proc;

    // 解析 ffmpeg -progress pipe:1 输出
    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      // 解析 frame= 行
      const match = stdout.match(/frame=(\d+)/);
      if (match) {
        job.currentFrame = parseInt(match[1], 10);
        if (totalFrames > 0) {
          job.progress = Math.min(100, (job.currentFrame / totalFrames) * 100);
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      // ffmpeg 也用 stderr 输出进度（frame=N），备用解析
      const text = chunk.toString();
      const match = text.match(/frame=\s*(\d+)/);
      if (match) {
        job.currentFrame = parseInt(match[1], 10);
        if (totalFrames > 0) {
          job.progress = Math.min(100, (job.currentFrame / totalFrames) * 100);
        }
      }
    });

    proc.on("close", (code) => {
      if (job.status === "cancelled") return;
      if (code === 0) {
        job.status = "complete";
        job.progress = 100;
      } else {
        job.status = "error";
        job.error = `ffmpeg exited with code ${code}`;
      }
      job.process = undefined;
    });

    proc.on("error", (err) => {
      if (job.status === "cancelled") return;
      job.status = "error";
      job.error = err.message;
      job.process = undefined;
    });
  } catch (err: any) {
    job.status = "error";
    job.error = err.message;
  }

  return job;
}

// ── Plugin ────────────────────────────────────────────────────

export function viewApiPlugin(): Plugin {
  return {
    name: "view-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";

        // ── CORS 预检 ──
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          res.end();
          return;
        }

        // ── POST /api/kb/search — KB 语义搜索 ──
        if (url === "/api/kb/search" && req.method === "POST") {
          try {
            const raw = await readBody(req);
            const { query } = JSON.parse(raw);
            if (!query || typeof query !== "string") {
              res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
              res.end(JSON.stringify({ error: "Missing query" }));
              return;
            }
            const results = await kbSearch(query);
            res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify({ results }));
          } catch (e: any) {
            res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // ── GET /api/kb/asset?path= — 读 KB 素材 JSON ──
        const kbAssetMatch = url.match(/^\/api\/kb\/asset\?path=(.+)$/);
        if (kbAssetMatch && req.method === "GET") {
          try {
            const assetPath = decodeURIComponent(kbAssetMatch[1]);
            const raw = await readFile(assetPath, "utf-8");
            const parsed = JSON.parse(raw);
            res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify(parsed));
          } catch (e: any) {
            res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify({ error: "Asset not found" }));
          }
          return;
        }

        // ── GET /api/project/:id — 读项目时间线 ──
        const projMatch = url.match(/^\/api\/project\/([a-f0-9-]+)$/);
        if (projMatch && req.method === "GET") {
          return handleGetProject(projMatch[1], res, next);
        }

        // ── POST /api/render/:id — 启动渲染 ──
        const renderMatch = url.match(/^\/api\/render\/([a-f0-9-]+)$/);
        if (renderMatch && req.method === "POST") {
          return handleStartRender(renderMatch[1], res);
        }

        // ── GET /api/render/:id/status — 查询渲染进度 ──
        const statusMatch = url.match(/^\/api\/render\/([a-f0-9-]+)\/status$/);
        if (statusMatch && req.method === "GET") {
          return handleRenderStatus(statusMatch[1], res);
        }

        // ── POST /api/render/:id/cancel — 取消渲染 ──
        const cancelMatch = url.match(/^\/api\/render\/([a-f0-9-]+)\/cancel$/);
        if (cancelMatch && req.method === "POST") {
          return handleCancelRender(cancelMatch[1], res);
        }

        // ── GET /api/render/:id/download — 下载渲染结果 ──
        const dlMatch = url.match(/^\/api\/render\/([a-f0-9-]+)\/download$/);
        if (dlMatch && req.method === "GET") {
          return handleDownload(dlMatch[1], res);
        }

        next();
      });
    },
  };
}

// ── Handlers ──────────────────────────────────────────────────

async function handleGetProject(pid: string, res: any, next: any) {
  try {
    const key = `project:${pid}`;
    const encoded = key.replace(/:/g, "%3A");
    const fp = join(STORE_DIR, `${encoded}.json`);
    const raw = await readFile(fp, "utf-8");
    const doc = JSON.parse(raw);
    const tl = doc.timelines?.[doc.activeTimelineId] ?? doc.timelines?.[0];

    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        name: doc.name ?? pid,
        fps: tl?.fps ?? 24,
        timeline: {
          fps: tl?.fps ?? 24,
          items: (tl?.items ?? []).map((i: any) => ({
            id: i.id,
            name: i.name,
            kind: i.kind,
            track: i.track,
            startFrame: i.startFrame,
            durationInFrames: i.durationInFrames,
            src: i.src,
          })),
          transitions: (tl?.transitions ?? []).map((t: any) => ({
            id: t.id,
            fromItemId: t.fromItemId,
            toItemId: t.toItemId,
            type: t.type,
            durationInFrames: t.durationInFrames,
          })),
        },
        assets: (doc.assets ?? []).map((a: any) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          src: a.src,
          durationInFrames: a.durationInFrames,
        })),
      })
    );
  } catch {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Project not found" }));
  }
}

async function handleStartRender(pid: string, res: any) {
  // CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // 检查是否已有渲染在进行
    const existing = renders.get(pid);
    if (existing && (existing.status === "rendering" || existing.status === "preparing")) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Render already in progress", ...jobToResponse(existing) }));
      return;
    }

    const job = await startRender(pid);
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify(jobToResponse(job)));
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function handleRenderStatus(pid: string, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const job = renders.get(pid);

  if (!job) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No render job found" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(jobToResponse(job)));
}

function handleCancelRender(pid: string, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const job = renders.get(pid);

  if (!job) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No render job found" }));
    return;
  }

  if (job.process) {
    job.process.kill("SIGTERM");
    // 如果 SIGTERM 不行，强制 kill
    setTimeout(() => {
      if (job.process && !job.process.killed) {
        job.process.kill("SIGKILL");
      }
    }, 3000);
  }
  job.status = "cancelled";
  job.process = undefined;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(jobToResponse(job)));
}

function handleDownload(pid: string, res: any) {
  const job = renders.get(pid);

  if (!job || !job.outputPath) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No render output found" }));
    return;
  }

  if (!existsSync(job.outputPath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Output file not found on disk" }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Content-Disposition": `attachment; filename="${pid}.mp4"`,
    "Access-Control-Allow-Origin": "*",
  });
  createReadStream(job.outputPath).pipe(res);
}
