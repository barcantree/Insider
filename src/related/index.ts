import {
	buildRelatedLinkPrompt,
	EXPECTED_RELATED_LINK_OUTPUT_TOKENS,
	recommendRelatedLinks,
} from "../ai/deepseek";
import { estimateMessagesTokens } from "../tokens";
import type { InsiderSettings, TokenEstimate, VaultNote } from "../types";
import { listNotes } from "../vault/notes";
import { App } from "obsidian";
import { hasSnapshots, vaultSnapshotText } from "../memory/snapshots";
import type { NoteSnapshot } from "../types";

const RELATED_LINE_RE = /^-\s*\[\[(?<title>[^\]]+)\]\]\s*\|\s*Lens:\s*(?<lens>[^|]+)\|\s*Reason:\s*(?<reason>.+)$/;
const SNAPSHOT_TITLE_RE = /^##\s+\[\[(?<title>[^\]]+)\]\]\s*$/gm;

interface RelatedRecommendation {
	title: string;
	lens: string;
	reason: string;
	note: VaultNote;
}

function normalizeTitle(title: string): string {
	return title.trim().split(/\s+/).join(" ");
}

function snapshotTitles(vaultSnapshot: string): Set<string> {
	const titles = new Set<string>();
	let match: RegExpExecArray | null;
	const re = new RegExp(SNAPSHOT_TITLE_RE.source, SNAPSHOT_TITLE_RE.flags);
	while ((match = re.exec(vaultSnapshot)) !== null) {
		if (match.groups?.title) titles.add(normalizeTitle(match.groups.title));
	}
	return titles;
}

export function parseRelatedRecommendations(text: string): Array<[string, string, string]> {
	const parsed: Array<[string, string, string]> = [];
	for (const line of text.split("\n")) {
		const match = line.trim().match(RELATED_LINE_RE);
		if (!match?.groups) continue;
		const title = normalizeTitle(match.groups.title);
		const lens = match.groups.lens.trim();
		const reason = match.groups.reason.trim();
		if (title) parsed.push([title, lens, reason]);
	}
	return parsed;
}

function validateRelatedRecommendations(
	recommendations: Array<[string, string, string]>,
	vaultNotes: VaultNote[],
	vaultSnapshot: string,
): { validated: RelatedRecommendation[]; warnings: string[] } {
	const notesByTitle = new Map<string, VaultNote>();
	for (const note of vaultNotes) {
		if (note.title.trim()) notesByTitle.set(normalizeTitle(note.title), note);
	}
	const snapTitles = snapshotTitles(vaultSnapshot);
	const validated: RelatedRecommendation[] = [];
	const warnings: string[] = [];
	const seen = new Set<string>();

	for (const [title, lens, reason] of recommendations) {
		if (!title) {
			warnings.push("Dropped an empty related-note recommendation.");
			continue;
		}
		if (seen.has(title)) continue;
		const note = notesByTitle.get(title);
		if (!note) {
			warnings.push(`Dropped nonexistent related-note recommendation: [[${title}]]`);
			continue;
		}
		if (snapTitles.size && !snapTitles.has(title)) {
			warnings.push(`Dropped recommendation not present in vault snapshot: [[${title}]]`);
			continue;
		}
		validated.push({ title, lens, reason, note });
		seen.add(title);
	}
	return { validated, warnings };
}

function candidateNotesContext(notes: VaultNote[]): string {
	const blocks: string[] = [];
	for (const note of notes) {
		blocks.push(`## [[${note.title}]]`);
		blocks.push(`Path: ${note.relative_path}`);
		blocks.push(note.body.slice(0, 2500));
		blocks.push("");
	}
	return blocks.join("\n");
}

function formatValidatedRecommendations(recommendations: RelatedRecommendation[]): string {
	if (!recommendations.length) return "";
	const lines = ["Related notes:"];
	for (const item of recommendations) {
		lines.push(`- [[${item.title}]] | Lens: ${item.lens} | Reason: ${item.reason}`);
	}
	return lines.join("\n");
}

