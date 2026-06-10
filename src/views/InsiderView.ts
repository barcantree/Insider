import { ItemView, Notice, Setting } from "obsidian";
import type InsiderPlugin from "../main";
import { estimateSnapshotRefresh, processQuestion, processSource, refreshMemory, shouldShowSnapshotRefresh } from "../engine/pipeline";
import { listNotes } from "../vault/notes";
import { listSnapshots } from "../memory/snapshots";
import { combineEstimates, formatTokenEstimate, totalTokens } from "../tokens";
import type { TokenEstimate } from "../types";

export const VIEW_TYPE_INSIDER = "insider-sidebar";

export class InsiderView extends ItemView {
	plugin: InsiderPlugin;
	private statusEl!: HTMLElement;
	private snapshotSectionEl!: HTMLElement;
	private busy = false;

	constructor(leaf: ItemView["leaf"], plugin: InsiderPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_INSIDER;
	}

	getDisplayText(): string {
		return "Insider";
	}

	getIcon(): string {
		return "sparkles";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		// no-op
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("insider-view");

		contentEl.createEl("h4", { text: "Insider" });

		this.statusEl = contentEl.createDiv({ cls: "insider-status" });
		this.renderStatus();

		// --- Option 1 ---
		const opt1 = contentEl.createDiv({ cls: "insider-section" });
		opt1.createEl("h5", { text: "1. Generate from URL or PDF" });
		const sourceInput = opt1.createEl("input", {
			type: "text",
			placeholder: "Paste URL or vault PDF path",
			cls: "insider-input",
		});
		const instructionsInput = opt1.createEl("textarea", {
			placeholder: "Optional instructions",
			cls: "insider-textarea",
		});
		instructionsInput.rows = 2;
		const genBtn = opt1.createEl("button", { text: "Generate note", cls: "mod-cta" });
		genBtn.onclick = () => this.run(async () => {
			const source = sourceInput.value.trim();
			if (!source) { new Notice("Enter a URL or PDF path."); return; }
			await this.runSource(source, instructionsInput.value.trim());
		});

		// --- Option 2 ---
		const opt2 = contentEl.createDiv({ cls: "insider-section" });
		opt2.createEl("h5", { text: "2. Ask a question" });
		const questionInput = opt2.createEl("textarea", {
			placeholder: "Ask a question…",
			cls: "insider-textarea",
		});
		questionInput.rows = 4;
		const askBtn = opt2.createEl("button", { text: "Ask and write report", cls: "mod-cta" });
		askBtn.onclick = () => this.run(async () => {
			const question = questionInput.value.trim();
			if (!question) { new Notice("Enter a question."); return; }
			await this.runQuestion(question);
		});

		// --- Options / toggles ---
		const togglesSection = contentEl.createDiv({ cls: "insider-section insider-toggles" });
		togglesSection.createEl("h5", { text: "Options" });
		this.renderToggles(togglesSection);

		// --- Snapshot refresh (conditional) ---
		this.snapshotSectionEl = contentEl.createDiv({ cls: "insider-section insider-snapshot-section" });
		this.renderSnapshotSection();

		contentEl.createEl("p", {
			cls: "insider-hint",
			text: "Settings persist automatically. Configure API key under Settings → Insider.",
		});
	}

	private renderStatus(): void {
		const s = this.plugin.settings;
		const snapCount = listSnapshots(this.plugin.snapshots).length;
		const keyOk = Boolean(s.deepseek_api_key.trim());
		this.statusEl.empty();
		this.statusEl.createEl("span", {
			text: keyOk ? "API key: set" : "API key: missing",
			cls: keyOk ? "insider-ok" : "insider-warn",
		});
		this.statusEl.createEl("span", { text: ` · Output: ${s.output_folder}` });
		this.statusEl.createEl("span", { text: ` · Snapshots: ${snapCount}` });
	}

