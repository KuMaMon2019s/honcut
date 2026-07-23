package config

import (
	"os"
	"strings"
)

// KeyStore manages API keys and model configuration from environment variables.
// Mirrors OpenChatCut's keystore.ts pattern: seed from .env.local / process env,
// live-updated at runtime, secrets never exposed via API.
type KeyStore struct {
	store    map[string]string
	envSeed  map[string]bool // tracks which keys came from env at startup
}

// Well-known env var names matching OpenChatCut convention
const (
	EnvLLMProvider    = "LLM_PROVIDER"
	EnvLLMModel       = "LLM_MODEL"
	EnvLLMBaseURL     = "LLM_BASE_URL"
	EnvLLMAPIKey      = "LLM_API_KEY"
	EnvOpenAIAPIKey   = "OPENAI_API_KEY"
	EnvAnthropicAPIKey = "ANTHROPIC_API_KEY"

	EnvArkAPIKey      = "ARK_API_KEY"
	EnvArkBaseURL     = "ARK_BASE_URL"
	EnvArkModel       = "ARK_MODEL"
	EnvArkVisionKey   = "ARK_VISION_API_KEY"
	EnvArkVisionModel = "ARK_VISION_MODEL"

	EnvSeedanceAPIKey = "SEEDANCE_API_KEY"
	EnvSeedanceModel  = "SEEDANCE_VIDEO_MODEL"

	EnvImageAPIKey    = "IMAGE_API_KEY"
	EnvImageBaseURL   = "IMAGE_BASE_URL"
)

// NewKeyStore creates a KeyStore seeded from environment variables
func NewKeyStore() *KeyStore {
	ks := &KeyStore{
		store:   make(map[string]string),
		envSeed: make(map[string]bool),
	}
	// Seed from all known env vars
	allKeys := []string{
		EnvLLMProvider, EnvLLMModel, EnvLLMBaseURL, EnvLLMAPIKey,
		EnvOpenAIAPIKey, EnvAnthropicAPIKey,
		EnvArkAPIKey, EnvArkBaseURL, EnvArkModel,
		EnvArkVisionKey, EnvArkVisionModel,
		EnvSeedanceAPIKey, EnvSeedanceModel,
		EnvImageAPIKey, EnvImageBaseURL,
	}
	for _, k := range allKeys {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			ks.store[k] = v
			ks.envSeed[k] = true
		}
	}
	return ks
}

// Get returns the value for a key, or "" if unset
func (ks *KeyStore) Get(key string) string {
	if ks == nil {
		return ""
	}
	return ks.store[key]
}

// Set updates a key at runtime (runtime values survive restart via persistence layer)
func (ks *KeyStore) Set(key, value string) {
	if ks == nil {
		return
	}
	ks.store[key] = value
	delete(ks.envSeed, key) // now a runtime value
}

// IsConfigured checks if a key has any value set
func (ks *KeyStore) IsConfigured(key string) bool {
	return ks.Get(key) != ""
}

// ResolveProvider resolves a full provider config from the keystore.
// Falls back to provider preset defaults when env vars are unset.
func (ks *KeyStore) ResolveProvider(providerID string) ResolvedProvider {
	preset, ok := ProviderByID(providerID)
	if !ok {
		preset = DefaultProviders()[0] // default to Ark
	}

	resolved := ResolvedProvider{Provider: preset}

	// Resolve API key: check provider-specific env var first, then generic
	switch preset.ID {
	case "ark":
		resolved.APIKey = ks.coalesce(EnvArkAPIKey, EnvLLMAPIKey, EnvOpenAIAPIKey)
		resolved.BaseURL = ks.coalesce(EnvArkBaseURL, preset.BaseURL)
		resolved.Model = ks.coalesce(EnvArkModel, preset.DefaultModel)
		resolved.ApiMode = ApiModeResponses
	case "openai":
		resolved.APIKey = ks.coalesce(EnvOpenAIAPIKey, EnvLLMAPIKey)
		resolved.BaseURL = ks.coalesce(EnvLLMBaseURL, preset.BaseURL)
		resolved.Model = ks.coalesce(EnvLLMModel, preset.DefaultModel)
		resolved.ApiMode = ApiModeChat
	case "anthropic":
		resolved.APIKey = ks.coalesce(EnvAnthropicAPIKey, EnvLLMAPIKey)
		resolved.BaseURL = ks.coalesce(EnvLLMBaseURL, preset.BaseURL)
		resolved.Model = ks.coalesce(EnvLLMModel, preset.DefaultModel)
		resolved.ApiMode = ApiModeChat
	case "seedance":
		resolved.APIKey = ks.coalesce(EnvSeedanceAPIKey, EnvArkAPIKey, EnvLLMAPIKey)
		resolved.BaseURL = ks.coalesce(EnvLLMBaseURL, preset.BaseURL)
		resolved.Model = ks.coalesce(EnvSeedanceModel, preset.DefaultModel)
		resolved.ApiMode = ApiModeChat
	case "ark-vision":
		resolved.APIKey = ks.coalesce(EnvArkVisionKey, EnvArkAPIKey, EnvLLMAPIKey)
		resolved.BaseURL = ks.coalesce(EnvLLMBaseURL, preset.BaseURL)
		resolved.Model = ks.coalesce(EnvArkVisionModel, preset.DefaultModel)
		resolved.ApiMode = ApiModeChat
	default:
		resolved.APIKey = ks.Get(EnvLLMAPIKey)
		resolved.BaseURL = ks.coalesce(EnvLLMBaseURL, preset.BaseURL)
		resolved.Model = ks.coalesce(EnvLLMModel, preset.DefaultModel)
		resolved.ApiMode = ApiModeChat
	}

	return resolved
}

// coalesce returns the first non-empty value from env vars or the fallback
func (ks *KeyStore) coalesce(keys ...string) string {
	for _, k := range keys {
		if v := ks.Get(k); v != "" {
			return v
		}
	}
	// Last arg is the fallback (not from keystore)
	last := keys[len(keys)-1]
	if !strings.HasPrefix(last, "LLM_") && !strings.HasSuffix(last, "_KEY") &&
		!strings.HasSuffix(last, "_MODEL") && !strings.HasSuffix(last, "_URL") {
		return last
	}
	return ""
}
