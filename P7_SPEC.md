# P7: 场景检测 + 转录 + GL特效 + MobileUpload

## 技术栈
- 前端: React 19 + TypeScript + Vite (端口 5199)
- 后端: Go net/http + SQLite (server/ 目录)
- 暗色主题，inline style 为主
- Python 工具: tools/analysis/scene_detect.py (已有，用子进程调用)

## ⛔ 不要读 atris 目录下的任何文件

---

## 一、场景检测 (Scene Detection)

### 现状
- `tools/analysis/scene_detect.py` 已存在，支持 PySceneDetect 和 ffmpeg fallback
- 后端没有对应的 API 端点
- 前端没有触发场景检测的 UI

### 后端需求
1. **API 端点**: `POST /api/projects/{id}/detect-scenes`
   - Body: `{"asset_id": "xxx", "method": "content", "threshold": 27.0, "min_scene_length": 1.0}`
   - 调用 Python 子进程: `python3 -m tools.analysis.scene_detect` 或直接 `python3 tools/analysis/scene_detect.py`
   - 实际上 scene_detect.py 是 BaseTool 类，不能直接命令行运行。Go 端应该用 ffmpeg 的 scene detection 滤镜直接实现:
     ```bash
     ffmpeg -i input.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1
     ```
     解析 stderr 中的 `pts_time:xxx` 得到场景切换点
   - 返回: `{"scenes": [{"index": 0, "start_seconds": 0.0, "end_seconds": 3.5, "start_frame": 0, "end_frame": 105}, ...]}`
   - 帧号计算: `frame = seconds * fps` (fps 从 project 或 timeline 获取)

2. **自动分割**: `POST /api/projects/{id}/auto-split`
   - Body: `{"asset_id": "xxx", "scenes": [...]}` 或 `{"asset_id": "xxx"}` (先检测再分割)
   - 根据场景边界，在默认轨道 V1 上创建多个 clip
   - 每个 clip 的 start_frame 递增，src_in_frame 对应场景起始帧
   - 返回创建的 clips 列表

### 前端需求
1. **MediaPoolPanel 增强**: 素材池中的视频素材右键菜单添加 "🎬 场景检测"
2. **检测进度**: 点击后显示 loading 状态，检测完成后弹出结果面板
3. **结果面板**: 显示检测到的场景数量 + 每个场景的时间范围
4. **一键导入**: "导入为片段" 按钮，调用 auto-split API，将场景作为 clips 添加到时间线
5. **刷新时间线**: 导入后自动刷新 clips 列表

### 文件变更
- `server/api.go`: 添加 detect-scenes 和 auto-split 路由 + handler
- `src/api/client.ts`: 添加 detectScenes, autoSplit 方法
- `src/components/MediaPoolPanel.tsx`: 右键菜单 + 场景检测 UI
- 新建 `src/components/SceneDetectDialog.tsx`: 检测结果对话框

---

## 二、转录 (Transcription / ASR)

### 现状
- `server/internal/config/providers.go` 已配置 `doubao-seed-asr-2.0`
- 没有转录 API 端点
- 没有字幕/转录 UI

### 后端需求
1. **API 端点**: `POST /api/projects/{id}/transcribe`
   - Body: `{"asset_id": "xxx", "language": "auto"}`
   - 步骤:
     a. 用 ffmpeg 提取音频: `ffmpeg -i video.mp4 -vn -acodec pcm_s16le -ar 16000 -ac 1 /tmp/audio.wav`
     b. 调用火山方舟 ASR API (doubao-seed-asr-2.0)
     c. 返回带时间戳的文本
   - 如果 ARK_API_KEY 未设置，返回 mock 数据 (方便开发测试):
     ```json
     {"segments": [{"start": 0.0, "end": 2.5, "text": "示例文本"}], "language": "zh"}
     ```
   - 返回: `{"segments": [{"start": 0.0, "end": 2.5, "text": "...", "start_frame": 0, "end_frame": 75}], "language": "zh"}`

2. **字幕存储**: 转录结果存入 clip 的 props JSON:
   - `props.transcription = {"segments": [...], "language": "zh"}`
   - 通过 `PATCH /api/projects/{id}/clips/{clip_id}/props` 更新

### 前端需求
1. **触发入口**: 素材池视频右键菜单 "📝 转录文字" + 时间线片段右键菜单 "📝 转录文字"
2. **转录状态**: 显示 loading "正在转录..."
3. **结果展示**: 转录完成后在 InspectorPanel 显示文字段落列表
   - 每段显示时间范围 + 文字
   - 点击某段 → seek 到对应帧
4. **字幕轨道** (简化版): 在时间线底部显示一个 "字幕" 区域，用色块标记有文字的时间段

### 文件变更
- `server/api.go`: transcribe 路由 + handler
- `src/api/client.ts`: transcribe 方法
- `src/components/MediaPoolPanel.tsx`: 右键菜单添加转录
- `src/components/InspectorPanel.tsx`: 转录结果展示
- `src/components/ContextMenu.tsx`: 添加转录菜单项

---

## 三、GL 特效 (WebGL Shader Effects)

### 现状
- LibraryPanel 已有特效列表 (Blur, Sharpen, Vignette, Chromatic Aberration, Glow, Noise)
- 特效通过 `props.effects[]` 存储在 clip 上
- PreviewPanel 用 `<video>` 标签直接播放，没有 WebGL 渲染
- 特效只是标记，没有实际视觉效果