	private renderToggles(container: HTMLElement): void {
		const s = this.plugin.settings;

		const addToggle = (name: string, desc: string, get: () => boolean, set: (v: boolean) => void) => {
			new Setting(container)
				.setName(name)
				.setDesc(desc)
				.addToggle((t) =>
					t.setValue(get()).onChange(async (v) => {
						set(v);
						await this.plugin.saveSettings();
						this.renderSnapshotSection();
						this.renderStatus();
					}),
				);
		};

		addToggle(
			"Compare with existing notes",
			"Find related vault notes and add compare/contrast context.",
			() => s.toggles.compare_existing_notes,
			(v) => { s.toggles.compare_existing_notes = v; },
		);

		new Setting(container)
			.setName("Related-note algorithm")
			.addDropdown((d) =>
				d
					.addOption("snapshot", "Semantic snapshot")
					.addOption("keyword", "Keyword overlap")
					.setValue(s.related_notes_mode)
					.onChange(async (v) => {
						s.related_notes_mode = v === "keyword" ? "keyword" : "snapshot";
						await this.plugin.saveSettings();
						this.renderSnapshotSection();
					}),
			);

		new Setting(container)
			.setName("Output mode")
			.addDropdown((d) =>
				d
					.addOption("report", "Report")
					.addOption("summary", "Summary")
					.setValue(s.mode)
					.onChange(async (v) => {
						s.mode = v === "summary" ? "summary" : "report";
						await this.plugin.saveSettings();
					}),
			);

		addToggle("Suggested follow-up note ideas", "", () => s.toggles.recommend_note_ideas, (v) => { s.toggles.recommend_note_ideas = v; });
		addToggle("Show token estimates", "", () => s.toggles.estimate_token_usage, (v) => { s.toggles.estimate_token_usage = v; });
		addToggle("YouTube timestamps", "", () => s.toggles.include_timestamps, (v) => { s.toggles.include_timestamps = v; });
		addToggle("Strip audio cues", "Remove [Music], [Applause], etc.", () => s.toggles.strip_audio_cues, (v) => { s.toggles.strip_audio_cues = v; });

		new Setting(container)
			.setName("Max related notes")
			.addSlider((sl) =>
				sl
					.setLimits(0, 10, 1)
					.setValue(s.max_related_notes)
					.setDynamicTooltip()
					.onChange(async (v) => {
						s.max_related_notes = v;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(container)
			.setName("Max Reddit comments")
			.addSlider((sl) =>
				sl
					.setLimits(0, 50, 5)
					.setValue(s.reddit_max_comments)
					.setDynamicTooltip()
					.onChange(async (v) => {
						s.reddit_max_comments = v;
						await this.plugin.saveSettings();
					}),
			);
	}

	private renderSnapshotSection(): void {
		this.snapshotSectionEl.empty();
		if (!shouldShowSnapshotRefresh(this.plugin.settings)) return;

		this.snapshotSectionEl.createEl("h5", { text: "Semantic snapshots" });
		this.snapshotSectionEl.createEl("p", {
			cls: "insider-hint",
			text: "Required for snapshot-based related-note linking. Creates one DeepSeek call per vault note.",
		});
		const refreshBtn = this.snapshotSectionEl.createEl("button", { text: "Refresh semantic snapshots" });
		refreshBtn.onclick = () => this.run(() => this.runSnapshotRefresh());
	}

	private async run(fn: () => Promise<void>): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		try {
			await fn();
		} finally {
			this.busy = false;
		}
	}

	private showTokenEstimates(estimates: TokenEstimate[]): void {
		if (!estimates.length) return;
		const total = combineEstimates("Estimated DeepSeek usage", estimates);
		const lines = estimates.map(formatTokenEstimate);
		lines.push(`Total: ~${totalTokens(total).toLocaleString()} combined`);
		new Notice(lines.join("\n"), 8000);
	}

	private async runSource(source: string, userPrompt: string): Promise<void> {
		if (!this.plugin.settings.deepseek_api_key.trim()) {
			new Notice("Set your DeepSeek API key in Settings → Insider.");
			return;
		}
		new Notice("Fetching and generating…");
		const estimates: TokenEstimate[] = [];
		const result = await processSource(
			this.app,
			this.plugin.settings,
			this.plugin.snapshots,
			source,
			userPrompt,
			(e) => { if (this.plugin.settings.toggles.estimate_token_usage) estimates.push(...e); },
		);

		if (result.updatedSnapshots) {
			this.plugin.snapshots = result.updatedSnapshots;
			await this.plugin.saveSettings();
		}

		if (this.plugin.settings.toggles.estimate_token_usage && estimates.length) {
			this.showTokenEstimates(estimates);
		}

		this.finishResult(result);
		this.renderStatus();
	}

	private async runQuestion(question: string): Promise<void> {
		if (!this.plugin.settings.deepseek_api_key.trim()) {
			new Notice("Set your DeepSeek API key in Settings → Insider.");
			return;
		}
		new Notice("Generating report…");
		const estimates: TokenEstimate[] = [];
		const result = await processQuestion(
			this.app,
			this.plugin.settings,
			this.plugin.snapshots,
			question,
			(e) => { if (this.plugin.settings.toggles.estimate_token_usage) estimates.push(...e); },
		);

		if (this.plugin.settings.toggles.estimate_token_usage && estimates.length) {
			this.showTokenEstimates(estimates);
		}

		this.finishResult(result);
	}

	private async runSnapshotRefresh(): Promise<void> {
		if (!this.plugin.settings.deepseek_api_key.trim()) {
			new Notice("Set your DeepSeek API key in Settings → Insider.");
			return;
		}

		const notes = await listNotes(this.app, { limit: null, bodyLimit: null, excludeAttachmentNotes: true });
		if (this.plugin.settings.toggles.estimate_token_usage) {
			const { notes: count, estimate } = estimateSnapshotRefresh(this.plugin.settings, notes);
			new Notice(`Notes to scan: ${count}\n${formatTokenEstimate(estimate)}`, 8000);
		}

		const confirmed = confirm(
			`Create semantic snapshots for ${notes.length} notes? This calls DeepSeek once per note.`,
		);
		if (!confirmed) return;

		new Notice("Refreshing snapshots… this may take a while.");
		const result = await refreshMemory(this.app, this.plugin.settings);
		if (result.ok && result.snapshots) {
			this.plugin.snapshots = result.snapshots;
			await this.plugin.saveSettings();
			new Notice(`Created/refreshed ${result.updated} semantic snapshots.`);
			this.renderStatus();
		} else {
			new Notice(`Error: ${result.error ?? "Unknown error"}`);
		}
	}

	private finishResult(result: { ok: boolean; path?: string; title?: string; warnings?: string[]; error?: string }): void {
		if (!result.ok) {
			new Notice(`Error: ${result.error ?? "Unknown error"}`);
			return;
		}
		let msg = `Wrote: ${result.path}`;
		if (result.warnings?.length) {
			msg += `\nWarnings: ${result.warnings.slice(0, 3).join("; ")}`;
		}
		new Notice(msg, 6000);
	}
}
