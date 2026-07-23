package honcutserver

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

// TestBatchA_StoreMethods verifies the 5 new Store methods
func TestBatchA_StoreMethods(t *testing.T) {
	store := setupTestDB(t)
	defer store.Close()

	// Create a project
	pid := uuid.New().String()
	_, err := store.Create(pid, "BatchA Test", "test")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	// Create assets
	for i := 0; i < 3; i++ {
		store.CreateAsset(&MediaAsset{
			ID: uuid.New().String(), ProjectID: pid,
			Name: "asset", Kind: "video", Src: "/test", DurationFrames: 100,
		})
	}

	// CountAssets
	n, err := store.CountAssets(pid)
	if err != nil {
		t.Fatalf("CountAssets: %v", err)
	}
	if n != 3 {
		t.Fatalf("CountAssets: want 3, got %d", n)
	}

	// Create timeline items on V1 and V2
	items := []*TimelineItem{
		{ID: uuid.New().String(), ProjectID: pid, Name: "c1", Kind: "video", Track: "V1", StartFrame: 0, DurationFrames: 100, SrcInFrame: 0, Props: "{}"},
		{ID: uuid.New().String(), ProjectID: pid, Name: "c2", Kind: "video", Track: "V1", StartFrame: 100, DurationFrames: 50, SrcInFrame: 0, Props: "{}"},
		{ID: uuid.New().String(), ProjectID: pid, Name: "c3", Kind: "video", Track: "V2", StartFrame: 0, DurationFrames: 80, SrcInFrame: 0, Props: "{}"},
	}
	for _, it := range items {
		if err := store.CreateTimelineItem(it); err != nil {
			t.Fatalf("create item: %v", err)
		}
	}

	// CountTimelineItems
	n, err = store.CountTimelineItems(pid)
	if err != nil {
		t.Fatalf("CountTimelineItems: %v", err)
	}
	if n != 3 {
		t.Fatalf("CountTimelineItems: want 3, got %d", n)
	}

	// ListTimelineItemsByTrack
	v1Items, err := store.ListTimelineItemsByTrack(pid, "V1")
	if err != nil {
		t.Fatalf("ListTimelineItemsByTrack: %v", err)
	}
	if len(v1Items) != 2 {
		t.Fatalf("V1 items: want 2, got %d", len(v1Items))
	}

	// UpdateTimelineItemProps
	err = store.UpdateTimelineItemProps(items[0].ID, `{"fadeIn":1.5}`)
	if err != nil {
		t.Fatalf("UpdateTimelineItemProps: %v", err)
	}
	got, _ := store.GetTimelineItem(items[0].ID)
	if got.Props != `{"fadeIn":1.5}` {
		t.Fatalf("props: want {\"fadeIn\":1.5}, got %s", got.Props)
	}

	// DeleteAllTimelineItems
	deleted, err := store.DeleteAllTimelineItems(pid)
	if err != nil {
		t.Fatalf("DeleteAllTimelineItems: %v", err)
	}
	if deleted != 3 {
		t.Fatalf("DeleteAllTimelineItems: want 3, got %d", deleted)
	}
	n, _ = store.CountTimelineItems(pid)
	if n != 0 {
		t.Fatalf("after clear: want 0 items, got %d", n)
	}
}