### 前端需求 (纯前端，不改后端)
1. **WebGL 预览**: 将 PreviewPanel 的视频渲染改为 WebGL canvas
   - 创建 `<canvas>` 替代 `<video>` 显示
   - 用 `texImage2D` 将 video 帧上传为纹理
   - 用 fragment shader 实现特效
   - rAF 循环: video.currentTime → 上传纹理 → 应用 shader → 渲染

2. **Shader 特效实现** (每个特效一个 fragment shader):
   - **Blur**: 高斯模糊 (9-tap, 水平+垂直两 pass 或简化单 pass)
   - **Sharpen**: 锐化卷积核
   - **Vignette**: 暗角 (距离中心越远越暗)
   - **Chromatic Aberration**: RGB 通道偏移
   - **Glow**: 亮度提取 + 模糊 + 叠加 (简化: 亮度增强 + 轻微模糊)
   - **Noise**: 随机噪点叠加 (用 time uniform 做动画)

3. **特效叠加**: 多个特效同时生效时，链式应用 (ping-pong FBO)
   - 简化方案: 把所有特效合并到一个 shader 中 (uniform 控制开关)

4. **参数控制**: InspectorPanel 中选中片段时，显示已应用特效的参数滑块
   - Blur: intensity (0-20, 默认 5)
   - Vignette: strength (0-1, 默认 0.5)
   - Noise: amount (0-1, 默认 0.3)
   - 其他: 固定参数即可

5. **性能**: 
   - 视频未播放时渲染当前帧 (静态)
   - 播放时 rAF 更新
   - canvas 尺寸跟随预览区域

### 实现建议
- 新建 `src/utils/glRenderer.ts`: WebGL 初始化 + shader 编译 + 渲染循环
- 新建 `src/utils/shaders.ts`: 所有 fragment shader 源码 (GLSL 字符串)
- 修改 `src/components/PreviewPanel.tsx`: 用 canvas 替代 video 显示
- 修改 `src/components/InspectorPanel.tsx`: 特效参数滑块

### 文件变更
- 新建 `src/utils/glRenderer.ts`
- 新建 `src/utils/shaders.ts`
- `src/components/PreviewPanel.tsx`: WebGL canvas 渲染
- `src/components/InspectorPanel.tsx`: 特效参数控制

---

## 四、MobileUpload (手机上传)

### 现状
- 上传只支持桌面文件选择 (`POST /api/upload`)
- 没有局域网访问能力

### 后端需求
1. **局域网 IP 获取**: 服务器启动时获取本机局域网 IP
   - Go: `net.InterfaceAddrs()` 遍历，找非 loopback 的 IPv4
   - 在 `/api/health` 响应中返回 `lan_url: "http://192.168.x.x:8080"`

2. **移动端上传页面**: `GET /mobile` 返回一个独立的 HTML 页面
   - 纯 HTML + inline CSS + inline JS，不依赖 React/Vite
   - 暗色主题，大按钮，触摸友好
   - 功能:
     a. 文件选择 (accept="video/*,image/*,audio/*")
     b. 拍照/录像 (capture 属性)
     c. 拖拽上传
     d. 上传进度条
     e. 上传成功/失败提示
   - 上传到 `POST /api/upload?project_id={id}`
   - 页面 URL: `http://LAN_IP:8080/mobile?project={project_id}`

3. **CORS**: 移动端页面从 Go 服务器直接服务，不需要 CORS

### 前端需求 (桌面端)
1. **TopBar 添加按钮**: "📱 手机上传" 按钮
2. **点击弹出对话框**: 显示:
   - 局域网 URL (大字体，方便手机扫码)
   - QR 码 (用纯 JS 生成，不依赖外部库 — 可以用简单的 canvas 画 QR 或者显示 URL 让用户手动输入)
   - 简化方案: 直接显示 URL 文字 + "复制链接" 按钮
3. **自动刷新**: 手机上传完成后，桌面端素材池自动刷新 (轮询 `/api/projects/{id}/assets` 每 3 秒)

### 文件变更
- `server/api.go`: 添加 `GET /mobile` 路由，返回 HTML
- `server/cmd/honcut-server/main.go`: health 端点返回 lan_url
- `src/TimelineViewer.tsx`: TopBar 添加手机上传按钮
- 新建 `src/components/MobileUploadDialog.tsx`: 手机上传对话框

---

## 验证清单
- [ ] `cd server && go build ./...` 编译通过
- [ ] `cd .. && npx tsc --noEmit` 类型检查通过
- [ ] `node node_modules/vite/bin/vite.js build` 构建通过
- [ ] 场景检测: curl POST detect-scenes 返回场景列表
- [ ] 自动分割: curl POST auto-split 创建 clips
- [ ] 转录: curl POST transcribe 返回 segments (mock 模式)
- [ ] GL 特效: 浏览器打开预览，应用 Blur/Vignette 等特效可见
- [ ] 手机上传: 浏览器打开 /mobile 页面，上传文件成功
- [ ] 桌面端: 手机上传后素材池自动刷新

## 注意事项
- 保持现有功能不破坏（拖拽、转场、右键菜单、快捷键、吸附、标记）
- inline style 为主，不用 Tailwind class（现有代码风格）
- 后端字段 snake_case，前端用 camelCase 映射
- 错误处理: try/catch + toast 提示
- Go 路由用 Go 1.22 模式: `mux.HandleFunc("POST /api/projects/{id}/detect-scenes", ...)`
- 上传文件保留扩展名 (参考 honcut-pitfalls #39)
- `/mobile` 页面是独立 HTML，不走 Vite 构建
- WebGL shader 用 GLSL ES 1.0 (WebGL 1.0 兼容)
- 不要安装新的 npm 包（QR 码用 URL 文字替代）
