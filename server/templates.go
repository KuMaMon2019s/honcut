package honcutserver

import "strings"

// MGTemplate represents a motion-graphic template
type MGTemplate struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	Duration int    `json:"duration_frames"` // default duration in frames
	Width    int    `json:"width"`
	Height   int    `json:"height"`
}

// templateCatalog is the static catalog of ~211 motion-graphic templates.
var templateCatalog = []MGTemplate{
	// ── title-cards (30) ──
	{"Modern Title", "title-cards", 90, 1920, 1080},
	{"Cinematic Title", "title-cards", 120, 1920, 1080},
	{"Minimal Title", "title-cards", 60, 1920, 1080},
	{"Bold Title", "title-cards", 90, 1920, 1080},
	{"Elegant Title", "title-cards", 120, 1920, 1080},
	{"Neon Title", "title-cards", 90, 1920, 1080},
	{"Glitch Title", "title-cards", 90, 1920, 1080},
	{"Typewriter Title", "title-cards", 150, 1920, 1080},
	{"Slide Title", "title-cards", 60, 1920, 1080},
	{"Fade Title", "title-cards", 90, 1920, 1080},
	{"3D Title", "title-cards", 120, 1920, 1080},
	{"Gradient Title", "title-cards", 90, 1920, 1080},
	{"Split Title", "title-cards", 90, 1920, 1080},
	{"Kinetic Title", "title-cards", 120, 1920, 1080},
	{"Retro Title", "title-cards", 90, 1920, 1080},
	{"Corporate Title", "title-cards", 90, 1920, 1080},
	{"YouTube Title", "title-cards", 90, 1920, 1080},
	{"Podcast Title", "title-cards", 90, 1920, 1080},
	{"Gaming Title", "title-cards", 90, 1920, 1080},
	{"Music Title", "title-cards", 90, 1920, 1080},
	{"Travel Title", "title-cards", 90, 1920, 1080},
	{"Food Title", "title-cards", 90, 1920, 1080},
	{"Tech Title", "title-cards", 90, 1920, 1080},
	{"Sports Title", "title-cards", 90, 1920, 1080},
	{"Fashion Title", "title-cards", 90, 1920, 1080},
	{"Nature Title", "title-cards", 90, 1920, 1080},
	{"Wedding Title", "title-cards", 120, 1920, 1080},
	{"Birthday Title", "title-cards", 90, 1920, 1080},
	{"Holiday Title", "title-cards", 90, 1920, 1080},
	{"Event Title", "title-cards", 90, 1920, 1080},

	// ── lower-thirds (25) ──
	{"Clean Lower Third", "lower-thirds", 150, 1920, 1080},
	{"Name Badge", "lower-thirds", 120, 1920, 1080},
	{"Social Handle", "lower-thirds", 90, 1920, 1080},
	{"Info Bar", "lower-thirds", 150, 1920, 1080},
	{"Subtitle Bar", "lower-thirds", 120, 1920, 1080},
	{"Corporate LT", "lower-thirds", 120, 1920, 1080},
	{"News LT", "lower-thirds", 150, 1920, 1080},
	{"Interview LT", "lower-thirds", 120, 1920, 1080},
	{"YouTube LT", "lower-thirds", 90, 1920, 1080},
	{"Podcast LT", "lower-thirds", 90, 1920, 1080},
	{"Gaming LT", "lower-thirds", 90, 1920, 1080},
	{"Music LT", "lower-thirds", 90, 1920, 1080},
	{"Sports LT", "lower-thirds", 90, 1920, 1080},
	{"Travel LT", "lower-thirds", 90, 1920, 1080},
	{"Food LT", "lower-thirds", 90, 1920, 1080},
	{"Tech LT", "lower-thirds", 90, 1920, 1080},
	{"Fashion LT", "lower-thirds", 90, 1920, 1080},
	{"Minimal LT", "lower-thirds", 90, 1920, 1080},
	{"Bold LT", "lower-thirds", 90, 1920, 1080},
	{"Elegant LT", "lower-thirds", 90, 1920, 1080},
	{"Neon LT", "lower-thirds", 90, 1920, 1080},
	{"Glitch LT", "lower-thirds", 90, 1920, 1080},
	{"Retro LT", "lower-thirds", 90, 1920, 1080},
	{"Gradient LT", "lower-thirds", 90, 1920, 1080},
	{"Animated LT", "lower-thirds", 120, 1920, 1080},

	// ── transitions (20) ──
	{"Dissolve", "transitions", 30, 1920, 1080},
	{"Wipe Left", "transitions", 30, 1920, 1080},
	{"Wipe Right", "transitions", 30, 1920, 1080},
	{"Zoom In", "transitions", 30, 1920, 1080},
	{"Zoom Out", "transitions", 30, 1920, 1080},
	{"Spin", "transitions", 30, 1920, 1080},
	{"Slide Left", "transitions", 30, 1920, 1080},
	{"Slide Right", "transitions", 30, 1920, 1080},
	{"Fade Black", "transitions", 30, 1920, 1080},
	{"Fade White", "transitions", 30, 1920, 1080},
	{"Glitch Trans", "transitions", 30, 1920, 1080},
	{"Blur Trans", "transitions", 30, 1920, 1080},
	{"Morph Trans", "transitions", 45, 1920, 1080},
	{"Liquid Trans", "transitions", 45, 1920, 1080},
	{"Pixel Trans", "transitions", 30, 1920, 1080},
	{"Light Leak", "transitions", 45, 1920, 1080},
	{"Film Burn", "transitions", 45, 1920, 1080},
	{"Whip Pan", "transitions", 20, 1920, 1080},
	{"Swirl Trans", "transitions", 30, 1920, 1080},
	{"Flash Trans", "transitions", 15, 1920, 1080},

	// ── overlays (20) ──
	{"Film Grain", "overlays", 90, 1920, 1080},
	{"Light Leak Overlay", "overlays", 90, 1920, 1080},
	{"Bokeh Overlay", "overlays", 90, 1920, 1080},
	{"Smoke Overlay", "overlays", 90, 1920, 1080},
	{"Rain Overlay", "overlays", 90, 1920, 1080},
	{"Snow Overlay", "overlays", 90, 1920, 1080},
	{"Dust Overlay", "overlays", 90, 1920, 1080},
	{"Lens Flare", "overlays", 60, 1920, 1080},
	{"Vignette", "overlays", 90, 1920, 1080},
	{"Chromatic Aberration", "overlays", 90, 1920, 1080},
	{"Scan Lines", "overlays", 90, 1920, 1080},
	{"VHS Effect", "overlays", 90, 1920, 1080},
	{"Noise Overlay", "overlays", 90, 1920, 1080},
	{"Sparkle Overlay", "overlays", 90, 1920, 1080},
	{"Confetti Overlay", "overlays", 90, 1920, 1080},
	{"Bubble Overlay", "overlays", 90, 1920, 1080},
	{"Fire Overlay", "overlays", 90, 1920, 1080},
	{"Water Overlay", "overlays", 90, 1920, 1080},
	{"Glitch Overlay", "overlays", 90, 1920, 1080},
	{"Neon Glow", "overlays", 90, 1920, 1080},

	// ── backgrounds (25) ──
	{"Gradient BG", "backgrounds", 90, 1920, 1080},
	{"Abstract BG", "backgrounds", 90, 1920, 1080},
	{"Particle BG", "backgrounds", 90, 1920, 1080},
	{"Wave BG", "backgrounds", 90, 1920, 1080},
	{"Geometric BG", "backgrounds", 90, 1920, 1080},
	{"Neon BG", "backgrounds", 90, 1920, 1080},
	{"Dark BG", "backgrounds", 90, 1920, 1080},
	{"Light BG", "backgrounds", 90, 1920, 1080},
	{"Corporate BG", "backgrounds", 90, 1920, 1080},
	{"Tech BG", "backgrounds", 90, 1920, 1080},
	{"Nature BG", "backgrounds", 90, 1920, 1080},
	{"Space BG", "backgrounds", 90, 1920, 1080},
	{"Ocean BG", "backgrounds", 90, 1920, 1080},
	{"City BG", "backgrounds", 90, 1920, 1080},
	{"Forest BG", "backgrounds", 90, 1920, 1080},
	{"Sunset BG", "backgrounds", 90, 1920, 1080},
	{"Mountain BG", "backgrounds", 90, 1920, 1080},
	{"Desert BG", "backgrounds", 90, 1920, 1080},
	{"Tropical BG", "backgrounds", 90, 1920, 1080},
	{"Winter BG", "backgrounds", 90, 1920, 1080},
	{"Spring BG", "backgrounds", 90, 1920, 1080},
	{"Summer BG", "backgrounds", 90, 1920, 1080},
	{"Autumn BG", "backgrounds", 90, 1920, 1080},
	{"Minimal BG", "backgrounds", 90, 1920, 1080},
	{"Retro BG", "backgrounds", 90, 1920, 1080},

	// ── social-media (20) ──
	{"Instagram Story", "social-media", 90, 1080, 1920},
	{"TikTok Frame", "social-media", 90, 1080, 1920},
	{"YouTube Subscribe", "social-media", 90, 1920, 1080},
	{"Like Animation", "social-media", 60, 1920, 1080},
	{"Comment Bubble", "social-media", 60, 1920, 1080},
	{"Share Button", "social-media", 60, 1920, 1080},
	{"Follow CTA", "social-media", 90, 1920, 1080},
	{"Notification Pop", "social-media", 60, 1920, 1080},
	{"Countdown Timer", "social-media", 150, 1920, 1080},
	{"Poll Template", "social-media", 120, 1920, 1080},
	{"Quiz Template", "social-media", 120, 1920, 1080},
	{"Swipe Up", "social-media", 60, 1080, 1920},
	{"Link in Bio", "social-media", 60, 1080, 1920},
	{"New Post", "social-media", 60, 1080, 1920},
	{"Live Now", "social-media", 60, 1920, 1080},
	{"Reel Cover", "social-media", 60, 1080, 1920},
	{"Twitter Card", "social-media", 90, 1920, 1080},
	{"LinkedIn Banner", "social-media", 90, 1920, 1080},
	{"Facebook Cover", "social-media", 90, 1920, 1080},
	{"Snapchat Frame", "social-media", 90, 1080, 1920},

	// ── intros (15) ──
	{"Logo Reveal", "intros", 90, 1920, 1080},
	{"Channel Intro", "intros", 120, 1920, 1080},
	{"Podcast Intro", "intros", 150, 1920, 1080},
	{"Gaming Intro", "intros", 120, 1920, 1080},
	{"Music Intro", "intros", 120, 1920, 1080},
	{"Corporate Intro", "intros", 120, 1920, 1080},
	{"YouTube Intro", "intros", 90, 1920, 1080},
	{"Vlog Intro", "intros", 90, 1920, 1080},
	{"Tutorial Intro", "intros", 90, 1920, 1080},
	{"News Intro", "intros", 120, 1920, 1080},
	{"Sports Intro", "intros", 120, 1920, 1080},
	{"Travel Intro", "intros", 120, 1920, 1080},
	{"Food Intro", "intros", 90, 1920, 1080},
	{"Tech Intro", "intros", 90, 1920, 1080},
	{"Fashion Intro", "intros", 90, 1920, 1080},

	// ── outros (15) ──
	{"End Screen", "outros", 150, 1920, 1080},
	{"Subscribe CTA", "outros", 90, 1920, 1080},
	{"Credits Roll", "outros", 180, 1920, 1080},
	{"Thank You", "outros", 90, 1920, 1080},
	{"See You Next Time", "outros", 90, 1920, 1080},
	{"Like & Subscribe", "outros", 90, 1920, 1080},
	{"Comment Below", "outros", 60, 1920, 1080},
	{"Social Links", "outros", 90, 1920, 1080},
	{"Next Video", "outros", 90, 1920, 1080},
	{"Playlist CTA", "outros", 90, 1920, 1080},
	{"Website CTA", "outros", 90, 1920, 1080},
	{"Contact Info", "outros", 90, 1920, 1080},
	{"Logo Fade", "outros", 60, 1920, 1080},
	{"Simple Outro", "outros", 60, 1920, 1080},
	{"Cinematic Outro", "outros", 120, 1920, 1080},

	// ── text-animations (21) ──
	{"Typewriter", "text-animations", 120, 1920, 1080},
	{"Word by Word", "text-animations", 120, 1920, 1080},
	{"Letter Pop", "text-animations", 90, 1920, 1080},
	{"Bounce Text", "text-animations", 60, 1920, 1080},
	{"Slide In Text", "text-animations", 60, 1920, 1080},
	{"Fade Text", "text-animations", 60, 1920, 1080},
	{"Scale Text", "text-animations", 60, 1920, 1080},
	{"Rotate Text", "text-animations", 60, 1920, 1080},
	{"Glitch Text", "text-animations", 60, 1920, 1080},
	{"Neon Text", "text-animations", 90, 1920, 1080},
	{"Fire Text", "text-animations", 90, 1920, 1080},
	{"Water Text", "text-animations", 90, 1920, 1080},
	{"Metal Text", "text-animations", 90, 1920, 1080},
	{"Gold Text", "text-animations", 90, 1920, 1080},
	{"Ice Text", "text-animations", 90, 1920, 1080},
	{"Smoke Text", "text-animations", 90, 1920, 1080},
	{"Rainbow Text", "text-animations", 90, 1920, 1080},
	{"Outline Text", "text-animations", 60, 1920, 1080},
	{"Shadow Text", "text-animations", 60, 1920, 1080},
	{"Blur Text", "text-animations", 60, 1920, 1080},
	{"3D Text", "text-animations", 90, 1920, 1080},

	// ── infographics (20) ──
	{"Bar Chart", "infographics", 120, 1920, 1080},
	{"Pie Chart", "infographics", 120, 1920, 1080},
	{"Line Graph", "infographics", 120, 1920, 1080},
	{"Number Counter", "infographics", 90, 1920, 1080},
	{"Progress Bar", "infographics", 90, 1920, 1080},
	{"Timeline Graphic", "infographics", 150, 1920, 1080},
	{"Comparison Chart", "infographics", 120, 1920, 1080},
	{"Funnel Chart", "infographics", 120, 1920, 1080},
	{"Map Highlight", "infographics", 120, 1920, 1080},
	{"Stat Card", "infographics", 90, 1920, 1080},
	{"Percentage Ring", "infographics", 90, 1920, 1080},
	{"Icon List", "infographics", 120, 1920, 1080},
	{"Step Process", "infographics", 150, 1920, 1080},
	{"Checklist", "infographics", 120, 1920, 1080},
	{"Rating Stars", "infographics", 60, 1920, 1080},
	{"Price Tag", "infographics", 60, 1920, 1080},
	{"Feature List", "infographics", 120, 1920, 1080},
	{"Team Grid", "infographics", 120, 1920, 1080},
	{"Quote Card", "infographics", 90, 1920, 1080},
	{"Data Table", "infographics", 120, 1920, 1080},
}

