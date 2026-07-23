package render

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// MockStore implements TimelineReader for testing
type MockStore struct {
	items       []TimelineItemLike
	transitions []TransitionLike
}

func (m *MockStore) ListTimelineItems(projectID string) ([]TimelineItemLike, error) {
	return m.items, nil
}

func (m *MockStore) ListTransitions(projectID string) ([]TransitionLike, error) {
	return m.transitions, nil
}

// MockTimelineItem implements TimelineItemLike
type MockTimelineItem struct {
	ID             string
	Src            string
	Kind           string
	StartFrame     int
	DurationFrames int
	SrcInFrame     int
	Track          string
}

func (m *MockTimelineItem) GetID() string             { return m.ID }
func (m *MockTimelineItem) GetSrc() string            { return m.Src }
func (m *MockTimelineItem) GetKind() string           { return m.Kind }
func (m *MockTimelineItem) GetStartFrame() int        { return m.StartFrame }
func (m *MockTimelineItem) GetDurationFrames() int    { return m.DurationFrames }
func (m *MockTimelineItem) GetSrcInFrame() int        { return m.SrcInFrame }
func (m *MockTimelineItem) GetTrack() string          { return m.Track }

// MockTransition implements TransitionLike
type MockTransition struct {
	FromItemID     string
	ToItemID       string
	Type           string
	DurationFrames int
}

func (m *MockTransition) GetFromItemID() string     { return m.FromItemID }
func (m *MockTransition) GetToItemID() string       { return m.ToItemID }
func (m *MockTransition) GetType() string           { return m.Type }
func (m *MockTransition) GetDurationFrames() int    { return m.DurationFrames }

func TestPipeline_Execute_SingleClip(t *testing.T) {
	// Skip if ffmpeg not available
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not found in PATH")
	}

	tmpDir := t.TempDir()
	outputDir := filepath.Join(tmpDir, "output")

	// Create a test video using ffmpeg
	testVideo := filepath.Join(tmpDir, "test.mp4")
	cmd := exec.Command("ffmpeg", "-f", "lavfi", "-i", "color=c=red:s=320x240:d=2",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", testVideo)
	if err := cmd.Run(); err != nil {
		t.Fatalf("failed to create test video: %v", err)
	}

	// Setup mock store with one clip
	store := &MockStore{
		items: []TimelineItemLike{
			&MockTimelineItem{
				ID:             "item1",
				Src:            testVideo,
				Kind:           "video",
				StartFrame:     0,
				DurationFrames: 60, // 2 seconds at 30fps
				SrcInFrame:     0,
				Track:          "V1",
			},
		},
		transitions: []TransitionLike{},
	}

	pipeline := &Pipeline{
		Store:     store,
		OutputDir: outputDir,
		FPS:       30,
	}

	job := &RenderJob{
		ID:        "test-job-1",
		ProjectID: "proj-1",
		Status:    StatusPending,
	}

	ctx := context.Background()
	outputPath, err := pipeline.Execute(ctx, "proj-1", job)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	// Verify output file exists
	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Errorf("output file not created: %s", outputPath)
	}

	t.Logf("✓ Single clip render successful: %s", outputPath)
}

func TestPipeline_Execute_TwoClipsConcat(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not found in PATH")
	}

	tmpDir := t.TempDir()
	outputDir := filepath.Join(tmpDir, "output")

	// Create two test videos
	video1 := filepath.Join(tmpDir, "video1.mp4")
	video2 := filepath.Join(tmpDir, "video2.mp4")

	for i, v := range []string{video1, video2} {
		color := "red"
		if i == 1 {
			color = "blue"
		}
		cmd := exec.Command("ffmpeg", "-f", "lavfi", "-i", "color=c="+color+":s=320x240:d=1",
			"-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", v)
		if err := cmd.Run(); err != nil {
			t.Fatalf("failed to create test video %d: %v", i+1, err)
		}
	}

	store := &MockStore{
		items: []TimelineItemLike{
			&MockTimelineItem{
				ID:             "item1",
				Src:            video1,
				Kind:           "video",
				StartFrame:     0,
				DurationFrames: 30,
				SrcInFrame:     0,
				Track:          "V1",
			},
			&MockTimelineItem{
				ID:             "item2",
				Src:            video2,
				Kind:           "video",
				StartFrame:     30,
				DurationFrames: 30,
				SrcInFrame:     0,
				Track:          "V1",
			},
		},
		transitions: []TransitionLike{},
	}

	pipeline := &Pipeline{
		Store:     store,
		OutputDir: outputDir,
		FPS:       30,
	}

	job := &RenderJob{
		ID:        "test-job-2",
		ProjectID: "proj-2",
		Status:    StatusPending,
	}

	ctx := context.Background()
	outputPath, err := pipeline.Execute(ctx, "proj-2", job)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Errorf("output file not created: %s", outputPath)
	}

	t.Logf("✓ Two clips concat successful: %s", outputPath)
}

