package config

type LlmProviderPreset struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	BaseURL  string `json:"base_url"`
}

// DefaultProviders — 全部来自 https://console.volcengine.com/ark/region:cn-beijing/docs/82379/2366394
func DefaultProviders() []LlmProviderPreset {
	base := "https://ark.cn-beijing.volces.com/api/plan/v3"
	return []LlmProviderPreset{
		// 文本生成
		{ID: "doubao-seed-2.0-pro", Label: "Doubao Pro (进阶)", BaseURL: base},
		{ID: "doubao-seed-2.0-code", Label: "Doubao Code", BaseURL: base},
		{ID: "doubao-seed-2.0-lite", Label: "Doubao Lite (标准)", BaseURL: base},
		{ID: "doubao-seed-2.0-mini", Label: "Doubao Mini (极速)", BaseURL: base},
		{ID: "doubao-seed-evolving", Label: "Doubao Evolving (思考)", BaseURL: base},

		// 向量化
		{ID: "doubao-embedding-vision", Label: "Embedding Vision", BaseURL: base},

		// 图片生成
		{ID: "doubao-seedream-5.0-lite", Label: "Seedream (图片)", BaseURL: base},

		// 视频生成
		{ID: "doubao-seedance-2.0", Label: "Seedance 2.0 (视频)", BaseURL: base},
		{ID: "doubao-seedance-2.0-fast", Label: "Seedance Fast (视频)", BaseURL: base},

		// 语音
		{ID: "doubao-seed-tts-2.0", Label: "TTS 语音合成", BaseURL: base},
		{ID: "doubao-seed-asr-2.0", Label: "ASR 语音识别", BaseURL: base},
	}
}

func ProviderByID(id string) (LlmProviderPreset, bool) {
	for _, p := range DefaultProviders() {
		if p.ID == id {
			return p, true
		}
	}
	return LlmProviderPreset{}, false
}

type ResolvedProvider struct {
	APIKey  string `json:"-"`
	Model   string `json:"model"`
	BaseURL string `json:"base_url"`
}
