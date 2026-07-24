# P4: Video Thumbnails + Trim Handles (TrackLane Visual Enhancement)

Project: /Users/soda/Documents/honcut (Go backend server/ + React frontend src/)
Tech stack: React + TypeScript + Vite, backend Go + SQLite

DO NOT read atris. DO NOT modify any Go backend code.

## Requirement 1: Video Thumbnail Filmstrip

In ClipBlock component, when clip.kind === "video" and clip.src is non-empty, show video frame thumbnail filmstrip:

1. Create new src/components/ThumbnailStrip.tsx component
   - Props: src (video URL), durationInFrames, fps, width (pixel width), height (pixel height, default 38)
   - Use hidden <video> element to load video, seek to evenly distributed time points (calculate needed frames based on width, ~80px interval per frame)
   - Use <canvas> to capture each frame, generate dataURL thumbnails
   - Render as a row of equal-width <img> or canvas strips filling the clip width
   - Cache: use Map<string, string[]> to cache src -> thumbnails[], avoid re-capturing
   - Error handling: fallback to solid color background + icon on video load failure

2. Modify ClipBlock.tsx
   - When clip.kind === "video" && clip.src, render ThumbnailStrip as background inside clip block
   - Overlay semi-transparent gradient mask on top of thumbnails (dark bottom -> light top) for text readability
   - Audio clips keep existing style unchanged

## Requirement 2: Trim Handles

Add draggable trim handles on left and right sides of ClipBlock:

1. Modify ClipBlock.tsx, add left and right handles
   - Left handle: absolute left:0, width:6px, cursor: col-resize, highlight bar on hover
   - Right handle: absolute right:0, width:6px, cursor: col-resize
   - Handles visible only when clip is selected (selected=true) or hovered
   - Handle drag logic (mousedown -> mousemove -> mouseup):
     * Left handle: adjust src_in_frame (source in-point) and start_frame (timeline position)
       - Drag right -> src_in_frame increases, start_frame increases, duration decreases
       - Drag left -> src_in_frame decreases, start_frame decreases, duration increases
       - Constraint: src_in_frame >= 0, duration >= 1 frame
     * Right handle: adjust duration_frames (duration)
       - Drag right -> duration increases
       - Drag left -> duration decreases
       - Constraint: duration >= 1 frame
   - Show real-time tooltip during drag: display new in/out time
   - Call onTrimEnd callback after drag ends

2. New onTrimEnd callback prop
   - ClipBlock new prop: onTrimEnd?: (clipId: string, newSrcInFrame: number, newDurationFrames: number, newStartFrame: number) => void
   - TrackLane passes through onTrimEnd
   - TimelineViewer implements handleTrimEnd:
     * Call api.updateClipTiming(projectId, clipId, { src_in_frame, duration_frames, start_frame })
     * Record undo entry
     * reloadClips()
     * showToast notification

3. Visual feedback during handle drag
   - Handle highlights during drag (white/bright color)
   - Clip block shows dashed border during trimming
   - Real-time tooltip: IN: {srcInFrame}f | DUR: {duration}f | OUT: {srcInFrame+duration}f

## Requirement 3: ClipData Extension

ClipBlock.tsx ClipData interface add field:
  srcInFrame: number;  // source in-point frame

TimelineViewer.tsx mapClip function add mapping:
  srcInFrame: c.src_in_frame || 0,

## Constraints
- DO NOT modify backend Go code, updateClipTiming API already supports src_in_frame/duration_frames/start_frame
- Keep existing drag-move functionality intact (handle mousedown must stopPropagation to avoid triggering whole-block drag)
- Keep right-click context menu working
- TypeScript compilation must pass (npx tsc --noEmit)
- vite build must pass

After completion run: npx tsc --noEmit && npx vite build to verify.
