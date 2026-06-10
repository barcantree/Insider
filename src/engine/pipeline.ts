import { App } from "obsidian";
import {
	estimateGenerateNoteTokens,
	estimateSnapshotTokens,
	generateNote,
	summarizeForSnapshot,
} from "../ai/deepseek";
import { fetchSource } from "../fetchers/router";
import { replaceSnapshots, snapshotsAsContext, upsertSnapshot } from "../memory/snapshots";
import { DIRECT_QUESTION_USER_PROMPT } from "../prompts";
import {
	discoverRelatedNotesFromKeyword,
	discoverRelatedNotesFromSnapshot,
	estimateKeywordRelatedLookupTokens,
	estimateRelatedLookupTokens,
} from "../related";
import { combineEstimates } from "../tokens";
import type { FetchResult, InsiderSettings, NoteSnapshot, PipelineResult, TokenEstimate } from "../types";
import { findRelatedNotes, listNotes, writeNote } from "../vault/notes";

function titleFromResult(result: FetchResult, userPrompt: string): string {
	if (result.title && !result.title.startsWith("YouTube")) return result.title.slice(0, 80);
	if (userPrompt.trim()) return userPrompt.slice(0, 60).trim() || result.title.slice(0, 80);
	return result.title.slice(0, 80) || "Untitled";
}

async function relatedForNewNote(
	app: App,
	settings: InsiderSettings,
	snapshots: NoteSnapshot[],
	title: string,
	content: string,
	allNotes: Awaited<ReturnType<typeof listNotes>>,
) {
	if (!settings.toggles.compare_existing_notes) {
		return { notes: [], warnings: [] as string[], links: "" };
	}
	if (settings.related_notes_mode === "keyword") {
		const candidates = findRelatedNotes(allNotes, content, settings.max_related_notes);
		return discoverRelatedNotesFromKeyword(settings, title, content, candidates);
	}
	return discoverRelatedNotesFromSnapshot(app, settings, snapshots, title, content);
}

async function relatedLookupEstimates(
	app: App,
	settings: InsiderSettings,
	snapshots: NoteSnapshot[],
	title: string,
	content: string,
	allNotes: Awaited<ReturnType<typeof listNotes>>,
): Promise<{ estimates: TokenEstimate[]; warnings: string[] }> {
	if (!settings.toggles.compare_existing_notes) return { estimates: [], warnings: [] };

	if (settings.related_notes_mode === "keyword") {
		const candidates = findRelatedNotes(allNotes, content, settings.max_related_notes);
		const estimate = estimateKeywordRelatedLookupTokens(title, content, candidates);
		return { estimates: estimate ? [estimate] : [], warnings: [] };
	}

	const { estimate, warnings } = estimateRelatedLookupTokens(snapshots, title, content);
	return { estimates: estimate ? [estimate] : [], warnings };
}

