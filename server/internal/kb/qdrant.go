package kb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// QdrantClient wraps Qdrant vector search operations
type QdrantClient struct {
	baseURL    string
	collection string
	httpClient *http.Client
}

// SearchResult represents a single search result from Qdrant
type SearchResult struct {
	ID    string                 `json:"id"`
	Score float64                `json:"score"`
	Payload map[string]interface{} `json:"payload"`
}

// NewQdrantClient creates a Qdrant client from environment variables
func NewQdrantClient() *QdrantClient {
	baseURL := os.Getenv("QDRANT_URL")
	if baseURL == "" {
		baseURL = "http://localhost:6333"
	}
	collection := os.Getenv("QDRANT_COLLECTION")
	if collection == "" {
		collection = "honcut-kb"
	}
	return &QdrantClient{
		baseURL:    baseURL,
		collection: collection,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Search performs a semantic search using a pre-computed embedding vector
func (q *QdrantClient) Search(ctx context.Context, vector []float32, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = 5
	}

	reqBody := map[string]interface{}{
		"vector": vector,
		"limit":  limit,
		"with_payload": true,
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal search request: %w", err)
	}

	url := fmt.Sprintf("%s/collections/%s/points/search", q.baseURL, q.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := q.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("qdrant search request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("qdrant search failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Result []SearchResult `json:"result"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	return result.Result, nil
}

// Upsert inserts or updates a point with an embedding vector
func (q *QdrantClient) Upsert(ctx context.Context, id string, vector []float32, payload map[string]interface{}) error {
	reqBody := map[string]interface{}{
		"points": []map[string]interface{}{
			{
				"id":      id,
				"vector":  vector,
				"payload": payload,
			},
		},
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshal upsert request: %w", err)
	}

	url := fmt.Sprintf("%s/collections/%s/points", q.baseURL, q.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := q.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant upsert request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant upsert failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// Delete removes a point by ID
func (q *QdrantClient) Delete(ctx context.Context, id string) error {
	reqBody := map[string]interface{}{
		"points": []string{id},
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("marshal delete request: %w", err)
	}

	url := fmt.Sprintf("%s/collections/%s/points/delete", q.baseURL, q.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := q.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant delete request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant delete failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// Health checks if Qdrant is reachable
func (q *QdrantClient) Health(ctx context.Context) error {
	url := fmt.Sprintf("%s/healthz", q.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("create health request: %w", err)
	}
	resp, err := q.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant health check failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qdrant unhealthy (status %d)", resp.StatusCode)
	}
	return nil
}
