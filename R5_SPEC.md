# R5: Timeline Clip Drag Enhancement

Current ClipBlock.tsx has basic drag but poor UX. Improve ALL of the following:

## Requirements

1. **Real-time follow**: During drag, clip follows mouse in real-time (use state-driven left offset). Add semi-transparent + shadow effect while dragging.
2. **Time tooltip**: Show floating tooltip during drag showing current frame position and timecode (e.g. "48f / 0:02").
3. **Frame snapping**: Snap to integer frames during drag (already has Math.round, keep it).
4. **Cross-track drag**: Support vertical drag to adjacent same-type tracks (V->V, A->A). TrackLane needs mousemove Y-offset detection.
5. **Collision detection**: On drag end, check if target position overlaps with other clips on same track. If overlap, reject and show toast.
6. **Undo support**: After drag completes, push UndoEntry to undoStack (type="timing"), so Cmd+Z can undo.
7. **Cursor**: During drag, cursor changes from grab to grabbing (document.body.style.cursor).
8. **Context menu integration**: ClipContextMenu.tsx is already written but NOT connected to TimelineViewer. Add onContextMenu callback to ClipBlock, pass through TrackLane, manage contextMenu state in TimelineViewer and render ClipContextMenu.

## Technical Constraints

- React 19 + Vite, NO external drag libraries, pure mouse events only
- API: same-track use `api.updateClipTiming(projectId, clipId, {start_frame})`; cross-track use `api.updateClip(projectId, clipId, {start_frame, track})`
- Dark theme CSS vars: --bg #0f0f1a, --panel #1a1a2e, --accent #e94560
- Files to modify: src/components/ClipBlock.tsx, src/components/TrackLane.tsx, src/TimelineViewer.tsx
- Do NOT modify backend Go code
- Do NOT modify src/api/client.ts (already has updateClipTiming and updateClip)

## Verification

After changes, run: npx tsc --noEmit
