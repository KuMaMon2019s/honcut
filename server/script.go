package honcutserver

import (
	"fmt"
	"strconv"
	"strings"
)

// GenerateScript converts timeline items to markdown script format.
// Format:
// # Timeline Script
//
// ## Track: V1
// - [0-120] Clip Name (video)
// - [120-240] Another Clip (image)
//
// ## Track: A1
// - [0-300] Audio Track (audio)
func GenerateScript(items []*TimelineItem) string {
	if len(items) == 0 {
		return "# Timeline Script\n\n*Empty timeline*\n"
	}

	// Group items by track
	trackMap := make(map[string][]*TimelineItem)
	for _, item := range items {
		trackMap[item.Track] = append(trackMap[item.Track], item)
	}

	var sb strings.Builder
	sb.WriteString("# Timeline Script\n\n")

	// Sort tracks for consistent output
	tracks := make([]string, 0, len(trackMap))
	for track := range trackMap {
		tracks = append(tracks, track)
	}
	// Simple sort: video tracks first (V1, V2...), then audio (A1, A2...)
	for i := 0; i < len(tracks); i++ {
		for j := i + 1; j < len(tracks); j++ {
			if tracks[i] > tracks[j] {
				tracks[i], tracks[j] = tracks[j], tracks[i]
			}
		}
	}

	for _, track := range tracks {
		items := trackMap[track]
		sb.WriteString(fmt.Sprintf("## Track: %s\n\n", track))

		for _, item := range items {
			endFrame := item.StartFrame + item.DurationFrames
			sb.WriteString(fmt.Sprintf("- [%d-%d] %s (%s)\n",
				item.StartFrame, endFrame, item.Name, item.Kind))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// ScriptAction represents an operation parsed from a script
type ScriptAction struct {
	Type      string // "create" or "update"
	Track     string
	Name      string
	Kind      string
	StartFrame int
	DurationFrames int
	ItemID    string // for updates
}

// ParseScript parses a markdown script and returns actions to apply.
// It detects creates (new items) and updates (existing items by ID).
func ParseScript(script string) ([]ScriptAction, error) {
	var actions []ScriptAction
	var currentTrack string

	lines := strings.Split(script, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Track header: ## Track: V1
		if strings.HasPrefix(line, "## Track:") {
			currentTrack = strings.TrimSpace(strings.TrimPrefix(line, "## Track:"))
			continue
		}

		// Timeline item: - [0-120] Clip Name (video)
		// or with ID: - [0-120] Clip Name (video) [id:abc123]
		if strings.HasPrefix(line, "- [") && currentTrack != "" {
			action, err := parseTimelineLine(line, currentTrack)
			if err != nil {
				return nil, fmt.Errorf("parse line %q: %w", line, err)
			}
			actions = append(actions, action)
		}
	}

	return actions, nil
}

// parseTimelineLine parses a single timeline line like:
// - [0-120] Clip Name (video)
// - [0-120] Clip Name (video) [id:abc123]
func parseTimelineLine(line, track string) (ScriptAction, error) {
	// Remove leading "- "
	line = strings.TrimPrefix(line, "- ")

	// Extract frame range: [0-120]
	if !strings.HasPrefix(line, "[") {
		return ScriptAction{}, fmt.Errorf("expected [start-end] format")
	}

	closeBracket := strings.Index(line, "]")
	if closeBracket == -1 {
		return ScriptAction{}, fmt.Errorf("missing closing bracket")
	}

	frameRange := line[1:closeBracket]
	line = strings.TrimSpace(line[closeBracket+1:])

	// Parse frame range: "0-120"
	parts := strings.Split(frameRange, "-")
	if len(parts) != 2 {
		return ScriptAction{}, fmt.Errorf("invalid frame range: %s", frameRange)
	}

	startFrame, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil {
		return ScriptAction{}, fmt.Errorf("invalid start frame: %w", err)
	}

	endFrame, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil {
		return ScriptAction{}, fmt.Errorf("invalid end frame: %w", err)
	}

	durationFrames := endFrame - startFrame
	if durationFrames <= 0 {
		return ScriptAction{}, fmt.Errorf("invalid duration: %d", durationFrames)
	}

	// Extract name and kind: "Clip Name (video)"
	// or with ID: "Clip Name (video) [id:abc123]"
	var itemID string
	if idx := strings.LastIndex(line, "[id:"); idx != -1 {
		// Has ID
		idPart := line[idx:]
		line = strings.TrimSpace(line[:idx])

		// Extract ID: [id:abc123]
		if strings.HasPrefix(idPart, "[id:") && strings.HasSuffix(idPart, "]") {
			itemID = idPart[4 : len(idPart)-1]
		}
	}

	// Extract kind from parentheses: "Clip Name (video)"
	var name, kind string
	if idx := strings.LastIndex(line, "("); idx != -1 && strings.HasSuffix(line, ")") {
		name = strings.TrimSpace(line[:idx])
		kind = strings.TrimSpace(line[idx+1 : len(line)-1])
	} else {
		name = line
		kind = "video" // default
	}

	action := ScriptAction{
		Track:          track,
		Name:           name,
		Kind:           kind,
		StartFrame:     startFrame,
		DurationFrames: durationFrames,
	}

	if itemID != "" {
		action.Type = "update"
		action.ItemID = itemID
	} else {
		action.Type = "create"
	}

	return action, nil
}
