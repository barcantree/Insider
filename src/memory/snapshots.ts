import type { NoteSnapshot } from "../types";

export function listSnapshots(snapshots: NoteSnapshot[]): NoteSnapshot[] {
	return snapshots;
}

export function hasSnapshots(snapshots: NoteSnapshot[]): boolean {
	return snapshots.length > 0;
}

export function vaultSnapshotText(snapshots: NoteSnapshot[]): string {
	return snapshots
		.filter((s) => s.summary.trim())
		.map((s) => s.summary)
		.join("\n");
}

export function snapshotsAsContext(snapshots: NoteSnapshot[]): string {
	if (!snapshots.length) return "";
	const lines = ["## Vault memory (snapshots of existing notes)"];
	for (const s of snapshots) {
		lines.push(`### [[${s.title}]] (${s.relative_path})`);
		lines.push(s.summary);
		lines.push("");
	}
	return lines.join("\n");
}

export function replaceSnapshots(
	items: Array<{ relative_path: string; title: string; summary: string }>,
): NoteSnapshot[] {
	const now = new Date().toISOString();
	return items.map((item) => ({
		relative_path: item.relative_path,
		title: item.title,
		summary: item.summary,
		updated_at: now,
	}));
}

export function upsertSnapshot(
	snapshots: NoteSnapshot[],
	relative_path: string,
	title: string,
	summary: string,
): NoteSnapshot[] {
	const now = new Date().toISOString();
	const idx = snapshots.findIndex((s) => s.relative_path === relative_path);
	if (idx >= 0) {
		const updated = [...snapshots];
		updated[idx] = { relative_path, title, summary, updated_at: now };
		return updated;
	}
	return [...snapshots, { relative_path, title, summary, updated_at: now }];
}
