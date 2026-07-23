package generate

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"
)

// ArkClient wraps Volcano Ark Agent Plan API calls
type ArkClient struct {
	APIKey  string
	BaseURL string
	client  *http.Client
}

// NewArkClient creates a client from environment (ARK_API_KEY)
func NewArkClient() *ArkClient {
	return &ArkClient{
		APIKey:  os.Getenv("ARK_API_KEY"),
		BaseURL: "https://ark.cn-beijing.volces.com/api/plan/v3",
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *ArkClient) post(ctx context.Context, path string, body interface{}) (*http.Response, error) {
	b, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+path, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	return c.client.Do(req)
}

func (c *ArkClient) get(ctx context.Context, path string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	return c.client.Do(req)
}

func (c *ArkClient) download(ctx context.Context, url, dstPath string) error {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	return os.WriteFile(dstPath, data, 0644)
}

// readBody reads and closes the response body
func readBody(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// GenerationResult is returned by all generation tools
type GenerationResult struct {
	Success  bool   `json:"success"`
	Model    string `json:"model"`
	Output   string `json:"output,omitempty"`
	Format   string `json:"format,omitempty"`
	Duration float64 `json:"duration_seconds,omitempty"`
	Error    string `json:"error,omitempty"`
}
