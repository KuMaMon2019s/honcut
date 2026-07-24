package honcutserver

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"honcut-server/internal/generate"
	"honcut-server/internal/kb"
	"honcut-server/internal/render"

	"github.com/google/uuid"
)

// MCPTool represents a Model Context Protocol tool
type MCPTool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// MCPServer handles MCP tool registration and execution
type MCPServer struct {
	store     *Store
	pm        *render.ProgressManager
	outputDir string
	tools     map[string]func(map[string]interface{}) (interface{}, error)
	editors   []map[string]interface{} // connected editor sessions
	arkClient *generate.ArkClient      // shared Ark API client
}

// NewMCPServer creates a new MCP server with the given store
func NewMCPServer(store *Store, pm *render.ProgressManager, outputDir string) *MCPServer {
	server := &MCPServer{
		store:     store,
		pm:        pm,
		outputDir: outputDir,
		tools:     make(map[string]func(map[string]interface{}) (interface{}, error)),
		arkClient: generate.NewArkClient(),
	}
	server.registerTools()
	return server
}

// RegisterEditor records a connected editor session (called on MCP initialize)
func (s *MCPServer) RegisterEditor(info map[string]interface{}) {
	s.editors = append(s.editors, info)
}

// registerTools registers all available MCP tools
func (s *MCPServer) registerTools() {
	// edit_project tool - updates project name and/or description
	s.tools["edit_project"] = s.editProject
	s.tools["add_clip"] = s.addClip
	s.tools["trim_clip"] = s.trimClip
	s.tools["move_clip"] = s.moveClip
	s.tools["add_transition"] = s.addTransition
	s.tools["read_timeline"] = s.readTimeline
	s.tools["upload_media"] = s.uploadMedia
	// Batch A: 10 new tools ported from OpenChatCut
	s.tools["list_projects"] = s.listProjects
	s.tools["create_project"] = s.createProject
	s.tools["read_project"] = s.readProject
	s.tools["clear_timeline"] = s.clearTimeline
	s.tools["split_item"] = s.splitItem
	s.tools["duplicate_item"] = s.duplicateItem
	s.tools["remove_item"] = s.removeItem
	s.tools["move_item"] = s.moveItem
	s.tools["update_item_props"] = s.updateItemProps
	s.tools["set_item_timing"] = s.setItemTiming
	// Batch B: 8 tools (timelines, tracks, audio, media pool, library, design)
	s.tools["manage_timelines"] = s.manageTimelines
	s.tools["edit_track"] = s.editTrack
	s.tools["set_aspect_ratio"] = s.setAspectRatio
	s.tools["list_audio"] = s.listAudio
	s.tools["add_audio"] = s.addAudio
	s.tools["manage_media_pool"] = s.manageMediaPool
	s.tools["browse_library"] = s.browseLibrary
	s.tools["manage_design_style"] = s.manageDesignStyle
	// Batch C: 10 tools (templates, script, export, status)
	s.tools["list_templates"] = s.listTemplates
	s.tools["search_templates"] = s.searchTemplates
	s.tools["add_motion_graphic"] = s.addMotionGraphic
	s.tools["submit_motion_graphic"] = s.submitMotionGraphic
	s.tools["read_script"] = s.readScript
	s.tools["apply_script"] = s.applyScript
	s.tools["submit_render_job"] = s.submitRenderJob
	s.tools["track_export"] = s.trackExport
	s.tools["openchatcut_status"] = s.openchatcutStatus
	s.tools["ToolSearch"] = s.toolSearch
	// Generation mode: text-to-video & text-to-image via Ark Agent Plan
	s.tools["generate_video"] = s.generateVideo
	s.tools["generate_image"] = s.generateImage
	s.tools["kb_search"] = s.kbSearch
}

