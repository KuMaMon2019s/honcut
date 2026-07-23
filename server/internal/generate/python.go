package generate

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
)

// PythonTool wraps OpenMontage Python tools as subprocess calls
type PythonTool struct {
	ToolsDir string // path to honcut/tools/
	Python   string // python3 path (default "python3")
}

// NewPythonTool creates a Python tool runner
func NewPythonTool() *PythonTool {
	dir := os.Getenv("HONCUT_TOOLS_DIR")
	if dir == "" {
		dir = ".." // relative to server/ → honcut/
	}
	return &PythonTool{
		ToolsDir: dir,
		Python:   "python3",
	}
}

// VideoAnalyze extracts frames + generates descriptions via LLM
func (pt *PythonTool) VideoAnalyze(videoPath string) (map[string]interface{}, error) {
	script := fmt.Sprintf("%s/tools/analysis/video_understand.py", pt.ToolsDir)
	cmd := exec.Command(pt.Python, script, "--input", videoPath)
	cmd.Env = append(os.Environ(), "PYTHONPATH="+pt.ToolsDir)
	out, err := cmd.CombinedOutput()
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			return nil, fmt.Errorf("video_understand: %w (stderr: %s)", err, string(ee.Stderr))
		}
		return nil, fmt.Errorf("video_understand: %w", err)
	}
	var result map[string]interface{}
	if err := json.Unmarshal(out, &result); err != nil {
		return nil, fmt.Errorf("video_understand: parse output: %w", err)
	}
	return result, nil
}

// SeedanceVideo calls seedance_ark.py for text-to-video
func (pt *PythonTool) SeedanceVideo(prompt, variant, outputPath string, duration int, ratio string) (string, error) {
	script := fmt.Sprintf("%s/tools/generate/seedance_ark.py", pt.ToolsDir)
	args := []string{script, "--prompt", prompt, "--variant", variant,
		"--duration", fmt.Sprintf("%d", duration), "--output", outputPath}
	if ratio != "" {
		args = append(args, "--ratio", ratio)
	}
	cmd := exec.Command(pt.Python, args...)
	cmd.Env = append(os.Environ(), "PYTHONPATH="+pt.ToolsDir)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("seedance_ark: %w (output: %s)", err, string(out))
	}
	return string(out), nil
}

// SeedreamImage calls seedream_ark.py for text-to-image
func (pt *PythonTool) SeedreamImage(prompt, outputPath, size string) (string, error) {
	script := fmt.Sprintf("%s/tools/generate/seedream_ark.py", pt.ToolsDir)
	args := []string{script, "--prompt", prompt, "--output", outputPath}
	if size != "" {
		args = append(args, "--size", size)
	}
	cmd := exec.Command(pt.Python, args...)
	cmd.Env = append(os.Environ(), "PYTHONPATH="+pt.ToolsDir)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("seedream_ark: %w (output: %s)", err, string(out))
	}
	return string(out), nil
}
