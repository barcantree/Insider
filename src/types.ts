export interface OutputToggles {
	recommend_note_ideas: boolean;
	compare_existing_notes: boolean;
	estimate_token_usage: boolean;
	include_timestamps: boolean;
	strip_audio_cues: boolean;
}

export interface InsiderSettings {
	deepseek_api_key: string;
	twitter_bearer_token: string;
	output_folder: string;
	model: string;
	api_base_url: string;
	mode: "report" | "summary";
	custom_style_prompt: string;
	related_notes_mode: "snapshot" | "keyword";
	toggles: OutputToggles;
	max_related_notes: number;
	reddit_max_comments: number;
}

export const DEFAULT_TOGGLES: OutputToggles = {
	recommend_note_ideas: true,
	compare_existing_notes: true,
	estimate_token_usage: true,
	include_timestamps: true,
	strip_audio_cues: true,
};

export const DEFAULT_SETTINGS: InsiderSettings = {
	deepseek_api_key: "",
	twitter_bearer_token: "",
	output_folder: "To-Process",
	model: "deepseek-chat",
	api_base_url: "https://api.deepseek.com",
	mode: "report",
	custom_style_prompt: "",
	related_notes_mode: "snapshot",
	toggles: { ...DEFAULT_TOGGLES },
	max_related_notes: 5,
	reddit_max_comments: 30,
};

export interface VaultNote {
	path: string;
	title: string;
	body: string;
	relative_path: string;
}

export interface FetchResult {
	content_type: string;
	title: string;
	text: string;
	source_url: string;
	metadata: Record<string, unknown>;
	warnings: string[];
}

export interface TokenEstimate {
	label: string;
	input_tokens: number;
	output_tokens: number;
	calls: number;
}

export interface NoteSnapshot {
	relative_path: string;
	title: string;
	summary: string;
	updated_at: string;
}

export interface PipelineResult {
	ok: boolean;
	path?: string;
	title?: string;
	warnings?: string[];
	content_type?: string;
	error?: string;
	updated?: number;
	updatedSnapshots?: NoteSnapshot[];
	snapshots?: NoteSnapshot[];
}

export interface InsiderPluginData {
	settings: InsiderSettings;
	snapshots: NoteSnapshot[];
}
