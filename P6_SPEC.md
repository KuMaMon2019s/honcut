# P6: 多轨道管理 + 音频轨增强 + 吸附引擎 + 标记系统

## 技术栈
- 前端: React 19 + TypeScript + Vite (端口 5199)
- 后端: Go net/http + SQLite (server/ 目录)
- 暗色主题，inline style 为主

## ⛔ 不要读 atris 目录下的任何文件

---

## 一、多轨道管理 (Track Management)

### 现状
- 后端 Track CRUD 已完成: `GET/POST /api/projects/{id}/tracks`, `PUT/DELETE /api/projects/{id}/tracks/{track_id}`
- 前端 `useTracks` hook 已存在于 `src/api/hooks.ts` 但 **从未被 TimelineViewer 使用**
- 当前轨道是从 clips 的 `track` 字段动态派生的 (Map<string, ClipData[]>)

### 需求
1. **TimelineViewer 加载 tracks**: 调用 `useTracks(projectId)` 获取后端轨道列表
2. **轨道显示逻辑**: 
   - 以后端 tracks 为主，clips 中引用但 tracks 表没有的轨道自动补充显示
   - 排序: 视频轨 (V1, V2...) 在上，音频轨 (A1, A2...) 在下
   - 空轨道也显示（高度 44px，显示"拖入片段"占位文字）
3. **添加轨道**: 时间线区域底部 "+ 添加轨道" 按钮，弹出小菜单选择 视频/音频 类型，调用 `api.createTrack`
4. **删除轨道**: 轨道头右键菜单 → "删除轨道"（仅空轨道可删，有片段时 toast 提示）
5. **轨道头增强**: 
   - 显示轨道名 (可双击编辑，blur 保存)
   - 类型图标 (🎬/🎵)
   - 静音按钮 (🔇/🔊 toggle，纯前端状态，存 props)
   - 轨道颜色条

### 文件变更
- `src/TimelineViewer.tsx`: 引入 useTracks，改 tracks 派生逻辑，添加轨道 UI
- `src/components/TrackLane.tsx`: 轨道头增强（编辑名、静音、右键删除）
- 新建 `src/components/AddTrackButton.tsx`: 添加轨道按钮+菜单

---

## 二、音频轨增强

### 需求
1. **音频片段视觉**: ClipBlock 中 kind==="audio" 的片段显示波形占位图案（用 CSS repeating-linear-gradient 画竖条纹模拟波形，颜色用轨道色）
2. **音频轨道头**: 显示音量滑块 (input range 0-100, 默认 100) + 静音按钮
3. **音频片段拖拽**: 与视频片段相同逻辑，但只能拖到音频轨 (track[0]==='A')

### 文件变更
- `src/components/ClipBlock.tsx`: 音频波形占位 CSS
- `src/components/TrackLane.tsx`: 音频轨道头音量控制

---

## 三、吸附引擎 (Snapping)

### 现状
- ClipBlock 拖拽只有整帧吸附: `Math.round(dx / pxPerFrame)`
- 没有 clip 边缘吸附、播放头吸附

### 需求
1. **吸附点收集**: 拖拽开始时，收集所有吸附目标:
   - 所有 clip 的 startFrame 和 endFrame (startFrame + durationInFrames)
   - 播放头位置 (playhead)
   - 所有 marker 的 frame 位置
   - 0 帧
2. **吸附逻辑**: 拖拽中，计算被拖 clip 的 newStart 和 newEnd，如果与任何吸附点距离 < threshold (8px / pxPerFrame 帧)，则吸附到该点
3. **视觉反馈**: 吸附时显示一条垂直高亮线 (红色 1px，从标尺到轨道底部)
4. **吸附开关**: 
   - 快捷键 S 切换吸附 on/off
   - 时间线工具栏显示磁铁图标 🧲，点击切换
   - 默认开启
5. **播放头吸附**: 点击标尺 seek 时，也应用吸附（吸附到 clip 边缘和 marker）

### 实现建议
- 新建 `src/utils/snapping.ts`: 导出 `collectSnapPoints(clips, playhead, markers)` 和 `snapToFrame(frame, snapPoints, thresholdFrames)` 函数
- ClipBlock 拖拽 mousemove 中调用 snapToFrame
- TimelineViewer 维护 `snapEnabled` state + `snapLine` state (number | null)

### 文件变更
- 新建 `src/utils/snapping.ts`
- `src/components/ClipBlock.tsx`: 拖拽中调用吸附
- `src/TimelineViewer.tsx`: snapEnabled state, snapLine 渲染, S 快捷键
- `src/components/Ruler.tsx`: seek 时吸附
- `src/hooks/useHotkeys.ts`: 添加 onSnapToggle

---

## 四、标记系统 (Markers)

### 后端
1. **SQLite 表**: 在 store.go 的 initDB 中添加:
```sql
CREATE TABLE IF NOT EXISTS markers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  frame INTEGER NOT NULL,
  label TEXT DEFAULT '',
  color TEXT DEFAULT '#facc15',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
2. **Store 方法**: CreateMarker, ListMarkers(projectID), UpdateMarker, DeleteMarker
3. **API 路由** (api.go):
   - `GET /api/projects/{id}/markers` → ListMarkers
   - `POST /api/projects/{id}/markers` → CreateMarker (body: {frame, label?, color?})
   - `PATCH /api/projects/{id}/markers/{marker_id}` → UpdateMarker
   - `DELETE /api/projects/{id}/markers/{marker_id}` → DeleteMarker

### 前端
1. **API client**: 在 client.ts 添加 Marker 类型 + CRUD 方法
2. **hooks.ts**: 添加 useMarkers hook
3. **Marker 显示**: 在 Ruler 上显示标记（彩色小旗帜 🚩 或三角形，位于标尺底部）
4. **添加标记**: M 键在播放头位置添加标记（弹出小输入框填 label，回车确认）
5. **删除标记**: 右键标记 → 删除
6. **点击标记**: 点击标记 seek 到该帧
7. **标记列表**: 标尺区域下方或时间线工具栏显示标记数量

### 文件变更
- `server/store.go`: markers 表 + CRUD
- `server/api.go`: markers 路由
- `src/api/client.ts`: Marker 类型 + API
- `src/api/hooks.ts`: useMarkers
- `src/components/Ruler.tsx`: 标记渲染 + 交互
- `src/TimelineViewer.tsx`: markers state, M 快捷键, 标记管理
- `src/hooks/useHotkeys.ts`: onAddMarker

---

## 验证清单
- [ ] `cd server && go build ./...` 编译通过
- [ ] `cd .. && npx tsc --noEmit` 类型检查通过
- [ ] `npx vite build` 构建通过
- [ ] 后端 markers API: curl 测试 CRUD
- [ ] 前端: 添加/删除轨道 UI 正常
- [ ] 前端: 音频片段显示波形占位
- [ ] 前端: 拖拽片段时吸附到相邻片段边缘
- [ ] 前端: S 键切换吸附
- [ ] 前端: M 键添加标记，标尺显示标记
- [ ] 前端: 点击标记 seek

## 注意事项
- 保持现有功能不破坏（拖拽、转场、右键菜单、快捷键）
- inline style 为主，不用 Tailwind class（现有代码风格）
- 后端字段 snake_case，前端 ClipData 用 camelCase
- 错误处理: try/catch + toast 提示
