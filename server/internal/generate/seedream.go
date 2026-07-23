package generate

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"
)

// Seedream generates images via Ark Agent Plan (doubao-seedream-5.0-lite)
type Seedream struct {
	client *ArkClient
}

type SeedreamInput struct {
	Prompt     string `json:"prompt"`
	Size       string `json:"size,omitempty"`
	N          int    `json:"n,omitempty"`
	OutputPath string `json:"output_path,omitempty"`
}

func NewSeedream(client *ArkClient) *Seedream {
	return &Seedream{client: client}
}

func (s *Seedream) Generate(ctx context.Context, input SeedreamInput) GenerationResult {
	start := time.Now()
	if input.Size == "" {
		input.Size = "1920x1920"
	}
	if input.N == 0 {
		input.N = 1
	}
	if input.OutputPath == "" {
		input.OutputPath = "seedream_output.png"
	}

	body := map[string]interface{}{
		"model":  "doubao-seedream-5.0-lite",
		"prompt": input.Prompt,
		"size":   input.Size,
		"n":      input.N,
	}

	resp, err := s.client.post(ctx, "/images/generations", body)
	if err != nil {
		return GenerationResult{Success: false, Error: err.Error()}
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return GenerationResult{Success: false, Error: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(data))}
	}

	// Try URL format
	var urlResult struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if json.Unmarshal(data, &urlResult) == nil && len(urlResult.Data) > 0 && urlResult.Data[0].URL != "" {
		if err := s.client.download(ctx, urlResult.Data[0].URL, input.OutputPath); err != nil {
			return GenerationResult{Success: false, Error: "download: " + err.Error()}
		}
		return GenerationResult{Success: true, Model: "doubao-seedream-5.0-lite",
			Output: input.OutputPath, Format: "png", Duration: time.Since(start).Seconds()}
	}

	// Try base64 format
	var b64Result struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if json.Unmarshal(data, &b64Result) == nil && len(b64Result.Data) > 0 && b64Result.Data[0].B64JSON != "" {
		decoded, err := base64.StdEncoding.DecodeString(b64Result.Data[0].B64JSON)
		if err != nil {
			return GenerationResult{Success: false, Error: "base64: " + err.Error()}
		}
		if err := os.WriteFile(input.OutputPath, decoded, 0644); err != nil {
			return GenerationResult{Success: false, Error: "write file: " + err.Error()}
		}
		return GenerationResult{Success: true, Model: "doubao-seedream-5.0-lite",
			Output: input.OutputPath, Format: "png", Duration: time.Since(start).Seconds()}
	}

	return GenerationResult{Success: false, Error: "unexpected response: " + string(data)}
}
