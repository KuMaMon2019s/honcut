package config

// LlmProtocol defines the API protocol used by a provider
type LlmProtocol string

const (
	ProtocolAnthropic       LlmProtocol = "anthropic"
	ProtocolOpenAI          LlmProtocol = "openai"
	ProtocolOpenAICompat    LlmProtocol = "openai-compatible"
	ProtocolArkAgentPlan    LlmProtocol = "ark-agent-plan" // Volcano Ark Agent Plan (Responses API)
)

// OpenAiApiMode controls whether to use Responses or Chat API
type OpenAiApiMode string

const (
	ApiModeResponses OpenAiApiMode = "codex_responses"
	ApiModeChat      OpenAiApiMode = "chat"
)

// LlmProviderPreset defines a pre-configured model provider
type LlmProviderPreset struct {
	ID           string        `json:"id"`
	Label        string        `json:"label"`
	Protocol     LlmProtocol   `json:"protocol"`
	BaseURL      string        `json:"base_url"`
	DefaultModel string        `json:"default_model"`
	ApiMode      OpenAiApiMode `json:"api_mode,omitempty"`
	ApiPath      string        `json:"api_path,omitempty"`
}

// DefaultProviders returns all supported provider presets
func DefaultProviders() []LlmProviderPreset {
	return []LlmProviderPreset{
		{
			ID:           "ark",
			Label:        "Volcano Ark · Agent Plan",
			Protocol:     ProtocolArkAgentPlan,
			BaseURL:      "https://ark.cn-beijing.volces.com/api/plan/v3",
			DefaultModel: "ark-code-latest",
			ApiMode:      ApiModeResponses,
		},
		{
			ID:           "ark-vision",
			Label:        "Volcano Ark · Vision",
			Protocol:     ProtocolOpenAICompat,
			BaseURL:      "https://ark.cn-beijing.volces.com/api/v3",
			DefaultModel: "doubao-embedding-vision",
		},
		{
			ID:           "openai",
			Label:        "OpenAI",
			Protocol:     ProtocolOpenAI,
			BaseURL:      "https://api.openai.com/v1",
			DefaultModel: "gpt-4o",
			ApiPath:      "/responses",
		},
		{
			ID:           "anthropic",
			Label:        "Anthropic · Claude",
			Protocol:     ProtocolAnthropic,
			BaseURL:      "https://api.anthropic.com/v1",
			DefaultModel: "claude-sonnet-4-20250514",
		},
		{
			ID:           "deepseek",
			Label:        "DeepSeek",
			Protocol:     ProtocolOpenAICompat,
			BaseURL:      "https://api.deepseek.com/v1",
			DefaultModel: "deepseek-chat",
		},
		{
			ID:           "seedance",
			Label:        "Volcano Ark · Seedance (Video Gen)",
			Protocol:     ProtocolOpenAICompat,
			BaseURL:      "https://ark.cn-beijing.volces.com/api/v3",
			DefaultModel: "doubao-seedance-2-0-260128",
		},
	}
}

// ProviderByID looks up a provider preset by ID
func ProviderByID(id string) (LlmProviderPreset, bool) {
	for _, p := range DefaultProviders() {
		if p.ID == id {
			return p, true
		}
	}
	return LlmProviderPreset{}, false
}

// ResolvedProvider holds a fully-resolved provider configuration
type ResolvedProvider struct {
	Provider LlmProviderPreset `json:"provider"`
	APIKey   string            `json:"-"` // never serialized
	Model    string            `json:"model"`
	BaseURL  string            `json:"base_url"`
	ApiMode  OpenAiApiMode     `json:"api_mode"`
}