// ListTools returns all available MCP tools
func (s *MCPServer) ListTools() []MCPTool {
	return []MCPTool{
		{
			Name:        "edit_project",
			Description: "Edit a project's name and/or description",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{
						"type":        "string",
						"description": "The ID of the project to edit",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "New name for the project (optional)",
					},
					"description": map[string]interface{}{
						"type":        "string",
						"description": "New description for the project (optional)",
					},
				},
				"required": []string{"project_id"},
			},
		},
		{
			Name:        "add_clip",
			Description: "Add a media asset to the timeline",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{
						"type":        "string",
						"description": "Project ID",
					},
					"asset_id": map[string]interface{}{
						"type":        "string",
						"description": "Media asset ID",
					},
					"track": map[string]interface{}{
						"type":        "string",
						"description": "Track name (default: V1)",
					},
					"start_frame": map[string]interface{}{
						"type":        "number",
						"description": "Start frame (default: auto)",
					},
					"duration_frames": map[string]interface{}{
						"type":        "number",
						"description": "Duration in frames (default: 120)",
					},
				},
				"required": []string{"project_id", "asset_id"},
			},
		},
		{
			Name:        "trim_clip",
			Description: "Trim a clip's start or end frame",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"item_id": map[string]interface{}{
						"type":        "string",
						"description": "Timeline item ID",
					},
					"start_frame": map[string]interface{}{
						"type":        "number",
						"description": "New start frame",
					},
					"duration_frames": map[string]interface{}{
						"type":        "number",
						"description": "New duration in frames",
					},
				},
				"required": []string{"item_id"},
			},
		},
		{
			Name:        "move_clip",
			Description: "Move a clip to a different track or frame",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"item_id": map[string]interface{}{
						"type":        "string",
						"description": "Timeline item ID",
					},
					"track": map[string]interface{}{
						"type":        "string",
						"description": "New track name",
					},
					"start_frame": map[string]interface{}{
						"type":        "number",
						"description": "New start frame",
					},
				},
				"required": []string{"item_id"},
			},
		},
		{
			Name:        "add_transition",
			Description: "Add a transition between two clips",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{
						"type":        "string",
						"description": "Project ID",
					},
					"from_item_id": map[string]interface{}{
						"type":        "string",
						"description": "Source timeline item ID",
					},
					"to_item_id": map[string]interface{}{
						"type":        "string",
						"description": "Target timeline item ID",
					},
					"type": map[string]interface{}{
						"type":        "string",
						"description": "Transition type (dissolve/wipe/fade)",
					},
					"duration_frames": map[string]interface{}{
						"type":        "number",
						"description": "Transition duration in frames (default: 24)",
					},
				},
				"required": []string{"project_id", "from_item_id", "to_item_id", "type"},
			},
		},
		{
			Name:        "read_timeline",
			Description: "Read the current timeline state",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{
						"type":        "string",
						"description": "Project ID",
					},
				},
				"required": []string{"project_id"},
			},
		},
		{
			Name:        "upload_media",
			Description: "Upload a media file to the project",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{
						"type":        "string",
						"description": "Project ID",
					},
					"name": map[string]interface{}{
						"type":        "string",
						"description": "Media file name",
					},
					"kind": map[string]interface{}{
						"type":        "string",
						"description": "Media type (video/audio/image)",
					},
					"src": map[string]interface{}{
						"type":        "string",
						"description": "Media source URL or path",
					},
					"duration_frames": map[string]interface{}{
						"type":        "number",
						"description": "Duration in frames (default: 120)",
					},
				},
				"required": []string{"project_id", "name", "kind", "src"},
			},
		},
		// ── Batch A: 10 new tools ──
		{
			Name:        "list_projects",
			Description: "List all projects",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			Name:        "create_project",
			Description: "Create a new project with name, description, and optional canvas settings",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name":        map[string]interface{}{"type": "string", "description": "Project name"},
					"description": map[string]interface{}{"type": "string", "description": "Project description"},
					"width":       map[string]interface{}{"type": "number", "description": "Canvas width in pixels (default 1920)"},
					"height":      map[string]interface{}{"type": "number", "description": "Canvas height in pixels (default 1080)"},
					"fps":         map[string]interface{}{"type": "number", "description": "Frames per second (default 24)"},
				},
				"required": []string{"name"},
			},
		},
		{
			Name:        "read_project",
			Description: "Read a summary of the project: info + asset count + clip count",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
				},
				"required": []string{"project_id"},
			},
		},
		{
			Name:        "clear_timeline",
			Description: "Remove ALL clips from the timeline. Use when the user asks to start over.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
				},
				"required": []string{"project_id"},
			},
		},
		{
			Name:        "split_item",
			Description: "Split a clip into two at the given absolute frame",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"item_id": map[string]interface{}{"type": "string", "description": "Timeline item ID to split"},
					"at_frame": map[string]interface{}{"type": "number", "description": "Absolute frame to split at"},
				},
				"required": []string{"item_id", "at_frame"},
			},
		},
		{
			Name:        "duplicate_item",
			Description: "Duplicate a clip (the copy is appended to the end of its track)",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"item_id": map[string]interface{}{"type": "string", "description": "Timeline item ID to duplicate"},
				},
				"required": []string{"item_id"},
			},
		},
		{
			Name:        "remove_item",
			Description: "Delete a clip from the timeline. ripple:true closes the gap by shifting later same-track clips left.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"item_id": map[string]interface{}{"type": "string", "description": "Timeline item ID to remove"},
					"ripple":  map[string]interface{}{"type": "boolean", "description": "Shift later same-track clips left to close the gap (default false)"},
				},
				"required": []string{"item_id"},
			},
		},
		{
			Name:        "move_item",
			Description: "Move a clip to a different track and/or start frame",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"item_id":     map[string]interface{}{"type": "string", "description": "Timeline item ID"},
					"track":       map[string]interface{}{"type": "string", "description": "New track name"},
					"start_frame": map[string]interface{}{"type": "number", "description": "New start frame"},
				},
				"required": []string{"item_id"},
			},
		},
		{
			Name:        "update_item_props",
			Description: "Update the props JSON of a timeline item",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"item_id": map[string]interface{}{"type": "string", "description": "Timeline item ID"},
					"props":   map[string]interface{}{"type": "object", "description": "Props object to set (will be JSON-serialized)"},
				},
				"required": []string{"item_id", "props"},
			},
		},
		{
			Name:        "set_item_timing",
			Description: "Retime a clip: change start frame, duration, and/or fade-in/fade-out. Fades stored in props.json.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"item_id":           map[string]interface{}{"type": "string", "description": "Timeline item ID"},
					"start_frame":       map[string]interface{}{"type": "number", "description": "New start frame"},
					"duration_frames":   map[string]interface{}{"type": "number", "description": "New duration in frames"},
					"fade_in_seconds":   map[string]interface{}{"type": "number", "description": "Fade-in in seconds (0 clears)"},
					"fade_out_seconds":  map[string]interface{}{"type": "number", "description": "Fade-out in seconds (0 clears)"},
				},
				"required": []string{"item_id"},
			},
		},
		// ── Batch B: 8 new tools ──
		{
			Name:        "manage_timelines",
			Description: "Manage project timeliness: list, create, duplicate, switch (update name), update (rename/resize), delete.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id":  map[string]interface{}{"type": "string", "description": "Project ID"},
					"action":      map[string]interface{}{"type": "string", "enum": []string{"list", "create", "duplicate", "switch", "update", "delete"}},
					"timeline_id": map[string]interface{}{"type": "string", "description": "Timeline ID (for duplicate/switch/update/delete)"},
					"name":        map[string]interface{}{"type": "string", "description": "Timeline name (for create/update)"},
					"ratio":       map[string]interface{}{"type": "string", "enum": []string{"16:9", "9:16", "1:1", "4:3", "3:4"}, "description": "Aspect ratio (for create/update)"},
					"width":       map[string]interface{}{"type": "number", "description": "Canvas width px"},
					"height":      map[string]interface{}{"type": "number", "description": "Canvas height px"},
					"hidden":      map[string]interface{}{"type": "boolean", "description": "Hide timeline"},
				},
				"required": []string{"project_id", "action"},
			},
		},
		{
			Name:        "edit_track",
			Description: "Manage tracks: create/rename/delete/reorder/set_kind/hide/unhide.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
					"action":     map[string]interface{}{"type": "string", "enum": []string{"create", "rename", "delete", "reorder", "set_kind", "hide", "unhide"}},
					"track_id":   map[string]interface{}{"type": "string", "description": "Track ID"},
					"name":       map[string]interface{}{"type": "string", "description": "Track name"},
					"kind":       map[string]interface{}{"type": "string", "enum": []string{"video", "audio"}},
					"order":      map[string]interface{}{"type": "number", "description": "Order index for reorder"},
				},
				"required": []string{"project_id", "action"},
			},
		},
		{
			Name:        "set_aspect_ratio",
			Description: "Change the project canvas aspect ratio. Updates width/height based on ratio (16:9→1920x1080, 9:16→1080x1920, 1:1→1080x1080, 4:3→1440x1080, 3:4→1080x1440).",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
					"ratio":      map[string]interface{}{"type": "string", "enum": []string{"16:9", "9:16", "1:1", "4:3", "3:4"}},
				},
				"required": []string{"project_id", "ratio"},
			},
		},
		{
			Name:        "list_audio",
			Description: "List available audio assets (music/SFX) that can be placed on audio tracks A1/A2.",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			Name:        "add_audio",
			Description: "Add an audio asset (music/SFX) as a clip on an audio track (A1/A2).",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id":    map[string]interface{}{"type": "string", "description": "Project ID"},
					"audio_name":    map[string]interface{}{"type": "string", "description": "Audio asset name (from list_audio)"},
					"track":         map[string]interface{}{"type": "string", "description": "Audio track (A1 or A2, default A1)"},
					"start_frame":   map[string]interface{}{"type": "number", "description": "Start frame (default: append to end)"},
					"duration_frames": map[string]interface{}{"type": "number", "description": "Duration in frames (default: 120)"},
				},
				"required": []string{"project_id", "audio_name"},
			},
		},
		{
			Name:        "manage_media_pool",
			Description: "Manage project media pool: list, delete, rename assets.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
					"action":     map[string]interface{}{"type": "string", "enum": []string{"list", "delete", "rename"}},
					"asset_id":   map[string]interface{}{"type": "string", "description": "Asset ID (for delete/rename)"},
					"name":       map[string]interface{}{"type": "string", "description": "New name (for rename)"},
				},
				"required": []string{"project_id", "action"},
			},
		},
		{
			Name:        "browse_library",
			Description: "Browse the built-in effects, transitions, zoom presets, and sound effects library.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"type":  map[string]interface{}{"type": "string", "enum": []string{"effects", "transitions", "zoom", "sounds", "all"}},
					"query": map[string]interface{}{"type": "string", "description": "Optional filter keyword"},
				},
			},
		},
		{
			Name:        "manage_design_style",
			Description: "Manage project design styles: list, create (apply), get, update, delete (clear).",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
					"action":     map[string]interface{}{"type": "string", "enum": []string{"list", "get", "apply", "update", "clear"}},
					"style_id":   map[string]interface{}{"type": "string", "description": "Style ID (for get/update/clear)"},
					"name":       map[string]interface{}{"type": "string", "description": "Style name (for apply/update)"},
					"colors":     map[string]interface{}{"type": "object", "description": "Colors JSON object (for apply/update)"},
					"fonts":      map[string]interface{}{"type": "object", "description": "Fonts JSON object (for apply/update)"},
				},
				"required": []string{"project_id", "action"},
			},
		},
		// ── Batch C: 10 new tools ──
		{
			Name:        "list_templates",
			Description: "Discover motion-graphic templates. No args: category list with counts. With category: template names in it.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"category": map[string]interface{}{"type": "string", "description": "Optional category (e.g. title-cards, lower-thirds)"},
				},
			},
		},
		{
			Name:        "search_templates",
			Description: "Fuzzy-search templates by name/category keyword.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{"type": "string", "description": "Search keyword"},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "add_motion_graphic",
			Description: "Add a motion-graphic template as a new clip on the timeline.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id":    map[string]interface{}{"type": "string", "description": "Project ID"},
					"template_name": map[string]interface{}{"type": "string", "description": "Template name (fuzzy match)"},
					"track":         map[string]interface{}{"type": "string", "description": "Track (default V1)"},
					"start_frame":   map[string]interface{}{"type": "number", "description": "Start frame (default: append)"},
					"duration_frames": map[string]interface{}{"type": "number", "description": "Duration override"},
				},
				"required": []string{"project_id", "template_name"},
			},
		},
		{
			Name:        "submit_motion_graphic",
			Description: "Submit an AI motion-graphic generation job. Returns a job_id for tracking.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id":      map[string]interface{}{"type": "string", "description": "Project ID"},
					"prompt":          map[string]interface{}{"type": "string", "description": "What the MG should show/animate"},
					"name":            map[string]interface{}{"type": "string", "description": "Display name"},
					"duration_frames": map[string]interface{}{"type": "number", "description": "Duration in frames (default 90)"},
				},
				"required": []string{"project_id", "prompt"},
			},
		},
		{
			Name:        "read_script",
			Description: "Read the current timeline as a structured markdown script for AI editing.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
				},
				"required": []string{"project_id"},
			},
		},
		{
			Name:        "apply_script",
			Description: "Apply a markdown script to the timeline — creates/updates clips as specified.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
					"script":     map[string]interface{}{"type": "string", "description": "Markdown script content"},
				},
				"required": []string{"project_id", "script"},
			},
		},
		{
			Name:        "submit_render_job",
			Description: "Submit a render/export job for the timeline. Returns a job_id.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"project_id": map[string]interface{}{"type": "string", "description": "Project ID"},
					"format":     map[string]interface{}{"type": "string", "enum": []string{"mp4", "gif", "mp3", "wav", "jpg", "png"}, "description": "Output format (default mp4)"},
					"quality":    map[string]interface{}{"type": "number", "description": "Quality 1-100 (default 80)"},
					"codec":      map[string]interface{}{"type": "string", "enum": []string{"h264", "h265", "vp9", "av1"}, "description": "Video codec (default h264)"},
					"width":      map[string]interface{}{"type": "number", "description": "Output width in pixels (0 = source)"},
					"height":     map[string]interface{}{"type": "number", "description": "Output height in pixels (0 = source)"},
					"fps":        map[string]interface{}{"type": "number", "description": "Output framerate (default 30)"},
					"crf":        map[string]interface{}{"type": "number", "description": "Quality factor 0-51, lower = better (default 23)"},
					"preset":     map[string]interface{}{"type": "string", "enum": []string{"ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"}, "description": "Encoding speed preset (default medium)"},
				},
				"required": []string{"project_id"},
			},
		},
		{
			Name:        "track_export",
			Description: "Track render job progress. action=status/wait/result.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"action":  map[string]interface{}{"type": "string", "enum": []string{"status", "wait", "result"}},
					"job_id":  map[string]interface{}{"type": "string", "description": "Render job ID"},
					"timeout": map[string]interface{}{"type": "number", "description": "Max seconds to wait (default 45)"},
				},
				"required": []string{"action", "job_id"},
			},
		},
		{
			Name:        "openchatcut_status",
			Description: "Return server status: tool count, project count, connected editors.",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			Name:        "ToolSearch",
			Description: "Search available MCP tools by keyword. Returns matching tool names + descriptions.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{"type": "string", "description": "Keyword(s) to search"},
					"limit": map[string]interface{}{"type": "number", "description": "Max results (default 12, max 30)"},
				},
				"required": []string{"query"},
			},
		},
		// ── Generation mode: text-to-video, text-to-image, KB search ──
		{
			Name:        "generate_video",
			Description: "Generate a video from a text prompt using doubao-seedance-2.0 (Ark Agent Plan).",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"prompt":       map[string]interface{}{"type": "string", "description": "Text description of the video to generate"},
					"variant":      map[string]interface{}{"type": "string", "enum": []string{"standard", "fast", "mini"}, "description": "Model variant (default: fast)"},
					"duration":     map[string]interface{}{"type": "number", "description": "Video duration in seconds, 3-15 (default: 5)"},
					"aspect_ratio": map[string]interface{}{"type": "string", "enum": []string{"16:9", "9:16", "1:1"}, "description": "Aspect ratio (default: 16:9)"},
					"resolution":   map[string]interface{}{"type": "string", "enum": []string{"480P", "720P", "1080P"}, "description": "Resolution (default: 720P)"},
					"output_path":  map[string]interface{}{"type": "string", "description": "Output file path (default: seedance_output.mp4)"},
				},
				"required": []string{"prompt"},
			},
		},
		{
			Name:        "generate_image",
			Description: "Generate an image from a text prompt using doubao-seedream-5.0-lite (Ark Agent Plan).",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"prompt":      map[string]interface{}{"type": "string", "description": "Text description of the image to generate"},
					"size":        map[string]interface{}{"type": "string", "description": "Image size e.g. 1920x1920 (default: 1920x1920)"},
					"output_path": map[string]interface{}{"type": "string", "description": "Output file path (default: seedream_output.png)"},
				},
				"required": []string{"prompt"},
			},
		},
		{
			Name:        "kb_search",
			Description: "Semantic search over the knowledge base for characters, scenes, styles, and other assets",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{"type": "string", "description": "Natural language search query"},
					"limit": map[string]interface{}{"type": "number", "description": "Max results (default 5)"},
				},
				"required": []string{"query"},
			},
		},
	}
}