func TestPipeline_Execute_WithTransition(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not found in PATH")
	}

	tmpDir := t.TempDir()
	outputDir := filepath.Join(tmpDir, "output")

	video1 := filepath.Join(tmpDir, "video1.mp4")
	video2 := filepath.Join(tmpDir, "video2.mp4")

	for i, v := range []string{video1, video2} {
		color := "green"
		if i == 1 {
			color = "yellow"
		}
		cmd := exec.Command("ffmpeg", "-f", "lavfi", "-i", "color=c="+color+":s=320x240:d=2",
			"-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", v)
		if err := cmd.Run(); err != nil {
			t.Fatalf("failed to create test video %d: %v", i+1, err)
		}
	}

	store := &MockStore{
		items: []TimelineItemLike{
			&MockTimelineItem{
				ID:             "item1",
				Src:            video1,
				Kind:           "video",
				StartFrame:     0,
				DurationFrames: 60,
				SrcInFrame:     0,
				Track:          "V1",
			},
			&MockTimelineItem{
				ID:             "item2",
				Src:            video2,
				Kind:           "video",
				StartFrame:     60,
				DurationFrames: 60,
				SrcInFrame:     0,
				Track:          "V1",
			},
		},
		transitions: []TransitionLike{
			&MockTransition{
				FromItemID:     "item1",
				ToItemID:       "item2",
				Type:           "dissolve",
				DurationFrames: 15,
			},
		},
	}

	pipeline := &Pipeline{
		Store:     store,
		OutputDir: outputDir,
		FPS:       30,
	}

	job := &RenderJob{
		ID:        "test-job-3",
		ProjectID: "proj-3",
		Status:    StatusPending,
	}

	ctx := context.Background()
	outputPath, err := pipeline.Execute(ctx, "proj-3", job)
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Errorf("output file not created: %s", outputPath)
	}

	t.Logf("✓ Transition render successful: %s", outputPath)
}

func TestPipeline_Execute_EmptyTimeline(t *testing.T) {
	store := &MockStore{
		items:       []TimelineItemLike{},
		transitions: []TransitionLike{},
	}

	pipeline := &Pipeline{
		Store:     store,
		OutputDir: t.TempDir(),
		FPS:       30,
	}

	job := &RenderJob{
		ID:        "test-job-empty",
		ProjectID: "proj-empty",
		Status:    StatusPending,
	}

	ctx := context.Background()
	_, err := pipeline.Execute(ctx, "proj-empty", job)
	if err == nil {
		t.Error("expected error for empty timeline, got nil")
	}

	t.Logf("✓ Empty timeline correctly rejected: %v", err)
}

func TestProgressManager_StartRender(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not found in PATH")
	}

	tmpDir := t.TempDir()
	outputDir := filepath.Join(tmpDir, "output")

	testVideo := filepath.Join(tmpDir, "test.mp4")
	cmd := exec.Command("ffmpeg", "-f", "lavfi", "-i", "color=c=purple:s=320x240:d=1",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", testVideo)
	if err := cmd.Run(); err != nil {
		t.Fatalf("failed to create test video: %v", err)
	}

	store := &MockStore{
		items: []TimelineItemLike{
			&MockTimelineItem{
				ID:             "item1",
				Src:            testVideo,
				Kind:           "video",
				StartFrame:     0,
				DurationFrames: 30,
				SrcInFrame:     0,
				Track:          "V1",
			},
		},
		transitions: []TransitionLike{},
	}

	pipeline := &Pipeline{
		Store:     store,
		OutputDir: outputDir,
		FPS:       30,
	}

	pm := NewProgressManager(pipeline)
	pm.CreateJob("pm-test-1", "proj-pm")

	if err := pm.StartRender("pm-test-1", outputDir); err != nil {
		t.Fatalf("StartRender failed: %v", err)
	}

	// Wait for completion (with timeout)
	timeout := time.After(10 * time.Second)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			t.Fatal("render did not complete within 10 seconds")
		case <-ticker.C:
			j, ok := pm.GetJob("pm-test-1")
			if !ok {
				t.Fatal("job not found")
			}
			if j.Status == StatusCompleted {
				t.Logf("✓ ProgressManager render completed: %s", j.OutputPath)
				return
			}
			if j.Status == StatusFailed {
				t.Fatalf("render failed: %s", j.Error)
			}
		}
	}
}
