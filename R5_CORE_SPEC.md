# R5 CORE: Timeline Clip Drag - Requirements 1-7 ONLY

The context menu (req 8) is DONE. Now implement the CORE drag requirements 1-7.
DO NOT touch: server/*.go, src/api/client.ts, src/components/ContextMenu.tsx, src/hooks/useHotkeys.ts

## Files to modify: src/components/ClipBlock.tsx, src/components/TrackLane.tsx, src/TimelineViewer.tsx

## Requirement 1: Real-time follow
Currently ClipBlock drag only calls onDragEnd on mouseup - the clip doesn't move during drag.
Fix: Add dragOffset state to ClipBlock. During mousemove, update dragOffset = (clientX - startX). Apply as transform: translateX(dragOffset) on the clip div. Add opacity: 0.7 and box-shadow during drag. On mouseup, call onDragEnd with computed newStartFrame.

## Requirement 2: Time tooltip during drag
During drag, show a floating tooltip above the clip showing: "{newFrame}f / {mm:ss}"
Use a fixed-position div that follows the mouse. Calculate newFrame from dragOffset/pxPerFrame.

## Requirement 3: Frame snapping
Already has Math.round - keep it. Snap to integer frames.

## Requirement 4: Cross-track drag (vertical)
TrackLane needs to detect vertical mouse movement. When user drags a clip vertically past the track boundary, move it to the adjacent same-type track.
Implementation: In TimelineViewer, track dragTargetTrack state. On mousemove during drag, check if mouse Y is outside current track bounds. If so, find adjacent track of same type (video->video, audio->audio). On drop, if targetTrack != originalTrack, call api.updateClip(projectId, clipId, {start_frame: newFrame, track: targetTrackId}). Otherwise call api.updateClipTiming(projectId, clipId, {start_frame: newFrame}).

## Requirement 5: Collision detection
On drag end, before calling API, check if the new position overlaps any other clip on the target track.
Overlap check: newStart < otherEnd && newEnd > otherStart (where end = start + duration).
If overlap: show toast "Cannot drop here - overlaps with {clipName}" and revert (don't call API).

## Requirement 6: Undo support
After successful drag (API call succeeds), push to undoStack:
undoState.push({ type: "timing", clipId, before: { start_frame: origFrame, track: origTrack }, after: { start_frame: newFrame, track: newTrack } })
The existing handleUndo already handles type "timing" entries.

## Requirement 7: Cursor change
On drag start: document.body.style.cursor = "grabbing"
On drag end: document.body.style.cursor = ""
The clip div already has cursor: "grab" in style.

## Verification
Run: npx tsc --noEmit