// ExecuteTool executes an MCP tool with the given parameters
func (s *MCPServer) ExecuteTool(toolName string, params map[string]interface{}) (interface{}, error) {
	fn, ok := s.tools[toolName]
	if !ok {
		return nil, fmt.Errorf("unknown tool: %s", toolName)
	}
	return fn(params)
}

// editProject implements the edit_project tool
func (s *MCPServer) editProject(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required and must be a string")
	}

	var namePtr *string
	if name, ok := params["name"].(string); ok {
		namePtr = &name
	}

	var descPtr *string
	if desc, ok := params["description"].(string); ok {
		descPtr = &desc
	}

	project, err := s.store.Update(projectID, namePtr, descPtr)
	if err != nil {
		return nil, fmt.Errorf("failed to update project: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("project not found: %s", projectID)
	}

	return map[string]interface{}{
		"success": true,
		"project": project,
	}, nil
}

// HandleMCPRequest handles a JSON-RPC style MCP request
func (s *MCPServer) HandleMCPRequest(method string, params map[string]interface{}) (interface{}, error) {
	switch method {
	case "tools/list":
		return s.ListTools(), nil
	case "tools/call":
		toolName, ok := params["name"].(string)
		if !ok {
			return nil, fmt.Errorf("missing tool name")
		}
		toolParams, ok := params["arguments"].(map[string]interface{})
		if !ok {
			toolParams = make(map[string]interface{})
		}
		result, err := s.ExecuteTool(toolName, toolParams)
		if err != nil {
			return map[string]interface{}{
				"isError": true,
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": err.Error(),
					},
				},
			}, nil
		}
		resultJSON, err := json.Marshal(result)
		if err != nil {
			return map[string]interface{}{
				"isError": true,
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": "failed to marshal result: " + err.Error(),
					},
				},
			}, nil
		}
		return map[string]interface{}{
			"isError": false,
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": string(resultJSON),
				},
			},
		}, nil
	default:
		return nil, fmt.Errorf("unknown method: %s", method)
	}
}

// addClip implements the add_clip tool
func (s *MCPServer) addClip(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	assetID, ok := params["asset_id"].(string)
	if !ok || assetID == "" {
		return nil, fmt.Errorf("asset_id is required")
	}

	// Get asset
	asset, err := s.store.GetAsset(assetID)
	if err != nil {
		return nil, fmt.Errorf("failed to get asset: %w", err)
	}
	if asset == nil {
		return nil, fmt.Errorf("asset not found: %s", assetID)
	}

	// Get track and frame info
	track := "V1"
	if t, ok := params["track"].(string); ok && t != "" {
		track = t
	}

	startFrame := 0
	if sf, ok := params["start_frame"].(float64); ok {
		startFrame = int(sf)
	}

	durationFrames := 120
	if df, ok := params["duration_frames"].(float64); ok {
		durationFrames = int(df)
	}

	// Create timeline item
	itemID := uuid.New().String()
	item := &TimelineItem{
		ID:             itemID,
		ProjectID:      projectID,
		AssetID:        assetID,
		Name:           asset.Name,
		Kind:           asset.Kind,
		Src:            asset.Src,
		Track:          track,
		StartFrame:     startFrame,
		DurationFrames: durationFrames,
		SrcInFrame:     0,
		Props:          "{}",
	}

	if err := s.store.CreateTimelineItem(item); err != nil {
		return nil, fmt.Errorf("failed to create timeline item: %w", err)
	}

	return map[string]interface{}{
		"success": true,
		"item":    item,
	}, nil
}