// ListTemplateCategories returns category names with template counts.
func ListTemplateCategories() map[string]int {
	counts := make(map[string]int)
	for _, t := range templateCatalog {
		counts[t.Category]++
	}
	return counts
}

// ListTemplatesByCategory returns templates in a given category.
// If category is empty, returns all templates.
func ListTemplatesByCategory(category string) []MGTemplate {
	if category == "" {
		return templateCatalog
	}
	var result []MGTemplate
	for _, t := range templateCatalog {
		if t.Category == category {
			result = append(result, t)
		}
	}
	return result
}

// SearchTemplates performs a fuzzy substring search across name and category.
func SearchTemplates(query string) []MGTemplate {
	q := strings.ToLower(query)
	var result []MGTemplate
	for _, t := range templateCatalog {
		if strings.Contains(strings.ToLower(t.Name), q) ||
			strings.Contains(strings.ToLower(t.Category), q) {
			result = append(result, t)
		}
	}
	return result
}

// FindTemplate does a fuzzy match for a template by name (case-insensitive substring).
// Returns the first match or nil.
func FindTemplate(name string) *MGTemplate {
	q := strings.ToLower(name)
	for _, t := range templateCatalog {
		if strings.Contains(strings.ToLower(t.Name), q) {
			return &t
		}
	}
	return nil
}
