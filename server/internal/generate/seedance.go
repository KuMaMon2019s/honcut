package generate

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// Seedance generates videos via Ark Agent Plan (doubao-seedance-2.0)
type Seedance struct {
	client *ArkClient
}

var seedanceModels = map[string]string{
	"standard": "doubao-seedance-2.0",
	"fast":     "doubao-seedance-2.0-fast",
	"mini":     "doubao-seedance-2.0-mini",
}

// SeedanceInput for video generation requests
type SeedanceInput struct {
	Prompt        string `json:"prompt"`
	Variant       string `json:"variant,omitempty"`      // standard | fast | mini
	Duration      int    `json:"duration,omitempty"`     // 3-15 seconds
	AspectRatio   string `json:"aspect_ratio,omitempty"` // 16:9 | 9:16 | 1:1
	Resolution    string `json:"resolution,omitempty"`   // 480P | 720P | 1080P
	GenerateAudio bool   `json:"generate_audio,omitempty"`
	OutputPath    string `json:"output_path,omitempty"`
}

func NewSeedance(client *ArkClient) *Seedance {
	return &Seedance{client: client}
}

// Generate creates a video using doubao-seedance-2.0
func (s *Seedance) Generate(ctx context.Context, input SeedanceInput) GenerationResult {
	start := time.Now()
	model := seedanceModels["fast"]
	if m, ok := seedanceModels[input.Variant]; ok {
		model = m
	}
	if input.Duration == 0 {
		input.Duration = 5
	}
	if input.AspectRatio == "" {
		input.AspectRatio = "16:9"
	}
	if input.Resolution == "" {
		input.Resolution = "720P"
	}
	if input.OutputPath == "" {
		input.OutputPath = "seedance_output.mp4"
	}

	body := map[string]interface{}{
		"model": model,
		"content": []map[string]interface{}{
			{"type": "text", "text": input.Prompt},
		},
		"parameters": map[string]interface{}{
			"duration":   input.Duration,
			"ratio":      input.AspectRatio,
			"resolution": input.Resolution,
		},
		"generate_audio": input.GenerateAudio,
	}

	// Submit
	resp, err := s.client.post(ctx, "/contents/generations/tasks", body)
	if err != nil {
		return GenerationResult{Success: false, Model: model, Error: err.Error()}
	}
	data, err := readBody(resp)
	if err != nil {
		return GenerationResult{Success: false, Model: model, Error: "read submit response: " + err.Error()}
	}
	if resp.StatusCode != 200 {
		return GenerationResult{Success: false, Model: model, Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(data))}
	}

	var submit struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &submit); err != nil {
		return GenerationResult{Success: false, Model: model, Error: "parse submit response: " + err.Error()}
	}
	if submit.ID == "" {
		return GenerationResult{Success: false, Model: model, Error: "no task_id in response"}
	}

	// Poll with ctx awareness
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for i := 0; i < 300; i++ {
		select {
		case <-ctx.Done():
			return GenerationResult{Success: false, Model: model, Error: "cancelled: " + ctx.Err().Error()}
		case <-ticker.C:
		}

		resp, err := s.client.get(ctx, "/contents/generations/tasks/"+submit.ID)
		if err != nil {
			if ctx.Err() != nil {
				return GenerationResult{Success: false, Model: model, Error: "cancelled: " + ctx.Err().Error()}
			}
			continue
		}
		pd, err := readBody(resp)
		if err != nil {
			continue
		}
		var poll struct {
			Status  string `json:"status"`
			Content struct {
				VideoURL string `json:"video_url"`
			} `json:"content"`
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(pd, &poll); err != nil {
			continue
		}

		switch poll.Status {
		case "succeeded":
			if poll.Content.VideoURL == "" {
				return GenerationResult{Success: false, Model: model, Error: "no video_url in response"}
			}
			if err := s.client.download(ctx, poll.Content.VideoURL, input.OutputPath); err != nil {
				return GenerationResult{Success: false, Model: model, Error: "download failed: " + err.Error()}
			}
			return GenerationResult{
				Success:  true,
				Model:    model,
				Output:   input.OutputPath,
				Format:   "mp4",
				Duration: time.Since(start).Seconds(),
			}
		case "failed":
			return GenerationResult{Success: false, Model: model, Error: poll.Error.Message}
		}
	}
	return GenerationResult{Success: false, Model: model, Error: "timed out after 300 polls"}
}