// trimClip implements the trim_clip tool
func (s *MCPServer) trimClip(params map[string]interface{}) (interface{}, error) {
	itemID, ok := params["item_id"].(string)
	if !ok || itemID == "" {
		return nil, fmt.Errorf("item_id is required")
	}

	var startFrame *int
	var durationFrames *int

	if sf, ok := params["start_frame"].(float64); ok {
		v := int(sf)
		startFrame = &v
	}
	if df, ok := params["duration_frames"].(float64); ok {
		v := int(df)
		durationFrames = &v
	}

	if err := s.store.UpdateTimelineItem(itemID, nil, startFrame, durationFrames, nil); err != nil {
		return nil, fmt.Errorf("failed to trim clip: %w", err)
	}

	item, err := s.store.GetTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get updated item: %w", err)
	}

	return map[string]interface{}{
		"success": true,
		"item":    item,
	}, nil
}

// moveClip implements the move_clip tool
func (s *MCPServer) moveClip(params map[string]interface{}) (interface{}, error) {
	itemID, ok := params["item_id"].(string)
	if !ok || itemID == "" {
		return nil, fmt.Errorf("item_id is required")
	}

	var track *string
	var startFrame *int

	if t, ok := params["track"].(string); ok && t != "" {
		track = &t
	}
	if sf, ok := params["start_frame"].(float64); ok {
		v := int(sf)
		startFrame = &v
	}

	if err := s.store.UpdateTimelineItem(itemID, track, startFrame, nil, nil); err != nil {
		return nil, fmt.Errorf("failed to move clip: %w", err)
	}

	item, err := s.store.GetTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get updated item: %w", err)
	}

	return map[string]interface{}{
		"success": true,
		"item":    item,
	}, nil
}

// addTransition implements the add_transition tool
func (s *MCPServer) addTransition(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	fromItemID, ok := params["from_item_id"].(string)
	if !ok || fromItemID == "" {
		return nil, fmt.Errorf("from_item_id is required")
	}
	toItemID, ok := params["to_item_id"].(string)
	if !ok || toItemID == "" {
		return nil, fmt.Errorf("to_item_id is required")
	}
	transType, ok := params["type"].(string)
	if !ok || transType == "" {
		return nil, fmt.Errorf("type is required")
	}

	durationFrames := 24
	if df, ok := params["duration_frames"].(float64); ok {
		durationFrames = int(df)
	}

	transID := uuid.New().String()
	trans := &Transition{
		ID:             transID,
		ProjectID:      projectID,
		FromItemID:     fromItemID,
		ToItemID:       toItemID,
		Type:           transType,
		DurationFrames: durationFrames,
	}

	if err := s.store.CreateTransition(trans); err != nil {
		return nil, fmt.Errorf("failed to create transition: %w", err)
	}

	return map[string]interface{}{
		"success":    true,
		"transition": trans,
	}, nil
}

// readTimeline implements the read_timeline tool
func (s *MCPServer) readTimeline(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}

	items, err := s.store.ListTimelineItems(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to list timeline items: %w", err)
	}

	transitions, err := s.store.ListTransitions(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to list transitions: %w", err)
	}

	return map[string]interface{}{
		"success":     true,
		"items":       items,
		"transitions": transitions,
	}, nil
}

// uploadMedia implements the upload_media tool
func (s *MCPServer) uploadMedia(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	name, ok := params["name"].(string)
	if !ok || name == "" {
		return nil, fmt.Errorf("name is required")
	}
	kind, ok := params["kind"].(string)
	if !ok || kind == "" {
		return nil, fmt.Errorf("kind is required")
	}
	src, ok := params["src"].(string)
	if !ok || src == "" {
		return nil, fmt.Errorf("src is required")
	}

	durationFrames := 120
	if df, ok := params["duration_frames"].(float64); ok {
		durationFrames = int(df)
	}

	assetID := uuid.New().String()
	asset := &MediaAsset{
		ID:             assetID,
		ProjectID:      projectID,
		Name:           name,
		Kind:           kind,
		Src:            src,
		DurationFrames: durationFrames,
	}

	if err := s.store.CreateAsset(asset); err != nil {
		return nil, fmt.Errorf("failed to create asset: %w", err)
	}

	return map[string]interface{}{
		"success": true,
		"asset":   asset,
	}, nil
}

// ── Batch A: 10 new tool handlers ─────────────────────────────────────

// listProjects implements the list_projects tool
func (s *MCPServer) listProjects(params map[string]interface{}) (interface{}, error) {
	projects, err := s.store.List()
	if err != nil {
		return nil, fmt.Errorf("failed to list projects: %w", err)
	}
	return map[string]interface{}{
		"success":  true,
		"projects": projects,
	}, nil
}

// createProject implements the create_project tool
func (s *MCPServer) createProject(params map[string]interface{}) (interface{}, error) {
	name, ok := params["name"].(string)
	if !ok || name == "" {
		return nil, fmt.Errorf("name is required")
	}

	description := ""
	if desc, ok := params["description"].(string); ok {
		description = desc
	}

	// width, height, fps are accepted but not stored in DB yet (schema limitation)
	// They could be stored in a project_settings table in the future

	projectID := uuid.New().String()
	project, err := s.store.Create(projectID, name, description)
	if err != nil {
		return nil, fmt.Errorf("failed to create project: %w", err)
	}

	return map[string]interface{}{
		"success": true,
		"project": project,
	}, nil
}

// readProject implements the read_project tool
func (s *MCPServer) readProject(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}

	project, err := s.store.Get(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get project: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("project not found: %s", projectID)
	}

	assetCount, err := s.store.CountAssets(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to count assets: %w", err)
	}

	clipCount, err := s.store.CountTimelineItems(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to count timeline items: %w", err)
	}

	return map[string]interface{}{
		"success":     true,
		"project":     project,
		"asset_count": assetCount,
		"clip_count":  clipCount,
	}, nil
}

// clearTimeline implements the clear_timeline tool
func (s *MCPServer) clearTimeline(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}

	count, err := s.store.DeleteAllTimelineItems(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to clear timeline: %w", err)
	}

	return map[string]interface{}{
		"success":      true,
		"deleted_count": count,
	}, nil
}

// splitItem implements the split_item tool
func (s *MCPServer) splitItem(params map[string]interface{}) (interface{}, error) {
	itemID, ok := params["item_id"].(string)
	if !ok || itemID == "" {
		return nil, fmt.Errorf("item_id is required")
	}

	atFrame, ok := params["at_frame"].(float64)
	if !ok {
		return nil, fmt.Errorf("at_frame is required and must be a number")
	}
	atFrameInt := int(atFrame)

	item, err := s.store.GetTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get item: %w", err)
	}
	if item == nil {
		return nil, fmt.Errorf("item not found: %s", itemID)
	}

	// Validate split point is within the clip
	if atFrameInt <= item.StartFrame || atFrameInt >= item.StartFrame+item.DurationFrames {
		return nil, fmt.Errorf("split frame %d must be within clip range [%d, %d)", atFrameInt, item.StartFrame, item.StartFrame+item.DurationFrames)
	}

	// Calculate new durations
	originalDuration := atFrameInt - item.StartFrame
	splitDuration := item.DurationFrames - originalDuration
	splitSrcInFrame := item.SrcInFrame + originalDuration

	// Update original item duration
	err = s.store.UpdateTimelineItem(itemID, nil, nil, &originalDuration, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to update original item: %w", err)
	}

	// Create new item for the split portion
	newItemID := uuid.New().String()
	newItem := &TimelineItem{
		ID:             newItemID,
		ProjectID:      item.ProjectID,
		AssetID:        item.AssetID,
		Name:           item.Name + " (split)",
		Kind:           item.Kind,
		Src:            item.Src,
		Track:          item.Track,
		StartFrame:     atFrameInt,
		DurationFrames: splitDuration,
		SrcInFrame:     splitSrcInFrame,
		Props:          item.Props,
	}

	if err := s.store.CreateTimelineItem(newItem); err != nil {
		return nil, fmt.Errorf("failed to create split item: %w", err)
	}

	return map[string]interface{}{
		"success":     true,
		"original_id": itemID,
		"split_id":    newItemID,
		"message":     fmt.Sprintf("Split clip at frame %d", atFrameInt),
	}, nil
}

