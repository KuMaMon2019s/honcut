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

// ── Embedding Client (Ark Agent Plan: doubao-embedding-vision) ──────

// EmbeddingClient generates embeddings via Ark Agent Plan
type EmbeddingClient struct {
	apiKey  string
	baseURL string
	model   string
	client  *http.Client
}

// NewEmbeddingClient creates an embedding client from honcut config env vars
func NewEmbeddingClient() *EmbeddingClient {
	apiKey := os.Getenv("ARK_API_KEY")
	model := "doubao-embedding-vision"
	if v := os.Getenv("ARK_VISION_MODEL"); v != "" {
		model = v
	}
	return &EmbeddingClient{
		apiKey:  apiKey,
		baseURL: "https://ark.cn-beijing.volces.com/api/plan/v3",
		model:   model,
		client:  &http.Client{Timeout: 30 * time.Second},
	}
}

// Embed generates a vector embedding for text (doubao-embedding-vision)
func (e *EmbeddingClient) Embed(ctx context.Context, text string) ([]float32, error) {
	reqBody := map[string]interface{}{
		"model": e.model,
		"input": text,
	}
	body, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", e.baseURL+"/embeddings",
		bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create embed request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+e.apiKey)

	resp, err := e.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embed request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embed failed (status %d): %s", resp.StatusCode, string(b))
	}

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode embed response: %w", err)
	}
	if len(result.Data) == 0 || len(result.Data[0].Embedding) == 0 {
		return nil, fmt.Errorf("empty embedding returned")
	}
	return result.Data[0].Embedding, nil
}

// ── Qdrant Client (vector store) ──────────────────────────────────

type QdrantClient struct {
	baseURL    string
	collection string
	embedder   *EmbeddingClient
	httpClient *http.Client
}

type SearchResult struct {
	ID      string                 `json:"id"`
	Score   float64                `json:"score"`
	Payload map[string]interface{} `json:"payload"`
}

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
		embedder:   NewEmbeddingClient(),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// SemanticSearch converts text to embedding then searches Qdrant
func (q *QdrantClient) SemanticSearch(ctx context.Context, query string, limit int) ([]SearchResult, error) {
	if limit <= 0 {
		limit = 5
	}
	vec, err := q.embedder.Embed(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("embed query: %w", err)
	}
	return q.Search(ctx, vec, limit)
}

func (q *QdrantClient) Search(ctx context.Context, vector []float32, limit int) ([]SearchResult, error) {
	reqBody := map[string]interface{}{
		"vector":        vector,
		"limit":         limit,
		"with_payload":  true,
	}
	body, _ := json.Marshal(reqBody)

	url := fmt.Sprintf("%s/collections/%s/points/search", q.baseURL, q.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := q.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("qdrant search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant search failed (status %d): %s", resp.StatusCode, string(b))
	}

	var result struct {
		Result []SearchResult `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}
	return result.Result, nil
}

func (q *QdrantClient) Upsert(ctx context.Context, id string, vector []float32, payload map[string]interface{}) error {
	reqBody := map[string]interface{}{
		"points": []map[string]interface{}{{
			"id": id, "vector": vector, "payload": payload,
		}},
	}
	body, _ := json.Marshal(reqBody)

	url := fmt.Sprintf("%s/collections/%s/points", q.baseURL, q.collection)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := q.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant upsert: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant upsert failed (status %d): %s", resp.StatusCode, string(b))
	}
	return nil
}

func (q *QdrantClient) Delete(ctx context.Context, id string) error {
	body, _ := json.Marshal(map[string]interface{}{"points": []string{id}})
	url := fmt.Sprintf("%s/collections/%s/points/delete", q.baseURL, q.collection)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := q.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant delete: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant delete failed (status %d): %s", resp.StatusCode, string(b))
	}
	return nil
}

func (q *QdrantClient) Health(ctx context.Context) error {
	url := fmt.Sprintf("%s/healthz", q.baseURL)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := q.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant health: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qdrant unhealthy (status %d)", resp.StatusCode)
	}
	return nil
}