export function estimateRelatedLookupTokens(
	snapshots: NoteSnapshot[],
	new_note_title: string,
	new_note_content: string,
): { estimate: TokenEstimate | null; warnings: string[] } {
	if (!hasSnapshots(snapshots)) {
		return { estimate: null, warnings: ["No snapshots found. Refresh semantic snapshots before snapshot-based linking."] };
	}
	const vaultSnapshot = vaultSnapshotText(snapshots);
	if (!vaultSnapshot.trim()) {
		return { estimate: null, warnings: ["Snapshots exist but contain no usable note snapshots."] };
	}
	const prompt = buildRelatedLinkPrompt({
		new_note_title,
		new_note_content,
		related_note_context: vaultSnapshot,
		related_note_mode: "snapshot",
	});
	return {
		estimate: {
			label: "Snapshot related-note lookup",
			input_tokens: estimateMessagesTokens("Follow the user's instructions exactly.", prompt),
			output_tokens: EXPECTED_RELATED_LINK_OUTPUT_TOKENS,
			calls: 1,
		},
		warnings: [],
	};
}

export function estimateKeywordRelatedLookupTokens(
	new_note_title: string,
	new_note_content: string,
	candidate_notes: VaultNote[],
): TokenEstimate | null {
	if (!candidate_notes.length) return null;
	const prompt = buildRelatedLinkPrompt({
		new_note_title,
		new_note_content,
		related_note_context: candidateNotesContext(candidate_notes),
		related_note_mode: "keyword",
	});
	return {
		label: "Keyword related-note lens mapping",
		input_tokens: estimateMessagesTokens("Follow the user's instructions exactly.", prompt),
		output_tokens: EXPECTED_RELATED_LINK_OUTPUT_TOKENS,
		calls: 1,
	};
}

export async function discoverRelatedNotesFromSnapshot(
	app: App,
	settings: InsiderSettings,
	snapshots: NoteSnapshot[],
	new_note_title: string,
	new_note_content: string,
): Promise<{ notes: VaultNote[]; warnings: string[]; links: string }> {
	if (!hasSnapshots(snapshots)) {
		return { notes: [], warnings: ["No snapshots found. Refresh semantic snapshots before snapshot-based linking."], links: "" };
	}
	const vaultSnapshot = vaultSnapshotText(snapshots);
	if (!vaultSnapshot.trim()) {
		return { notes: [], warnings: ["Snapshots exist but contain no usable note snapshots."], links: "" };
	}

	const raw = await recommendRelatedLinks(settings, {
		new_note_title,
		new_note_content,
		related_note_context: vaultSnapshot,
		related_note_mode: "snapshot",
	});
	const parsed = parseRelatedRecommendations(raw);
	const vaultNotes = await listNotes(app, { limit: null, bodyLimit: null });
	const { validated, warnings } = validateRelatedRecommendations(parsed, vaultNotes, vaultSnapshot);
	const limited = validated.slice(0, settings.max_related_notes);
	return {
		notes: limited.map((v) => v.note),
		warnings,
		links: formatValidatedRecommendations(limited),
	};
}

export async function discoverRelatedNotesFromKeyword(
	settings: InsiderSettings,
	new_note_title: string,
	new_note_content: string,
	candidate_notes: VaultNote[],
): Promise<{ notes: VaultNote[]; warnings: string[]; links: string }> {
	if (!candidate_notes.length) return { notes: [], warnings: [], links: "" };

	const raw = await recommendRelatedLinks(settings, {
		new_note_title,
		new_note_content,
		related_note_context: candidateNotesContext(candidate_notes),
		related_note_mode: "keyword",
	});
	const parsed = parseRelatedRecommendations(raw);
	const { validated, warnings } = validateRelatedRecommendations(parsed, candidate_notes, "");
	const limited = validated.slice(0, settings.max_related_notes);
	return {
		notes: limited.map((v) => v.note),
		warnings,
		links: formatValidatedRecommendations(limited),
	};
}
