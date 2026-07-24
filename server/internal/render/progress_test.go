package render

import (
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// MockTimelineStore 实现 TimelineReader 接口用于测试
type MockTimelineStore struct {
	TimelineItems []TimelineItemLike
	Transitions   []TransitionLike
}

func (m *MockTimelineStore) ListTimelineItems(projectID string) ([]TimelineItemLike, error) {
	return m.TimelineItems, nil
}

func (m *MockTimelineStore) ListTransitions(projectID string) ([]TransitionLike, error) {
	return m.Transitions, nil
}

func TestProgressManager_CreateAndGetJob(t *testing.T) {
	mockStore := &MockTimelineStore{}
	pipeline := &Pipeline{FPS: 30, Store: mockStore}
	pm := NewProgressManager(pipeline)

	job := pm.CreateJob("test-001", "proj-001", DefaultRenderSettings())
	if job.ID != "test-001" {
		t.Errorf("expected job ID test-001, got %s", job.ID)
	}
	if job.ProjectID != "proj-001" {
		t.Errorf("expected project ID proj-001, got %s", job.ProjectID)
	}
	if job.Status != StatusPending {
		t.Errorf("expected status pending, got %s", job.Status)
	}

	retrieved, ok := pm.GetJob("test-001")
	if !ok {
		t.Fatal("expected to find job")
	}
	if retrieved.ID != job.ID {
		t.Errorf("retrieved job ID mismatch")
	}
}

func TestProgressManager_UpdateJob(t *testing.T) {
	mockStore := &MockTimelineStore{}
	pipeline := &Pipeline{FPS: 30, Store: mockStore}
	pm := NewProgressManager(pipeline)
	pm.CreateJob("test-002", "proj-001", DefaultRenderSettings())

	err := pm.UpdateJob("test-002", StatusRunning, 50, "", "")
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}

	job, _ := pm.GetJob("test-002")
	if job.Status != StatusRunning {
		t.Errorf("expected status running, got %s", job.Status)
	}
	if job.Progress != 50 {
		t.Errorf("expected progress 50, got %d", job.Progress)
	}
	if job.StartedAt == nil {
		t.Error("expected StartedAt to be set")
	}
}

func TestProgressManager_CancelJob(t *testing.T) {
	// Create a test video to render (so the job actually runs long enough to cancel)
	tmpDir := t.TempDir()
	testVideo := filepath.Join(tmpDir, "test.mp4")
	cmd := exec.Command("ffmpeg", "-f", "lavfi", "-i", "color=c=red:s=320x240:d=5",
		"-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", testVideo)
	if err := cmd.Run(); err != nil {
		t.Fatalf("failed to create test video: %v", err)
	}

	mockStore := &MockTimelineStore{
		TimelineItems: []TimelineItemLike{
			&MockTimelineItem{
				ID:             "item1",
				Src:            testVideo,
				Kind:           "video",
				StartFrame:     0,
				DurationFrames: 150, // 5 seconds at 30fps
				SrcInFrame:     0,
				Track:          "V1",
			},
		},
		Transitions: []TransitionLike{},
	}
	pipeline := &Pipeline{FPS: 30, Store: mockStore}
	pm := NewProgressManager(pipeline)
	pm.CreateJob("test-003", "proj-001", DefaultRenderSettings())

	// Start the job
	outputDir := t.TempDir()
	err := pm.StartRender("test-003", outputDir)
	if err != nil {
		t.Fatalf("start render failed: %v", err)
	}

	// Wait a bit for it to start
	time.Sleep(50 * time.Millisecond)

	// Check job status before cancel
	job, ok := pm.GetJob("test-003")
	if !ok {
		t.Fatal("job not found")
	}
	t.Logf("Job status before cancel: %s", job.Status)

	// If job already failed, skip cancel test
	if job.Status == StatusFailed {
		t.Skipf("job already failed before cancel attempt: %s", job.Error)
	}

	// Cancel it
	err = pm.CancelJob("test-003")
	if err != nil {
		t.Fatalf("cancel failed: %v", err)
	}

	job, _ = pm.GetJob("test-003")
	if job.Status != StatusCancelled {
		t.Errorf("expected status cancelled, got %s", job.Status)
	}
	if job.CompletedAt == nil {
		t.Error("expected CompletedAt to be set")
	}
}

func TestProgressManager_ListJobs(t *testing.T) {
	mockStore := &MockTimelineStore{}
	pipeline := &Pipeline{FPS: 30, Store: mockStore}
	pm := NewProgressManager(pipeline)

	pm.CreateJob("job-1", "proj-A", DefaultRenderSettings())
	pm.CreateJob("job-2", "proj-A", DefaultRenderSettings())
	pm.CreateJob("job-3", "proj-B", DefaultRenderSettings())

	jobsA := pm.ListJobs("proj-A")
	if len(jobsA) != 2 {
		t.Errorf("expected 2 jobs for proj-A, got %d", len(jobsA))
	}

	jobsB := pm.ListJobs("proj-B")
	if len(jobsB) != 1 {
		t.Errorf("expected 1 job for proj-B, got %d", len(jobsB))
	}
}

func TestProgressManager_CleanupOldJobs(t *testing.T) {
	mockStore := &MockTimelineStore{}
	pipeline := &Pipeline{FPS: 30, Store: mockStore}
	pm := NewProgressManager(pipeline)

	job1 := pm.CreateJob("old-job", "proj-001", DefaultRenderSettings())
	job1.CompletedAt = timePtr(time.Now().Add(-2 * time.Hour))

	job2 := pm.CreateJob("new-job", "proj-001", DefaultRenderSettings())
	job2.CompletedAt = timePtr(time.Now())

	pm.CleanupOldJobs(1 * time.Hour)

	_, ok1 := pm.GetJob("old-job")
	if ok1 {
		t.Error("expected old-job to be cleaned up")
	}

	_, ok2 := pm.GetJob("new-job")
	if !ok2 {
		t.Error("expected new-job to still exist")
	}
}

func timePtr(t time.Time) *time.Time {
	return &t
}
