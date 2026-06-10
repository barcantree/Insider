import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { mergeSettings, InsiderSettingTab } from "./settings";
import { type InsiderSettings, type NoteSnapshot } from "./types";
import { InsiderView, VIEW_TYPE_INSIDER } from "./views/InsiderView";

const INSIDER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z"/><path d="M19 13l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z"/></svg>`;

interface StoredData {
	settings?: Partial<InsiderSettings>;
	snapshots?: NoteSnapshot[];
}

export default class InsiderPlugin extends Plugin {
	settings: InsiderSettings = mergeSettings(undefined);
	snapshots: NoteSnapshot[] = [];

	async onload(): Promise<void> {
		addIcon("insider-sparkles", INSIDER_ICON);
		await this.loadSettings();

		this.registerView(VIEW_TYPE_INSIDER, (leaf) => new InsiderView(leaf, this));

		this.addRibbonIcon("insider-sparkles", "Open Insider", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-insider-sidebar",
			name: "Open Insider sidebar",
			callback: () => { void this.activateView(); },
		});

		this.addSettingTab(new InsiderSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_INSIDER);
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as StoredData | null;
		this.settings = mergeSettings(data?.settings);
		this.snapshots = data?.snapshots ?? [];
	}

	async saveSettings(): Promise<void> {
		const data: StoredData = {
			settings: this.settings,
			snapshots: this.snapshots,
		};
		await this.saveData(data);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_INSIDER)[0] ?? null;

		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (!rightLeaf) return;
			await rightLeaf.setViewState({ type: VIEW_TYPE_INSIDER, active: true });
			leaf = rightLeaf;
		}

		workspace.revealLeaf(leaf);
	}
}