// duplicateItem implements the duplicate_item tool
func (s *MCPServer) duplicateItem(params map[string]interface{}) (interface{}, error) {
	itemID, ok := params["item_id"].(string)
	if !ok || itemID == "" {
		return nil, fmt.Errorf("item_id is required")
	}

	item, err := s.store.GetTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get item: %w", err)
	}
	if item == nil {
		return nil, fmt.Errorf("item not found: %s", itemID)
	}

	// Find end of track
	items, err := s.store.ListTimelineItemsByTrack(item.ProjectID, item.Track)
	if err != nil {
		return nil, fmt.Errorf("failed to list track items: %w", err)
	}

	endFrame := 0
	for _, i := range items {
		if i.StartFrame+i.DurationFrames > endFrame {
			endFrame = i.StartFrame + i.DurationFrames
		}
	}

	// Create duplicate at end of track
	newItemID := uuid.New().String()
	newItem := &TimelineItem{
		ID:             newItemID,
		ProjectID:      item.ProjectID,
		AssetID:        item.AssetID,
		Name:           item.Name + " (copy)",
		Kind:           item.Kind,
		Src:            item.Src,
		Track:          item.Track,
		StartFrame:     endFrame,
		DurationFrames: item.DurationFrames,
		SrcInFrame:     item.SrcInFrame,
		Props:          item.Props,
	}

	if err := s.store.CreateTimelineItem(newItem); err != nil {
		return nil, fmt.Errorf("failed to create duplicate: %w", err)
	}

	return map[string]interface{}{
		"success":     true,
		"original_id": itemID,
		"duplicate_id": newItemID,
		"start_frame": endFrame,
	}, nil
}

// removeItem implements the remove_item tool
func (s *MCPServer) removeItem(params map[string]interface{}) (interface{}, error) {
	itemID, ok := params["item_id"].(string)
	if !ok || itemID == "" {
		return nil, fmt.Errorf("item_id is required")
	}

	ripple := false
	if r, ok := params["ripple"].(bool); ok {
		ripple = r
	}

	item, err := s.store.GetTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get item: %w", err)
	}
	if item == nil {
		return nil, fmt.Errorf("item not found: %s", itemID)
	}

	itemEndFrame := item.StartFrame + item.DurationFrames

	// Delete the item
	deleted, err := s.store.DeleteTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to delete item: %w", err)
	}
	if !deleted {
		return nil, fmt.Errorf("failed to delete item: %s", itemID)
	}

	// Ripple: shift later same-track items left
	if ripple {
		items, err := s.store.ListTimelineItemsByTrack(item.ProjectID, item.Track)
		if err != nil {
			return nil, fmt.Errorf("failed to list track items for ripple: %w", err)
		}

		shift := item.DurationFrames
		for _, i := range items {
			if i.StartFrame >= itemEndFrame {
				newStart := i.StartFrame - shift
				err := s.store.UpdateTimelineItem(i.ID, nil, &newStart, nil, nil)
				if err != nil {
					return nil, fmt.Errorf("failed to ripple shift item %s: %w", i.ID, err)
				}
			}
		}
	}

	return map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Removed item %s", itemID),
		"ripple":  ripple,
	}, nil
}

// moveItem implements the move_item tool
func (s *MCPServer) moveItem(params map[string]interface{}) (interface{}, error) {
	itemID, ok := params["item_id"].(string)
	if !ok || itemID == "" {
		return nil, fmt.Errorf("item_id is required")
	}

	var track *string
	var startFrame *int

	if t, ok := params["track"].(string); ok && t != "" {
		track = &t
	}
	if sf, ok := params["start_frame"].(float64); ok {
		v := int(sf)
		startFrame = &v
	}

	if err := s.store.UpdateTimelineItem(itemID, track, startFrame, nil, nil); err != nil {
		return nil, fmt.Errorf("failed to move item: %w", err)
	}

	item, err := s.store.GetTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get updated item: %w", err)
	}

	return map[string]interface{}{
		"success": true,
		"item":    item,
	}, nil
}

// updateItemProps implements the update_item_props tool
func (s *MCPServer) updateItemProps(params map[string]interface{}) (interface{}, error) {
	itemID, ok := params["item_id"].(string)
	if !ok || itemID == "" {
		return nil, fmt.Errorf("item_id is required")
	}

	propsObj, ok := params["props"]
	if !ok {
		return nil, fmt.Errorf("props is required")
	}

	propsJSON, err := json.Marshal(propsObj)
	if err != nil {
		return nil, fmt.Errorf("failed to serialize props: %w", err)
	}

	if err := s.store.UpdateTimelineItemProps(itemID, string(propsJSON)); err != nil {
		return nil, fmt.Errorf("failed to update props: %w", err)
	}

	item, err := s.store.GetTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get updated item: %w", err)
	}

	return map[string]interface{}{
		"success": true,
		"item":    item,
	}, nil
}

// setItemTiming implements the set_item_timing tool
func (s *MCPServer) setItemTiming(params map[string]interface{}) (interface{}, error) {
	itemID, ok := params["item_id"].(string)
	if !ok || itemID == "" {
		return nil, fmt.Errorf("item_id is required")
	}

	var startFrame *int
	var durationFrames *int

	if sf, ok := params["start_frame"].(float64); ok {
		v := int(sf)
		startFrame = &v
	}
	if df, ok := params["duration_frames"].(float64); ok {
		v := int(df)
		durationFrames = &v
	}

	// Update timing fields
	if startFrame != nil || durationFrames != nil {
		if err := s.store.UpdateTimelineItem(itemID, nil, startFrame, durationFrames, nil); err != nil {
			return nil, fmt.Errorf("failed to update timing: %w", err)
		}
	}

	// Update fade-in/fade-out in props
	fadeIn, hasFadeIn := params["fade_in_seconds"].(float64)
	fadeOut, hasFadeOut := params["fade_out_seconds"].(float64)

	if hasFadeIn || hasFadeOut {
		item, err := s.store.GetTimelineItem(itemID)
		if err != nil {
			return nil, fmt.Errorf("failed to get item for props update: %w", err)
		}
		if item == nil {
			return nil, fmt.Errorf("item not found: %s", itemID)
		}

		// Parse existing props
		var propsMap map[string]interface{}
		if item.Props != "" && item.Props != "{}" {
			if err := json.Unmarshal([]byte(item.Props), &propsMap); err != nil {
				propsMap = make(map[string]interface{})
			}
		} else {
			propsMap = make(map[string]interface{})
		}

		if hasFadeIn {
			if fadeIn == 0 {
				delete(propsMap, "fadeIn")
			} else {
				propsMap["fadeIn"] = fadeIn
			}
		}
		if hasFadeOut {
			if fadeOut == 0 {
				delete(propsMap, "fadeOut")
			} else {
				propsMap["fadeOut"] = fadeOut
			}
		}

		propsJSON, err := json.Marshal(propsMap)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal fade props: %w", err)
		}
		if err := s.store.UpdateTimelineItemProps(itemID, string(propsJSON)); err != nil {
			return nil, fmt.Errorf("failed to update fade props: %w", err)
		}
	}

	item, err := s.store.GetTimelineItem(itemID)
	if err != nil {
		return nil, fmt.Errorf("failed to get updated item: %w", err)
	}

	return map[string]interface{}{
		"success": true,
		"item":    item,
	}, nil
}

// ── Batch C: 10 new tool handlers (templates, script, export, status) ─────────────────────────────────────

// listTemplates implements the list_templates tool
func (s *MCPServer) listTemplates(params map[string]interface{}) (interface{}, error) {
	category := ""
	if c, ok := params["category"].(string); ok {
		category = c
	}

	if category == "" {
		// Return category counts
		categories := ListTemplateCategories()
		return map[string]interface{}{
			"success":    true,
			"categories": categories,
			"total":      len(templateCatalog),
		}, nil
	}

	// Return templates in category
	templates := ListTemplatesByCategory(category)
	return map[string]interface{}{
		"success":   true,
		"category":  category,
		"templates": templates,
		"count":     len(templates),
	}, nil
}

