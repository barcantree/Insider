import { App, PluginSettingTab, Setting } from "obsidian";
import type InsiderPlugin from "./main";
import { DEFAULT_SETTINGS, type InsiderSettings } from "./types";

export class InsiderSettingTab extends PluginSettingTab {
	plugin: InsiderPlugin;

	constructor(app: App, plugin: InsiderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("Insider settings").setHeading();

		new Setting(containerEl)
			.setName("DeepSeek API key")
			.setDesc("Stored locally in your vault's plugin data.")
			.addText((text) =>
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.deepseek_api_key)
					.onChange(async (value) => {
						this.plugin.settings.deepseek_api_key = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Folder inside your vault where new notes are written.")
			.addText((text) =>
				text
					.setPlaceholder("To-Process")
					.setValue(this.plugin.settings.output_folder)
					.onChange(async (value) => {
						this.plugin.settings.output_folder = value || "To-Process";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Model")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value || DEFAULT_SETTINGS.model;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("API base URL")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.api_base_url)
					.onChange(async (value) => {
						this.plugin.settings.api_base_url = value || DEFAULT_SETTINGS.api_base_url;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("X/Twitter bearer token")
			.setDesc("Optional — required for X/Twitter sources.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.twitter_bearer_token)
					.onChange(async (value) => {
						this.plugin.settings.twitter_bearer_token = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Custom style prompt")
			.setDesc("Optional extra instructions appended to every generation.")
			.addTextArea((area) => {
				area
					.setValue(this.plugin.settings.custom_style_prompt)
					.onChange(async (value) => {
						this.plugin.settings.custom_style_prompt = value;
						await this.plugin.saveSettings();
					});
				area.inputEl.rows = 3;
			});
	}
}

export function mergeSettings(raw: Partial<InsiderSettings> | undefined): InsiderSettings {
	const base: InsiderSettings = structuredClone(DEFAULT_SETTINGS);
	if (!raw) return base;
	return {
		...base,
		...raw,
		toggles: { ...base.toggles, ...(raw.toggles ?? {}) },
		mode: raw.mode === "summary" ? "summary" : "report",
		related_notes_mode: raw.related_notes_mode === "keyword" ? "keyword" : "snapshot",
	};
}
