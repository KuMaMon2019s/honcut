package config

import (
	"os"
	"strings"
)

type KeyStore struct {
	store   map[string]string
	envSeed map[string]bool
}

const (
	EnvArkAPIKey  = "ARK_API_KEY"
	EnvArkBaseURL = "ARK_BASE_URL"
	EnvArkModel   = "ARK_MODEL"
)

func NewKeyStore() *KeyStore {
	ks := &KeyStore{
		store:   make(map[string]string),
		envSeed: make(map[string]bool),
	}
	for _, k := range []string{EnvArkAPIKey, EnvArkBaseURL, EnvArkModel} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			ks.store[k] = v
			ks.envSeed[k] = true
		}
	}
	return ks
}

func (ks *KeyStore) Get(key string) string {
	if ks == nil {
		return ""
	}
	return ks.store[key]
}

func (ks *KeyStore) IsConfigured(key string) bool {
	return ks.Get(key) != ""
}

// ResolveProvider resolves config for a provider ID (which is the official model name).
func (ks *KeyStore) ResolveProvider(modelID string) ResolvedProvider {
	preset, ok := ProviderByID(modelID)
	if !ok {
		preset = LlmProviderPreset{ID: modelID, Label: modelID, BaseURL: "https://ark.cn-beijing.volces.com/api/plan/v3"}
	}

	return ResolvedProvider{
		APIKey:  ks.Get(EnvArkAPIKey),
		Model:   modelID,
		BaseURL: ks.coalesce(EnvArkBaseURL, preset.BaseURL),
	}
}

func (ks *KeyStore) coalesce(envKey, fallback string) string {
	if v := ks.Get(envKey); v != "" {
		return v
	}
	return fallback
}