// searchTemplates implements the search_templates tool
func (s *MCPServer) searchTemplates(params map[string]interface{}) (interface{}, error) {
	query, ok := params["query"].(string)
	if !ok || query == "" {
		return nil, fmt.Errorf("query is required")
	}

	templates := SearchTemplates(query)
	return map[string]interface{}{
		"success":   true,
		"query":     query,
		"templates": templates,
		"count":     len(templates),
	}, nil
}

// addMotionGraphic implements the add_motion_graphic tool
func (s *MCPServer) addMotionGraphic(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}

	templateName, ok := params["template_name"].(string)
	if !ok || templateName == "" {
		return nil, fmt.Errorf("template_name is required")
	}

	// Find template
	template := FindTemplate(templateName)
	if template == nil {
		return nil, fmt.Errorf("template not found: %s", templateName)
	}

	// Get track and frame info
	track := "V1"
	if t, ok := params["track"].(string); ok && t != "" {
		track = t
	}

	startFrame := 0
	if sf, ok := params["start_frame"].(float64); ok {
		startFrame = int(sf)
	}

	durationFrames := template.Duration
	if df, ok := params["duration_frames"].(float64); ok {
		durationFrames = int(df)
	}

	// Create timeline item
	itemID := uuid.New().String()
	item := &TimelineItem{
		ID:             itemID,
		ProjectID:      projectID,
		AssetID:        "", // No asset for template-based MG
		Name:           template.Name,
		Kind:           "motion-graphic",
		Src:            "", // Template-based, no src
		Track:          track,
		StartFrame:     startFrame,
		DurationFrames: durationFrames,
		SrcInFrame:     0,
		Props:          fmt.Sprintf(`{"template":"%s","category":"%s"}`, template.Name, template.Category),
	}

	if err := s.store.CreateTimelineItem(item); err != nil {
		return nil, fmt.Errorf("failed to create timeline item: %w", err)
	}

	return map[string]interface{}{
		"success":  true,
		"item":     item,
		"template": template,
	}, nil
}

// submitMotionGraphic implements the submit_motion_graphic tool
func (s *MCPServer) submitMotionGraphic(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}

	prompt, ok := params["prompt"].(string)
	if !ok || prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}

	name := "AI Motion Graphic"
	if n, ok := params["name"].(string); ok && n != "" {
		name = n
	}

	durationFrames := 90 // default 3 seconds at 30fps
	if df, ok := params["duration_frames"].(float64); ok {
		durationFrames = int(df)
	}

	// Placeholder job ID (external service not yet implemented)
	jobID := "mg_" + uuid.New().String()[:8]

	return map[string]interface{}{
		"success":         true,
		"job_id":          jobID,
		"status":          "pending",
		"message":         "Motion graphic generation job submitted (placeholder - external service not yet implemented)",
		"project_id":      projectID,
		"prompt":          prompt,
		"name":            name,
		"duration_frames": durationFrames,
	}, nil
}

// readScript implements the read_script tool
func (s *MCPServer) readScript(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}

	items, err := s.store.ListTimelineItems(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to list timeline items: %w", err)
	}

	script := GenerateScript(items)
	return map[string]interface{}{
		"success": true,
		"script":  script,
	}, nil
}

// applyScript implements the apply_script tool
func (s *MCPServer) applyScript(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}

	script, ok := params["script"].(string)
	if !ok || script == "" {
		return nil, fmt.Errorf("script is required")
	}

	actions, err := ParseScript(script)
	if err != nil {
		return nil, fmt.Errorf("failed to parse script: %w", err)
	}

	var created, updated int
	var errors []string

	for _, action := range actions {
		switch action.Type {
		case "create":
			itemID := uuid.New().String()
			item := &TimelineItem{
				ID:             itemID,
				ProjectID:      projectID,
				AssetID:        "",
				Name:           action.Name,
				Kind:           action.Kind,
				Src:            "",
				Track:          action.Track,
				StartFrame:     action.StartFrame,
				DurationFrames: action.DurationFrames,
				SrcInFrame:     0,
				Props:          "{}",
			}
			if err := s.store.CreateTimelineItem(item); err != nil {
				errors = append(errors, fmt.Sprintf("create %s: %v", action.Name, err))
			} else {
				created++
			}

		case "update":
			if err := s.store.UpdateTimelineItem(action.ItemID, &action.Track, &action.StartFrame, &action.DurationFrames, nil); err != nil {
				errors = append(errors, fmt.Sprintf("update %s: %v", action.ItemID, err))
			} else {
				updated++
			}
		}
	}

	result := map[string]interface{}{
		"success": len(errors) == 0,
		"created": created,
		"updated": updated,
		"total":   len(actions),
	}

	if len(errors) > 0 {
		result["errors"] = errors
	}

	return result, nil
}

// submitRenderJob implements the submit_render_job tool
func (s *MCPServer) submitRenderJob(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}

	if s.pm == nil {
		return nil, fmt.Errorf("render pipeline not configured")
	}

	// Verify project exists
	project, err := s.store.Get(projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to get project: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("project not found: %s", projectID)
	}

	// Generate job ID and create the job
	jobID := "render_" + uuid.New().String()[:8]

	// Parse optional render settings from params
	settings := render.DefaultRenderSettings()
	if codec, ok := params["codec"].(string); ok && codec != "" {
		settings.Codec = codec
	}
	if w, ok := params["width"].(float64); ok && w > 0 {
		settings.Width = int(w)
	}
	if h, ok := params["height"].(float64); ok && h > 0 {
		settings.Height = int(h)
	}
	if fps, ok := params["fps"].(float64); ok && fps > 0 {
		settings.FPS = int(fps)
	}
	if crf, ok := params["crf"].(float64); ok && crf > 0 {
		settings.CRF = int(crf)
	}
	if preset, ok := params["preset"].(string); ok && preset != "" {
		settings.Preset = preset
	}

	job := s.pm.CreateJob(jobID, projectID, settings)

	// Start the real render
	if err := s.pm.StartRender(jobID, s.outputDir); err != nil {
		return nil, fmt.Errorf("failed to start render: %w", err)
	}

	return map[string]interface{}{
		"success":    true,
		"job_id":     job.ID,
		"project_id": job.ProjectID,
		"status":     string(job.Status),
		"message":    "Render job submitted and started",
	}, nil
}

// trackExport implements the track_export tool
func (s *MCPServer) trackExport(params map[string]interface{}) (interface{}, error) {
	action, ok := params["action"].(string)
	if !ok || action == "" {
		return nil, fmt.Errorf("action is required (status/wait/result)")
	}

	jobID, ok := params["job_id"].(string)
	if !ok || jobID == "" {
		return nil, fmt.Errorf("job_id is required")
	}

	if s.pm == nil {
		return nil, fmt.Errorf("render pipeline not configured")
	}

	job, found := s.pm.GetJob(jobID)
	if !found {
		return nil, fmt.Errorf("job not found: %s", jobID)
	}

	switch action {
	case "status":
		snap := job.Snapshot()
		result := map[string]interface{}{
			"success":    true,
			"job_id":     snap.ID,
			"project_id": snap.ProjectID,
			"status":     string(snap.Status),
			"progress":   snap.Progress,
		}
		if snap.OutputPath != "" {
			result["output_path"] = snap.OutputPath
		}
		if snap.Error != "" {
			result["error"] = snap.Error
		}
		return result, nil

	case "wait":
		timeout := 45
		if t, ok := params["timeout"].(float64); ok {
			timeout = int(t)
		}
		deadline := time.Now().Add(time.Duration(timeout) * time.Second)
		for time.Now().Before(deadline) {
			snap := job.Snapshot()
			if snap.Status == render.StatusCompleted || snap.Status == render.StatusFailed || snap.Status == render.StatusCancelled {
				result := map[string]interface{}{
					"success":  true,
					"job_id":   snap.ID,
					"status":   string(snap.Status),
					"progress": snap.Progress,
				}
				if snap.OutputPath != "" {
					result["output_path"] = snap.OutputPath
					result["download_url"] = fmt.Sprintf("/api/render/%s/download", snap.ID)
				}
				if snap.Error != "" {
					result["error"] = snap.Error
				}
				return result, nil
			}
			time.Sleep(500 * time.Millisecond)
		}
		// Timeout — return current status
		snap := job.Snapshot()
		return map[string]interface{}{
			"success":  true,
			"job_id":   snap.ID,
			"status":   string(snap.Status),
			"progress": snap.Progress,
			"message":  fmt.Sprintf("Wait timed out after %ds, job still %s", timeout, snap.Status),
		}, nil

	case "result":
		snap := job.Snapshot()
		if snap.Status != render.StatusCompleted {
			return map[string]interface{}{
				"success": true,
				"job_id":  snap.ID,
				"status":  string(snap.Status),
				"message": "Render not completed yet",
			}, nil
		}
		return map[string]interface{}{
			"success":      true,
			"job_id":       snap.ID,
			"status":       string(snap.Status),
			"output_path":  snap.OutputPath,
			"download_url": fmt.Sprintf("/api/render/%s/download", snap.ID),
		}, nil

	default:
		return nil, fmt.Errorf("unknown action: %s (use status/wait/result)", action)
	}
}

