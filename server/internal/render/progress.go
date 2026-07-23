package render

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// FPS is the default output framerate
const FPS = 30

// RenderStatus represents the current state of a render job
type RenderStatus string

const (
	StatusPending   RenderStatus = "pending"
	StatusRunning   RenderStatus = "running"
	StatusCompleted RenderStatus = "completed"
	StatusFailed    RenderStatus = "failed"
	StatusCancelled RenderStatus = "cancelled"
)

// RenderJob represents a single render task
type RenderJob struct {
	ID          string       `json:"id"`
	ProjectID   string       `json:"project_id"`
	Status      RenderStatus `json:"status"`
	Progress    int          `json:"progress"` // 0-100
	OutputPath  string       `json:"output_path,omitempty"`
	Error       string       `json:"error,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	StartedAt   *time.Time   `json:"started_at,omitempty"`
	CompletedAt *time.Time   `json:"completed_at,omitempty"`

	cancel context.CancelFunc `json:"-"`
	cmd    *exec.Cmd          `json:"-"`
	mu     sync.RWMutex       `json:"-"`
}

// RenderClip is a timeline item resolved with absolute media path
type RenderClip struct {
	ItemID         string
	Src            string // absolute path to media file
	Kind           string // video / audio / image
	StartFrame     int
	DurationFrames int
	SrcInFrame     int
	Track          string
}

// RenderTransitionInfo links two adjacent clips with a transition effect
type RenderTransitionInfo struct {
	FromItemID     string
	ToItemID       string
	Type           string // dissolve / wipe / fade
	DurationFrames int
}

// TimelineItemLike mirrors store.TimelineItem without importing the parent package
type TimelineItemLike interface {
	GetID() string
	GetSrc() string
	GetKind() string
	GetStartFrame() int
	GetDurationFrames() int
	GetSrcInFrame() int
	GetTrack() string
}

// TransitionLike mirrors store.Transition
type TransitionLike interface {
	GetFromItemID() string
	GetToItemID() string
	GetType() string
	GetDurationFrames() int
}

// TimelineReader is the interface the pipeline needs from the SQLite store
type TimelineReader interface {
	ListTimelineItems(projectID string) ([]TimelineItemLike, error)
	ListTransitions(projectID string) ([]TransitionLike, error)
}

// Pipeline orchestrates: read timeline → generate ffmpeg → execute → produce .mp4
type Pipeline struct {
	Store     TimelineReader
	OutputDir string
	FPS       int
}

// ─── ProgressManager ─────────────────────────────────────────────────────────

// ProgressManager manages active render jobs
type ProgressManager struct {
	jobs     sync.Map // map[string]*RenderJob
	Pipeline *Pipeline
}

// NewProgressManager creates a new ProgressManager
func NewProgressManager(pipeline *Pipeline) *ProgressManager {
	return &ProgressManager{Pipeline: pipeline}
}

// CreateJob creates a new render job
func (pm *ProgressManager) CreateJob(id, projectID string) *RenderJob {
	job := &RenderJob{
		ID:        id,
		ProjectID: projectID,
		Status:    StatusPending,
		Progress:  0,
		CreatedAt: time.Now(),
	}
	pm.jobs.Store(id, job)
	return job
}

// GetJob retrieves a render job by ID
func (pm *ProgressManager) GetJob(id string) (*RenderJob, bool) {
	val, ok := pm.jobs.Load(id)
	if !ok {
		return nil, false
	}
	return val.(*RenderJob), true
}

// ListJobs returns all jobs for a project
func (pm *ProgressManager) ListJobs(projectID string) []*RenderJob {
	var result []*RenderJob
	pm.jobs.Range(func(key, value interface{}) bool {
		job := value.(*RenderJob)
		if job.ProjectID == projectID {
			result = append(result, job)
		}
		return true
	})
	return result
}

// UpdateJob updates a job's status and progress
func (pm *ProgressManager) UpdateJob(id string, status RenderStatus, progress int, outputPath, errMsg string) error {
	job, ok := pm.GetJob(id)
	if !ok {
		return fmt.Errorf("job not found: %s", id)
	}

	job.mu.Lock()
	defer job.mu.Unlock()

	job.Status = status
	job.Progress = progress
	if outputPath != "" {
		job.OutputPath = outputPath
	}
	if errMsg != "" {
		job.Error = errMsg
	}

	now := time.Now()
	if status == StatusRunning && job.StartedAt == nil {
		job.StartedAt = &now
	}
	if status == StatusCompleted || status == StatusFailed || status == StatusCancelled {
		job.CompletedAt = &now
	}

	return nil
}

// CancelJob cancels a running job
func (pm *ProgressManager) CancelJob(id string) error {
	job, ok := pm.GetJob(id)
	if !ok {
		return fmt.Errorf("job not found: %s", id)
	}

	job.mu.Lock()
	defer job.mu.Unlock()

	if job.Status != StatusRunning && job.Status != StatusPending {
		return fmt.Errorf("job cannot be cancelled: status is %s", job.Status)
	}

	if job.cancel != nil {
		job.cancel()
	}

	job.Status = StatusCancelled
	now := time.Now()
	job.CompletedAt = &now

	return nil
}

// CleanupOldJobs removes completed jobs older than the given duration
func (pm *ProgressManager) CleanupOldJobs(olderThan time.Duration) {
	cutoff := time.Now().Add(-olderThan)
	pm.jobs.Range(func(key, value interface{}) bool {
		job := value.(*RenderJob)
		job.mu.RLock()
		isOld := job.CompletedAt != nil && job.CompletedAt.Before(cutoff)
		job.mu.RUnlock()

		if isOld {
			pm.jobs.Delete(key)
		}
		return true
	})
}

// StartRender starts a real ffmpeg render via the Pipeline
func (pm *ProgressManager) StartRender(id string, outputDir string) error {
	job, ok := pm.GetJob(id)
	if !ok {
		return fmt.Errorf("job not found: %s", id)
	}

	job.mu.Lock()
	if job.Status != StatusPending {
		job.mu.Unlock()
		return fmt.Errorf("job already started: status is %s", job.Status)
	}
	job.mu.Unlock()

	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("create output dir: %w", err)
	}

	outputPath := filepath.Join(outputDir, id+".mp4")
	job.mu.Lock()
	job.OutputPath = outputPath
	job.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	job.mu.Lock()
	job.cancel = cancel
	job.mu.Unlock()

	go func() {
		if pm.Pipeline == nil {
			pm.UpdateJob(id, StatusFailed, 0, "", "pipeline not configured")
			return
		}
		// Mark started
		now := time.Now()
		job.mu.Lock()
		job.Status = StatusRunning
		job.StartedAt = &now
		job.mu.Unlock()

		resultPath, err := pm.Pipeline.Execute(ctx, job.ProjectID, job)
		if err != nil {
			if ctx.Err() != nil {
				pm.UpdateJob(id, StatusCancelled, job.Progress, "", "render cancelled")
			} else {
				pm.UpdateJob(id, StatusFailed, job.Progress, "", err.Error())
			}
			return
		}
		pm.UpdateJob(id, StatusCompleted, 100, resultPath, "")
	}()

	return nil
}

// ─── Pipeline Execution ──────────────────────────────────────────────────────

// Execute runs the full render pipeline for a project.
func (p *Pipeline) Execute(ctx context.Context, projectID string, job *RenderJob) (string, error) {
	// Create output directory if it doesn't exist
	if err := os.MkdirAll(p.OutputDir, 0755); err != nil {
		return "", fmt.Errorf("create output dir: %w", err)
	}

	// Read timeline from store
	items, err := p.Store.ListTimelineItems(projectID)
	if err != nil {
		return "", fmt.Errorf("list timeline items: %w", err)
	}

	transitions, err := p.Store.ListTransitions(projectID)
	if err != nil {
		return "", fmt.Errorf("list transitions: %w", err)
	}

	if len(items) == 0 {
		return "", fmt.Errorf("timeline is empty")
	}

	// Convert to RenderClip
	clips := make([]RenderClip, len(items))
	for i, item := range items {
		clips[i] = RenderClip{
			ItemID:         item.GetID(),
			Src:            item.GetSrc(),
			Kind:           item.GetKind(),
			StartFrame:     item.GetStartFrame(),
			DurationFrames: item.GetDurationFrames(),
			SrcInFrame:     item.GetSrcInFrame(),
			Track:          item.GetTrack(),
		}
	}

	// Convert to RenderTransitionInfo
	transInfos := make([]RenderTransitionInfo, len(transitions))
	for i, t := range transitions {
		transInfos[i] = RenderTransitionInfo{
			FromItemID:     t.GetFromItemID(),
			ToItemID:       t.GetToItemID(),
			Type:           t.GetType(),
			DurationFrames: t.GetDurationFrames(),
		}
	}

	// Generate ffmpeg command
	args := p.buildFFmpegCommand(clips, transInfos)

	// Ensure output directory exists
	if err := os.MkdirAll(p.OutputDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create output directory: %w", err)
	}

	// Output path (appended once as the final argument)
	outputPath := filepath.Join(p.OutputDir, fmt.Sprintf("%s_%d.mp4", projectID, time.Now().Unix()))
	args = append(args, outputPath)

	// Execute ffmpeg
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	job.cmd = cmd

	// Capture stderr for progress parsing and error reporting
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("start ffmpeg: %w", err)
	}

	// Calculate total duration from timeline for accurate progress
	totalDuration := p.calculateTotalDuration(clips, transInfos)

	// Parse progress from stderr and collect error output
	var stderrBuf strings.Builder
	go func() {
		tee := io.TeeReader(stderr, &stderrBuf)
		scanner := bufio.NewScanner(tee)
		timePattern := regexp.MustCompile(`time=(\d+):(\d+):(\d+\.\d+)`)
		for scanner.Scan() {
			line := scanner.Text()
			matches := timePattern.FindStringSubmatch(line)
			if len(matches) == 4 {
				hours, _ := strconv.ParseFloat(matches[1], 64)
				minutes, _ := strconv.ParseFloat(matches[2], 64)
				seconds, _ := strconv.ParseFloat(matches[3], 64)
				currentTime := hours*3600 + minutes*60 + seconds
				progress := int((currentTime / totalDuration) * 100)
				if progress > 100 {
					progress = 100
				}
				job.mu.Lock()
				job.Progress = progress
				job.mu.Unlock()
			}
		}
	}()
	// Wait for completion
	if err := cmd.Wait(); err != nil {
		stderrOutput := stderrBuf.String()
		return "", fmt.Errorf("ffmpeg failed: %w\nstderr: %s", err, stderrOutput)
	}

	return outputPath, nil
}

// buildFFmpegCommand generates ffmpeg command arguments (without output file)
// The caller (Execute) is responsible for appending the output path.
func (p *Pipeline) buildFFmpegCommand(clips []RenderClip, transitions []RenderTransitionInfo) []string {
	var args []string

	// Input files
	for _, clip := range clips {
		args = append(args, "-i", clip.Src)
	}

	// Build filter_complex
	filterComplex := p.buildFilterComplex(clips, transitions)
	args = append(args, "-filter_complex", filterComplex)

	// Map the filter output and set codec
	args = append(args, "-map", "[out]")
	args = append(args, "-c:v", "libx264", "-preset", "medium", "-crf", "23")
	args = append(args, "-c:a", "aac", "-b:a", "128k")
	args = append(args, "-movflags", "+faststart")
	args = append(args, "-y") // Overwrite output file

	return args
}

// buildFilterComplex generates ffmpeg filter_complex string
func (p *Pipeline) buildFilterComplex(clips []RenderClip, transitions []RenderTransitionInfo) string {
	if len(clips) == 1 {
		return "[0:v]copy[out]"
	}

	var filters []string
	fps := FPS

	// Trim each clip
	for i, clip := range clips {
		startSec := float64(clip.SrcInFrame) / float64(fps)
		durationSec := float64(clip.DurationFrames) / float64(fps)
		filters = append(filters, fmt.Sprintf("[%d:v]trim=start=%.3f:duration=%.3f,setpts=PTS-STARTPTS[v%d]",
			i, startSec, durationSec, i))
	}

	// Apply transitions or concat
	if len(transitions) == 0 {
		// Simple concat
		var inputs string
		for i := range clips {
			inputs += fmt.Sprintf("[v%d]", i)
		}
		filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=1:a=0[out]", inputs, len(clips)))
	} else {
		// Apply xfade transitions
		prevLabel := "v0"
		for i, trans := range transitions {
			nextLabel := fmt.Sprintf("v%d", i+1)
			outLabel := fmt.Sprintf("xf%d", i)
			if i == len(transitions)-1 {
				outLabel = "out"
			}

			durationSec := float64(trans.DurationFrames) / float64(fps)
			offset := p.calculateOffset(clips[:i+1], transitions[:i], fps)

			filters = append(filters, fmt.Sprintf("[%s][%s]xfade=transition=%s:duration=%.3f:offset=%.3f[%s]",
				prevLabel, nextLabel, trans.Type, durationSec, offset, outLabel))
			prevLabel = outLabel
		}
	}

	return strings.Join(filters, ";")
}

// calculateOffset calculates xfade offset based on clip durations
func (p *Pipeline) calculateOffset(clips []RenderClip, transitions []RenderTransitionInfo, fps int) float64 {
	totalDuration := 0.0
	for _, clip := range clips {
		totalDuration += float64(clip.DurationFrames) / float64(fps)
	}
	for _, trans := range transitions {
		totalDuration -= float64(trans.DurationFrames) / float64(fps)
	}
	return totalDuration
}

// calculateTotalDuration calculates the total output duration in seconds
func (p *Pipeline) calculateTotalDuration(clips []RenderClip, transitions []RenderTransitionInfo) float64 {
	fps := p.FPS
	if fps == 0 {
		fps = FPS
	}
	total := 0.0
	for _, clip := range clips {
		total += float64(clip.DurationFrames) / float64(fps)
	}
	for _, trans := range transitions {
		total -= float64(trans.DurationFrames) / float64(fps)
	}
	if total <= 0 {
		total = 1.0 // fallback to avoid division by zero
	}
	return total
}

// parseProgress parses ffmpeg stderr to extract progress
func (p *Pipeline) parseProgress(stderr io.Reader, job *RenderJob) {
	scanner := bufio.NewScanner(stderr)
	timePattern := regexp.MustCompile(`time=(\d+):(\d+):(\d+\.\d+)`)

	for scanner.Scan() {
		line := scanner.Text()
		matches := timePattern.FindStringSubmatch(line)
		if len(matches) == 4 {
			hours, _ := strconv.ParseFloat(matches[1], 64)
			minutes, _ := strconv.ParseFloat(matches[2], 64)
			seconds, _ := strconv.ParseFloat(matches[3], 64)
			currentTime := hours*3600 + minutes*60 + seconds

			// Estimate total duration (simplified)
			totalDuration := 10.0 // TODO: calculate from timeline

			progress := int((currentTime / totalDuration) * 100)
			if progress > 100 {
				progress = 100
			}

			job.mu.Lock()
			job.Progress = progress
			job.mu.Unlock()
		}
	}
}