export async function processSource(
	app: App,
	settings: InsiderSettings,
	snapshots: NoteSnapshot[],
	source: string,
	userPrompt = "",
	onTokenEstimate?: (estimates: TokenEstimate[]) => void,
): Promise<PipelineResult> {
	try {
		const fetched = await fetchSource(source, settings, app);
		const title = titleFromResult(fetched, userPrompt);
		const relatedContent = `${fetched.title}\n\n${fetched.text.slice(0, 8000)}\n\n${userPrompt}`;
		const allNotes = await listNotes(app, { limit: 300 });

		if (settings.toggles.estimate_token_usage && onTokenEstimate) {
			const { estimates } = await relatedLookupEstimates(app, settings, snapshots, title, relatedContent, allNotes);
			if (estimates.length) onTokenEstimate(estimates);
		}

		const { notes: related, warnings: relatedWarnings, links: relatedLinks } = await relatedForNewNote(
			app, settings, snapshots, title, relatedContent, allNotes,
		);

		const snapshotContext = snapshotsAsContext(snapshots);

		if (settings.toggles.estimate_token_usage && onTokenEstimate) {
			onTokenEstimate(
				estimateGenerateNoteTokens({
					settings,
					source_label: fetched.title,
					source_text: fetched.text,
					user_prompt: userPrompt,
					related_notes: related,
					related_links: relatedLinks,
					source_url: fetched.source_url,
					content_type: fetched.content_type,
					snapshotContext,
				}),
			);
		}

		const { body, warnings: aiWarnings } = await generateNote({
			settings,
			source_label: fetched.title,
			source_text: fetched.text,
			user_prompt: userPrompt,
			related_notes: related,
			related_links: relatedLinks,
			source_url: fetched.source_url,
			content_type: fetched.content_type,
			snapshotContext,
		});

		const written = await writeNote(app, settings.output_folder, title, body);

		let updatedSnapshots = snapshots;
		for (const note of related) {
			const summary = await summarizeForSnapshot(settings, note.title, note.relative_path, note.body);
			updatedSnapshots = upsertSnapshot(updatedSnapshots, note.relative_path, note.title, summary);
		}

		return {
			ok: true,
			path: written.path,
			title: written.title,
			warnings: [...fetched.warnings, ...relatedWarnings, ...aiWarnings],
			content_type: fetched.content_type,
			updatedSnapshots,
		};
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function processQuestion(
	app: App,
	settings: InsiderSettings,
	snapshots: NoteSnapshot[],
	question: string,
	onTokenEstimate?: (estimates: TokenEstimate[]) => void,
): Promise<PipelineResult> {
	try {
		const title = (question.split("\n")[0] ?? "").slice(0, 80).replace(/\?$/, "") || "Research note";
		const allNotes = await listNotes(app, { limit: 300 });

		if (settings.toggles.estimate_token_usage && onTokenEstimate) {
			const { estimates } = await relatedLookupEstimates(app, settings, snapshots, title, question, allNotes);
			if (estimates.length) onTokenEstimate(estimates);
		}

		const { notes: related, warnings: relatedWarnings, links: relatedLinks } = await relatedForNewNote(
			app, settings, snapshots, title, question, allNotes,
		);

		const snapshotContext = snapshotsAsContext(snapshots);

		if (settings.toggles.estimate_token_usage && onTokenEstimate) {
			onTokenEstimate(
				estimateGenerateNoteTokens({
					settings,
					source_label: "User question",
					source_text: question,
					user_prompt: DIRECT_QUESTION_USER_PROMPT,
					related_notes: related,
					related_links: relatedLinks,
					source_generation: false,
					question,
					snapshotContext,
				}),
			);
		}

		const { body, warnings } = await generateNote({
			settings,
			source_label: "User question",
			source_text: question,
			user_prompt: DIRECT_QUESTION_USER_PROMPT,
			related_notes: related,
			related_links: relatedLinks,
			source_generation: false,
			question,
			snapshotContext,
		});

		const written = await writeNote(app, settings.output_folder, title, body);
		return {
			ok: true,
			path: written.path,
			title: written.title,
			warnings: [...relatedWarnings, ...warnings],
			content_type: "question",
		};
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export function estimateSnapshotRefresh(
	settings: InsiderSettings,
	notes: Awaited<ReturnType<typeof listNotes>>,
): { notes: number; estimate: TokenEstimate } {
	const estimates = notes.map((n) => estimateSnapshotTokens(n.title, n.relative_path, n.body));
	return {
		notes: notes.length,
		estimate: combineEstimates("Snapshot creation", estimates),
	};
}

export async function refreshMemory(
	app: App,
	settings: InsiderSettings,
): Promise<PipelineResult> {
	try {
		const notes = await listNotes(app, { limit: null, bodyLimit: null, excludeAttachmentNotes: true });
		const items: Array<{ relative_path: string; title: string; summary: string }> = [];
		for (const note of notes) {
			const summary = await summarizeForSnapshot(settings, note.title, note.relative_path, note.body);
			items.push({ relative_path: note.relative_path, title: note.title, summary });
		}
		const snapshots = replaceSnapshots(items);
		return { ok: true, updated: snapshots.length, snapshots };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export function shouldShowSnapshotRefresh(settings: InsiderSettings): boolean {
	return settings.toggles.compare_existing_notes && settings.related_notes_mode === "snapshot";
}