// openchatcutStatus implements the openchatcut_status tool
func (s *MCPServer) openchatcutStatus(params map[string]interface{}) (interface{}, error) {
	// Return basic status information
	projects, err := s.store.List()
	if err != nil {
		return nil, fmt.Errorf("failed to list projects: %w", err)
	}

	// Count total tools
	toolCount := len(s.tools)

	// Build editors list (ensure non-nil for clean JSON)
	editors := s.editors
	if editors == nil {
		editors = []map[string]interface{}{}
	}

	return map[string]interface{}{
		"success":       true,
		"status":        "online",
		"tool_count":    toolCount,
		"project_count": len(projects),
		"editors":       editors,
		"message":       "Honcut MCP server is running",
	}, nil
}

// toolSearch implements the ToolSearch tool
func (s *MCPServer) toolSearch(params map[string]interface{}) (interface{}, error) {
	query, ok := params["query"].(string)
	if !ok || query == "" {
		return nil, fmt.Errorf("query is required")
	}

	limit := 12
	if l, ok := params["limit"].(float64); ok && l > 0 {
		limit = int(l)
		if limit > 30 {
			limit = 30
		}
	}

	// Search through registered tools
	query = strings.ToLower(query)
	var matches []MCPTool
	allTools := s.ListTools()

	for _, tool := range allTools {
		if strings.Contains(strings.ToLower(tool.Name), query) ||
			strings.Contains(strings.ToLower(tool.Description), query) {
			matches = append(matches, tool)
			if len(matches) >= limit {
				break
			}
		}
	}

	return map[string]interface{}{
		"success": true,
		"query":   query,
		"tools":   matches,
		"count":   len(matches),
	}, nil
}

// ─── Batch B: Timeline/Track/Audio/Media-Pool/Library/Design-Style ──────

// manageTimelines implements the manage_timelines tool
func (s *MCPServer) manageTimelines(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	action, ok := params["action"].(string)
	if !ok {
		return nil, fmt.Errorf("action is required (list/create/duplicate/switch/update/delete)")
	}

	switch action {
	case "list":
		timelines, err := s.store.ListTimelines(projectID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"timelines": timelines}, nil

	case "create":
		name, _ := params["name"].(string)
		if name == "" {
			name = "Timeline 1"
		}
		fps := 24
		if v, ok := params["fps"].(float64); ok {
			fps = int(v)
		}
		width := 1920
		if v, ok := params["width"].(float64); ok {
			width = int(v)
		}
		height := 1080
		if v, ok := params["height"].(float64); ok {
			height = int(v)
		}
		ratio := "16:9"
		if v, ok := params["ratio"].(string); ok {
			ratio = v
		}

		tl := &Timeline{
			ID:        uuid.New().String(),
			ProjectID: projectID,
			Name:      name,
			FPS:       fps,
			Width:     width,
			Height:    height,
			Ratio:     ratio,
		}
		if err := s.store.CreateTimeline(tl); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "timeline": tl}, nil

	case "update":
		timelineID, _ := params["timeline_id"].(string)
		if timelineID == "" {
			return nil, fmt.Errorf("timeline_id is required for update")
		}
		var namePtr *string
		if v, ok := params["name"].(string); ok {
			namePtr = &v
		}
		var w, h *int
		if v, ok := params["width"].(float64); ok {
			vv := int(v); w = &vv
		}
		if v, ok := params["height"].(float64); ok {
			vv := int(v); h = &vv
		}
		var r *string
		if v, ok := params["ratio"].(string); ok {
			r = &v
		}
		var hidden *bool
		if v, ok := params["hidden"].(bool); ok {
			hidden = &v
		}
		if err := s.store.UpdateTimeline(timelineID, namePtr, w, h, r, hidden); err != nil {
			return nil, err
		}
		tl, _ := s.store.GetTimeline(timelineID)
		return map[string]interface{}{"success": true, "timeline": tl}, nil

	case "delete":
		timelineID, _ := params["timeline_id"].(string)
		if timelineID == "" {
			return nil, fmt.Errorf("timeline_id is required for delete")
		}
		deleted, err := s.store.DeleteTimeline(timelineID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "deleted": deleted}, nil

	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

// editTrack implements the edit_track tool
func (s *MCPServer) editTrack(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	action, ok := params["action"].(string)
	if !ok {
		return nil, fmt.Errorf("action is required (create/rename/delete/reorder/set_kind/hide/unhide)")
	}

	switch action {
	case "list":
		tracks, err := s.store.ListTracks(projectID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"tracks": tracks}, nil

	case "create":
		name, _ := params["name"].(string)
		if name == "" {
			name = "V1"
		}
		kind, _ := params["kind"].(string)
		if kind == "" {
			kind = "video"
		}
		track := &Track{
			ID:        uuid.New().String(),
			ProjectID: projectID,
			Name:      name,
			Kind:      kind,
		}
		if err := s.store.CreateTrack(track); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "track": track}, nil

	case "rename":
		trackID, _ := params["track_id"].(string)
		name, _ := params["name"].(string)
		if trackID == "" || name == "" {
			return nil, fmt.Errorf("track_id and name are required")
		}
		if err := s.store.UpdateTrack(trackID, &name, nil, nil, nil); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true}, nil

	case "set_kind":
		trackID, _ := params["track_id"].(string)
		kind, _ := params["kind"].(string)
		if trackID == "" || kind == "" {
			return nil, fmt.Errorf("track_id and kind are required")
		}
		if err := s.store.UpdateTrack(trackID, nil, &kind, nil, nil); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true}, nil

	case "hide", "unhide":
		trackID, _ := params["track_id"].(string)
		if trackID == "" {
			return nil, fmt.Errorf("track_id is required")
		}
		hidden := action == "hide"
		if err := s.store.UpdateTrack(trackID, nil, nil, nil, &hidden); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true}, nil

	case "delete":
		trackID, _ := params["track_id"].(string)
		if trackID == "" {
			return nil, fmt.Errorf("track_id is required")
		}
		deleted, err := s.store.DeleteTrack(trackID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "deleted": deleted}, nil

	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

// setAspectRatio implements the set_aspect_ratio tool
func (s *MCPServer) setAspectRatio(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	ratio, ok := params["ratio"].(string)
	if !ok {
		return nil, fmt.Errorf("ratio is required (16:9, 9:16, 1:1, 4:3, 3:4)")
	}

	ratioMap := map[string][2]int{
		"16:9": {1920, 1080},
		"9:16": {1080, 1920},
		"1:1":  {1080, 1080},
		"4:3":  {1440, 1080},
		"3:4":  {1080, 1440},
	}
	dims, ok := ratioMap[ratio]
	if !ok {
		return nil, fmt.Errorf("unsupported ratio: %s", ratio)
	}

	timelines, err := s.store.ListTimelines(projectID)
	if err != nil {
		return nil, err
	}
	for _, tl := range timelines {
		w, h := dims[0], dims[1]
		if err := s.store.UpdateTimeline(tl.ID, nil, &w, &h, &ratio, nil); err != nil {
			return nil, err
		}
	}
	return map[string]interface{}{"success": true, "ratio": ratio, "width": dims[0], "height": dims[1]}, nil
}