// TestBatchA_MCPTools verifies the 10 new MCP tool handlers
func TestBatchA_MCPTools(t *testing.T) {
	store := setupTestDB(t)
	defer store.Close()
	mcp := NewMCPServer(store, nil)

	// 1. list_projects (empty)
	res, err := mcp.ExecuteTool("list_projects", map[string]interface{}{})
	if err != nil {
		t.Fatalf("list_projects: %v", err)
	}
	m := res.(map[string]interface{})
	if !m["success"].(bool) {
		t.Fatal("list_projects: not success")
	}

	// 2. create_project
	res, err = mcp.ExecuteTool("create_project", map[string]interface{}{
		"name": "Test Project", "description": "desc",
	})
	if err != nil {
		t.Fatalf("create_project: %v", err)
	}
	m = res.(map[string]interface{})
	pid := m["project"].(*Project).ID

	// 3. read_project
	res, err = mcp.ExecuteTool("read_project", map[string]interface{}{"project_id": pid})
	if err != nil {
		t.Fatalf("read_project: %v", err)
	}
	m = res.(map[string]interface{})
	if m["asset_count"].(int) != 0 || m["clip_count"].(int) != 0 {
		t.Fatalf("read_project: counts wrong")
	}

	// Add clips for testing
	assetID := uuid.New().String()
	store.CreateAsset(&MediaAsset{
		ID: assetID, ProjectID: pid, Name: "vid", Kind: "video", Src: "/v", DurationFrames: 200,
	})

	// add_clip to get an item
	res, err = mcp.ExecuteTool("add_clip", map[string]interface{}{
		"project_id": pid, "asset_id": assetID, "track": "V1",
		"start_frame": float64(0), "duration_frames": float64(100),
	})
	if err != nil {
		t.Fatalf("add_clip: %v", err)
	}
	itemID := res.(map[string]interface{})["item"].(*TimelineItem).ID

	// 4. split_item
	res, err = mcp.ExecuteTool("split_item", map[string]interface{}{
		"item_id": itemID, "at_frame": float64(40),
	})
	if err != nil {
		t.Fatalf("split_item: %v", err)
	}
	m = res.(map[string]interface{})
	splitID := m["split_id"].(string)
	if splitID == "" {
		t.Fatal("split_item: no split_id")
	}
	// Verify original is now 40 frames
	orig, _ := store.GetTimelineItem(itemID)
	if orig.DurationFrames != 40 {
		t.Fatalf("split: original duration want 40, got %d", orig.DurationFrames)
	}
	// Verify split is 60 frames starting at 40
	split, _ := store.GetTimelineItem(splitID)
	if split.DurationFrames != 60 || split.StartFrame != 40 {
		t.Fatalf("split: second half wrong: dur=%d start=%d", split.DurationFrames, split.StartFrame)
	}

	// 5. duplicate_item
	res, err = mcp.ExecuteTool("duplicate_item", map[string]interface{}{"item_id": itemID})
	if err != nil {
		t.Fatalf("duplicate_item: %v", err)
	}
	m = res.(map[string]interface{})
	dupID := m["duplicate_id"].(string)
	if dupID == "" {
		t.Fatal("duplicate_item: no duplicate_id")
	}

	// 6. move_item
	res, err = mcp.ExecuteTool("move_item", map[string]interface{}{
		"item_id": dupID, "track": "V2", "start_frame": float64(200),
	})
	if err != nil {
		t.Fatalf("move_item: %v", err)
	}
	moved, _ := store.GetTimelineItem(dupID)
	if moved.Track != "V2" || moved.StartFrame != 200 {
		t.Fatalf("move_item: track=%s start=%d", moved.Track, moved.StartFrame)
	}

	// 7. update_item_props
	propsMap := map[string]interface{}{"text": "hello", "color": "#fff"}
	res, err = mcp.ExecuteTool("update_item_props", map[string]interface{}{
		"item_id": dupID, "props": propsMap,
	})
	if err != nil {
		t.Fatalf("update_item_props: %v", err)
	}
	updated, _ := store.GetTimelineItem(dupID)
	var parsed map[string]interface{}
	json.Unmarshal([]byte(updated.Props), &parsed)
	if parsed["text"] != "hello" {
		t.Fatalf("update_item_props: props not set: %s", updated.Props)
	}

	// 8. set_item_timing
	res, err = mcp.ExecuteTool("set_item_timing", map[string]interface{}{
		"item_id": dupID, "duration_frames": float64(30),
		"fade_in_seconds": float64(1.5), "fade_out_seconds": float64(0.5),
	})
	if err != nil {
		t.Fatalf("set_item_timing: %v", err)
	}
	timed, _ := store.GetTimelineItem(dupID)
	if timed.DurationFrames != 30 {
		t.Fatalf("set_item_timing: duration want 30, got %d", timed.DurationFrames)
	}
	json.Unmarshal([]byte(timed.Props), &parsed)
	if parsed["fadeIn"] != 1.5 || parsed["fadeOut"] != 0.5 {
		t.Fatalf("set_item_timing: fades not set: %s", timed.Props)
	}

	// 9. remove_item with ripple
	// Add two more clips on V1 to test ripple
	store.CreateTimelineItem(&TimelineItem{
		ID: uuid.New().String(), ProjectID: pid, Name: "a", Kind: "video",
		Track: "V1", StartFrame: 0, DurationFrames: 50, SrcInFrame: 0, Props: "{}",
	})
	rippleID := uuid.New().String()
	store.CreateTimelineItem(&TimelineItem{
		ID: rippleID, ProjectID: pid, Name: "b", Kind: "video",
		Track: "V1", StartFrame: 50, DurationFrames: 50, SrcInFrame: 0, Props: "{}",
	})
	afterID := uuid.New().String()
	store.CreateTimelineItem(&TimelineItem{
		ID: afterID, ProjectID: pid, Name: "c", Kind: "video",
		Track: "V1", StartFrame: 100, DurationFrames: 50, SrcInFrame: 0, Props: "{}",
	})

	res, err = mcp.ExecuteTool("remove_item", map[string]interface{}{
		"item_id": rippleID, "ripple": true,
	})
	if err != nil {
		t.Fatalf("remove_item: %v", err)
	}
	// "c" should have shifted from 100 to 50
	after, _ := store.GetTimelineItem(afterID)
	if after.StartFrame != 50 {
		t.Fatalf("ripple: after item start want 50, got %d", after.StartFrame)
	}

	// 10. clear_timeline
	res, err = mcp.ExecuteTool("clear_timeline", map[string]interface{}{"project_id": pid})
	if err != nil {
		t.Fatalf("clear_timeline: %v", err)
	}
	m = res.(map[string]interface{})
	if m["deleted_count"].(int) == 0 {
		t.Fatal("clear_timeline: deleted 0 items")
	}
	n, _ := store.CountTimelineItems(pid)
	if n != 0 {
		t.Fatalf("clear_timeline: items remain: %d", n)
	}

	t.Logf("✓ All 10 Batch A MCP tools verified")
}