// listAudio implements the list_audio tool
func (s *MCPServer) listAudio(params map[string]interface{}) (interface{}, error) {
	audio := []map[string]interface{}{
		{"name": "Cinematic Epic", "category": "music", "duration_seconds": 60},
		{"name": "Upbeat Corporate", "category": "music", "duration_seconds": 45},
		{"name": "Ambient Dream", "category": "music", "duration_seconds": 90},
		{"name": "Whoosh Transition", "category": "sfx", "duration_seconds": 2},
		{"name": "Click UI", "category": "sfx", "duration_seconds": 0.5},
		{"name": "Dramatic Hit", "category": "sfx", "duration_seconds": 3},
	}
	return map[string]interface{}{"audio_assets": audio}, nil
}

// addAudio implements the add_audio tool
func (s *MCPServer) addAudio(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	audioName, ok := params["audio_name"].(string)
	if !ok || audioName == "" {
		return nil, fmt.Errorf("audio_name is required")
	}
	track, _ := params["track"].(string)
	if track == "" {
		track = "A1"
	}
	var startFrame int
	if v, ok := params["start_frame"].(float64); ok {
		startFrame = int(v)
	}

	item := &TimelineItem{
		ID:             uuid.New().String(),
		ProjectID:      projectID,
		Name:           audioName,
		Kind:           "audio",
		Track:          track,
		StartFrame:     startFrame,
		DurationFrames: 120,
		Props:          "{}",
	}
	if err := s.store.CreateTimelineItem(item); err != nil {
		return nil, err
	}
	return map[string]interface{}{"success": true, "item": item}, nil
}

// manageMediaPool implements the manage_media_pool tool
func (s *MCPServer) manageMediaPool(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	action, ok := params["action"].(string)
	if !ok {
		return nil, fmt.Errorf("action is required (list/delete/rename)")
	}

	switch action {
	case "list":
		assets, err := s.store.ListAssets(projectID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"assets": assets}, nil

	case "delete":
		assetID, _ := params["asset_id"].(string)
		if assetID == "" {
			return nil, fmt.Errorf("asset_id is required for delete")
		}
		deleted, err := s.store.DeleteAsset(assetID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "deleted": deleted}, nil

	case "rename":
		assetID, _ := params["asset_id"].(string)
		name, _ := params["name"].(string)
		if assetID == "" || name == "" {
			return nil, fmt.Errorf("asset_id and name are required")
		}
		if err := s.store.RenameAsset(assetID, name); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true}, nil

	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

// browseLibrary implements the browse_library tool
func (s *MCPServer) browseLibrary(params map[string]interface{}) (interface{}, error) {
	libType, _ := params["type"].(string)

	result := map[string]interface{}{}
	if libType == "" || libType == "effects" || libType == "all" {
		result["effects"] = []string{"Blur", "Sharpen", "Vignette", "Chromatic Aberration", "Glow", "Noise"}
	}
	if libType == "" || libType == "transitions" || libType == "all" {
		result["transitions"] = []string{"Dissolve", "Wipe", "Fade", "Slide", "Zoom Blur"}
	}
	if libType == "" || libType == "zoom" || libType == "all" {
		result["zoom"] = []string{"Ken Burns Slow", "Dynamic Zoom In", "Smooth Pan"}
	}
	if libType == "" || libType == "sounds" || libType == "all" {
		result["sounds"] = []string{"Whoosh", "Click", "Pop", "Swoosh", "Bell", "Chime"}
	}
	return result, nil
}

// manageDesignStyle implements the manage_design_style tool
func (s *MCPServer) manageDesignStyle(params map[string]interface{}) (interface{}, error) {
	projectID, ok := params["project_id"].(string)
	if !ok || projectID == "" {
		return nil, fmt.Errorf("project_id is required")
	}
	action, ok := params["action"].(string)
	if !ok {
		return nil, fmt.Errorf("action is required (list/get/apply/update/clear)")
	}

	switch action {
	case "list":
		styles, err := s.store.ListDesignStyles(projectID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"styles": styles}, nil

	case "get":
		styleID, _ := params["style_id"].(string)
		if styleID == "" {
			return nil, fmt.Errorf("style_id is required for get")
		}
		ds, err := s.store.GetDesignStyle(styleID)
		if err != nil {
			return nil, err
		}
		if ds == nil {
			return nil, fmt.Errorf("style not found: %s", styleID)
		}
		return map[string]interface{}{"style": ds}, nil

	case "apply", "create":
		name, _ := params["name"].(string)
		if name == "" {
			name = "Default Style"
		}
		ds := &DesignStyle{
			ID:        uuid.New().String(),
			ProjectID: projectID,
			Name:      name,
			Colors:    "{}",
			Fonts:     "{}",
		}
		if colors, ok := params["colors"]; ok {
			if cb, err := json.Marshal(colors); err == nil {
				ds.Colors = string(cb)
			}
		}
		if fonts, ok := params["fonts"]; ok {
			if fb, err := json.Marshal(fonts); err == nil {
				ds.Fonts = string(fb)
			}
		}
		if err := s.store.CreateDesignStyle(ds); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "style": ds}, nil

	case "update":
		styleID, _ := params["style_id"].(string)
		if styleID == "" {
			return nil, fmt.Errorf("style_id is required for update")
		}
		var namePtr *string
		if v, ok := params["name"].(string); ok {
			namePtr = &v
		}
		var colorsPtr, fontsPtr *string
		if c, ok := params["colors"]; ok {
			if cb, err := json.Marshal(c); err == nil {
				s := string(cb); colorsPtr = &s
			}
		}
		if f, ok := params["fonts"]; ok {
			if fb, err := json.Marshal(f); err == nil {
				s := string(fb); fontsPtr = &s
			}
		}
		if err := s.store.UpdateDesignStyle(styleID, namePtr, colorsPtr, fontsPtr); err != nil {
			return nil, err
		}
		ds, _ := s.store.GetDesignStyle(styleID)
		return map[string]interface{}{"success": true, "style": ds}, nil

	case "clear":
		styleID, _ := params["style_id"].(string)
		if styleID == "" {
			return nil, fmt.Errorf("style_id is required for clear")
		}
		deleted, err := s.store.DeleteDesignStyle(styleID)
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "deleted": deleted}, nil

	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

// ─── Generation Mode: text-to-video & text-to-image ──────────────────

// generateVideo creates a video from text prompt using doubao-seedance-2.0
func (s *MCPServer) generateVideo(params map[string]interface{}) (interface{}, error) {
	prompt, ok := params["prompt"].(string)
	if !ok || prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	variant, _ := params["variant"].(string)
	duration := 5
	if v, ok := params["duration"].(float64); ok {
		duration = int(v)
	}
	ratio, _ := params["aspect_ratio"].(string)
	resolution, _ := params["resolution"].(string)
	outputPath, _ := params["output_path"].(string)

	seedance := generate.NewSeedance(s.arkClient)
	result := seedance.Generate(context.Background(), generate.SeedanceInput{
		Prompt:      prompt,
		Variant:     variant,
		Duration:    duration,
		AspectRatio: ratio,
		Resolution:  resolution,
		OutputPath:  outputPath,
	})
	return result, nil
}

// generateImage creates an image from text prompt using doubao-seedream-5.0-lite
func (s *MCPServer) generateImage(params map[string]interface{}) (interface{}, error) {
	prompt, ok := params["prompt"].(string)
	if !ok || prompt == "" {
		return nil, fmt.Errorf("prompt is required")
	}
	size, _ := params["size"].(string)
	outputPath, _ := params["output_path"].(string)

	seedream := generate.NewSeedream(s.arkClient)
	result := seedream.Generate(context.Background(), generate.SeedreamInput{
		Prompt:     prompt,
		Size:       size,
		OutputPath: outputPath,
	})
	return result, nil
}

// kbSearch searches the knowledge base for assets matching a query
func (s *MCPServer) kbSearch(params map[string]interface{}) (interface{}, error) {
	query, ok := params["query"].(string)
	if !ok || query == "" {
		return nil, fmt.Errorf("query is required")
	}
	limit := 5
	if v, ok := params["limit"].(float64); ok {
		limit = int(v)
	}

	qdrant := kb.NewQdrantClient()
	results, err := qdrant.SemanticSearch(context.Background(), query, limit)
	if err != nil {
		return nil, fmt.Errorf("kb search failed: %w", err)
	}
	return map[string]interface{}{
		"success": true,
		"count":   len(results),
		"results": results,
	}, nil
}
