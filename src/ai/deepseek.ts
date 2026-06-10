import { requestUrl } from "obsidian";
import {
	baseSystemPrompt,
	buildUserPrompt,
	noteOutputInstructions,
} from "../prompts";
import { estimateMessagesTokens } from "../tokens";
import type { InsiderSettings, TokenEstimate, VaultNote } from "../types";

const CHUNK_CHARS = 28000;
const MERGE_THRESHOLD = 32000;
const EXPECTED_NOTE_OUTPUT_TOKENS = 2000;
const EXPECTED_SUMMARY_OUTPUT_TOKENS = 900;
const EXPECTED_PARTIAL_OUTPUT_TOKENS = 1400;
const EXPECTED_SNAPSHOT_OUTPUT_TOKENS = 260;
export const EXPECTED_RELATED_LINK_OUTPUT_TOKENS = 900;

export const SNAPSHOT_PROMPT_TEMPLATE = `You are creating a compact semantic snapshot of an Obsidian note for future AI retrieval.

Purpose:
The snapshot will help a future AI system discover related notes, suggest backlinks, compare ideas, and generate new notes. It is not user-facing feedback.

Input:
- Note title: {note_title}
- Relative path: {relative_file_path}
- Note content: {note_content}

Output exactly this format:

## [[{note_title}]]
Path: {relative_file_path}
Core: <one sentence capturing the note's main claim, purpose, situation, factual focus, or way of thinking>
Evidence: <semicolon-separated sources, examples, anecdotes, papers, books, people, personal experiences, formulas, datasets, or "none">
Tethers: <3–6 semicolon-separated trigger phrases for when this note should be resurfaced>

Rules:
- Do not ask the user questions.
- Do not give feedback about the note.
- Do not comment on note quality or clarity.
- Do not invent sources, claims, people, books, studies, formulas, or events.
- Preserve distinctive examples, mechanisms, metaphors, formulas, emotional patterns, factual distinctions, and tensions.
- Keep the snapshot compact and useful for future connection discovery.
- The Path field must exactly match the provided relative path.`;

export const RELATED_LINK_PROMPT_TEMPLATE = `You are an Obsidian vault connection engine.

Purpose:

Use the provided related-note context to find existing notes that would meaningfully enrich the new note. Do not rely only on keyword overlap.

Inputs:

- New note title: {new_note_title}

- New note draft or source material: {new_note_content}

- Related-note mode: {related_note_mode}

- Related-note context: {related_note_context}

Connection lenses:

Use four broad lenses:

1. Idea:

The existing note shares, extends, deepens, or relates to the new note's main idea, focus, question, mechanism, or way of thinking.

2. Evidence:

The existing note uses the same or related source, personal story, anecdote, research paper, book, person, formula, dataset, example, or quoted idea.

3. Application:

One note applies, illustrates, operationalizes, or gives a concrete case of the other.

4. Tension:

The existing note challenges, contrasts with, complicates, or adds a useful limitation to the new note.

Context usage:

- Snapshot mode uses the provided vault snapshot. Snapshot fields such as Core, Evidence, and Tethers show what each note is mainly about, what sources/examples it uses, and when it may be relevant.

- Keyword mode uses only the keyword-selected candidate notes. These notes have already been selected by the keyword search algorithm; your job is to apply the Idea/Evidence/Application/Tension framework to those candidates and explain the strongest useful connections.

Usefulness test:

Only include a related note if linking it would help a future reader understand, apply, question, or deepen the new note.

Selection rules:

- Prefer 3–7 strong related notes.

- Prefer semantic connections over simple keyword overlap.

- Avoid generic connections like "both are about learning" unless the reason is specific.

- Use only notes present in the related-note context.

- Use only note titles in double brackets for direct access instead of folder paths.

- Do not mention missing, deleted, moved, or omitted notes.

- Do not invent notes, titles, sources, or claims.

- Do not ask the user questions.

- Do not give feedback about the vault or note quality.

Output:

Return only validated related notes in this compact format:

Related notes:

- [[Note Title]] | Lens: Idea/Evidence/Application/Tension | Reason: 3-5 sentences.`;

function optionalInstructionsBlock(userPrompt: string): string {
	const prompt = userPrompt.trim();
	if (!prompt) return "";
	return (
		"\n\n## User optional instructions\n" +
		"Apply these optional instructions. If they conflict with the source-generation guidelines, " +
		"these user optional instructions override those guidelines.\n" +
		prompt
	);
}

function getApiKey(settings: InsiderSettings): string {
	const key = settings.deepseek_api_key.trim();
	if (!key) throw new Error("DeepSeek API key missing. Add it in Insider settings.");
	return key;
}

async function complete(settings: InsiderSettings, system: string, user: string): Promise<string> {
	const url = `${settings.api_base_url.replace(/\/$/, "")}/v1/chat/completions`;
	const resp = await requestUrl({
		url,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${getApiKey(settings)}`,
		},
		body: JSON.stringify({
			model: settings.model,
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
			temperature: 0.4,
		}),
	});
	if (resp.status >= 400) {
		throw new Error(`DeepSeek API error (${resp.status}): ${resp.text}`);
	}
	const data = resp.json as { choices?: Array<{ message?: { content?: string } }> };
	const text = (data.choices?.[0]?.message?.content ?? "").trim();
	if (!text) throw new Error("Model returned an empty response.");
	return text;
}

function chunkText(text: string, size = CHUNK_CHARS): string[] {
	if (text.length <= size) return [text];
	const chunks: string[] = [];
	let start = 0;
	while (start < text.length) {
		let end = Math.min(start + size, text.length);
		if (end < text.length) {
			const breakAt = text.lastIndexOf("\n", end);
			if (breakAt > start + size / 2) end = breakAt;
		}
		chunks.push(text.slice(start, end));
		start = end;
	}
	return chunks;
}

export async function generateNote(opts: {
	settings: InsiderSettings;
	source_label: string;
	source_text: string;
	user_prompt?: string;
	related_notes?: VaultNote[];
	related_links?: string;
	source_generation?: boolean;
	source_url?: string;
	content_type?: string;
	question?: string;
	snapshotContext?: string;
}): Promise<{ body: string; warnings: string[] }> {
	const warnings: string[] = [];
	const settings = opts.settings;
	const related = opts.related_notes ?? [];
	const sourceGeneration = opts.source_generation ?? true;
	const system = baseSystemPrompt(settings, sourceGeneration);

	const promptOpts = {
		settings,
		source_label: opts.source_label,
		source_text: opts.source_text,
		user_prompt: opts.user_prompt ?? "",
		related_notes: related,
		related_links: opts.related_links ?? "",
		source_generation: sourceGeneration,
		source_url: opts.source_url ?? "",
		content_type: opts.content_type ?? "",
		question: opts.question ?? "",
		snapshotContext: opts.snapshotContext,
	};

	if (opts.source_text.length <= MERGE_THRESHOLD) {
		const user = buildUserPrompt(promptOpts);
		return { body: await complete(settings, system, user), warnings };
	}

	const chunks = chunkText(opts.source_text);
	warnings.push(`Long source (${opts.source_text.length.toLocaleString()} chars) — processing in ${chunks.length} parts.`);

	const partials: string[] = [];
	for (let i = 0; i < chunks.length; i++) {
		const partialPrompt =
			`This is part ${i + 1}/${chunks.length} of a long source (${opts.source_label}). ` +
			"Produce a detailed partial analysis only. " +
			"Do not include NOTE_TITLE, YAML frontmatter, or final note formatting.\n\n" +
			`# Source: ${opts.source_label}\n\n${chunks[i]}` +
			optionalInstructionsBlock(opts.user_prompt ?? "");
		partials.push(await complete(settings, system, partialPrompt));
	}

	let mergePrompt =
		noteOutputInstructions({
			source_generation: sourceGeneration,
			source_url: opts.source_url,
			content_type: opts.content_type,
			question: opts.question,
		}) +
		"\n\n" +
		`Merge these ${partials.length} partial analyses of '${opts.source_label}' into one cohesive ` +
		"finished note file using the output format above.\n\n" +
		partials.join("\n\n---\n\n") +
		optionalInstructionsBlock(opts.user_prompt ?? "");

	if (settings.toggles.compare_existing_notes && related.length) {
		mergePrompt +=
			"\n\n" +
			buildUserPrompt({ ...promptOpts, source_text: "(see partials above)", user_prompt: "", include_output_instructions: false });
	}

	return { body: await complete(settings, system, mergePrompt), warnings };
}

export function buildSnapshotPrompt(note_title: string, relative_file_path: string, note_content: string): string {
	return SNAPSHOT_PROMPT_TEMPLATE.replace(/\{note_title\}/g, note_title)
		.replace(/\{relative_file_path\}/g, relative_file_path)
		.replace(/\{note_content\}/g, note_content);
}

export async function summarizeForSnapshot(
	settings: InsiderSettings,
	title: string,
	relative_path: string,
	body: string,
): Promise<string> {
	const prompt = buildSnapshotPrompt(title, relative_path, body);
	return complete(settings, "Follow the user's instructions exactly.", prompt);
}

export function buildRelatedLinkPrompt(opts: {
	new_note_title: string;
	new_note_content: string;
	related_note_context: string;
	related_note_mode: string;
}): string {
	return RELATED_LINK_PROMPT_TEMPLATE.replace("{new_note_title}", opts.new_note_title)
		.replace("{new_note_content}", opts.new_note_content)
		.replace("{related_note_context}", opts.related_note_context)
		.replace("{related_note_mode}", opts.related_note_mode);
}

export async function recommendRelatedLinks(
	settings: InsiderSettings,
	opts: {
		new_note_title: string;
		new_note_content: string;
		related_note_context: string;
		related_note_mode: string;
	},
): Promise<string> {
	const prompt = buildRelatedLinkPrompt(opts);
	return complete(settings, "Follow the user's instructions exactly.", prompt);
}

export function estimateGenerateNoteTokens(opts: {
	settings: InsiderSettings;
	source_label: string;
	source_text: string;
	user_prompt?: string;
	related_notes?: VaultNote[];
	related_links?: string;
	source_generation?: boolean;
	source_url?: string;
	content_type?: string;
	question?: string;
	snapshotContext?: string;
}): TokenEstimate[] {
	const settings = opts.settings;
	const related = opts.related_notes ?? [];
	const sourceGeneration = opts.source_generation ?? true;
	const system = baseSystemPrompt(settings, sourceGeneration);
	const expectedOutput = settings.mode === "report" ? EXPECTED_NOTE_OUTPUT_TOKENS : EXPECTED_SUMMARY_OUTPUT_TOKENS;

	const promptOpts = {
		settings,
		source_label: opts.source_label,
		source_text: opts.source_text,
		user_prompt: opts.user_prompt ?? "",
		related_notes: related,
		related_links: opts.related_links ?? "",
		source_generation: sourceGeneration,
		source_url: opts.source_url ?? "",
		content_type: opts.content_type ?? "",
		question: opts.question ?? "",
		snapshotContext: opts.snapshotContext,
	};

	if (opts.source_text.length <= MERGE_THRESHOLD) {
		const user = buildUserPrompt(promptOpts);
		return [{
			label: "Main note generation",
			input_tokens: estimateMessagesTokens(system, user),
			output_tokens: expectedOutput,
			calls: 1,
		}];
	}

	const chunks = chunkText(opts.source_text);
	const estimates: TokenEstimate[] = chunks.map((chunk, i) => {
		const partialPrompt =
			`This is part ${i + 1}/${chunks.length} of a long source (${opts.source_label}). ` +
			"Produce a detailed partial analysis only.\n\n" +
			`# Source: ${opts.source_label}\n\n${chunk}` +
			optionalInstructionsBlock(opts.user_prompt ?? "");
		return {
			label: `Long-source partial ${i + 1}/${chunks.length}`,
			input_tokens: estimateMessagesTokens(system, partialPrompt),
			output_tokens: EXPECTED_PARTIAL_OUTPUT_TOKENS,
			calls: 1,
		};
	});

	let mergePrompt =
		noteOutputInstructions({
			source_generation: sourceGeneration,
			source_url: opts.source_url,
			content_type: opts.content_type,
			question: opts.question,
		}) +
		"\n\nMerge partial analyses.\n\n" +
		chunks.map(() => "(estimated partial analysis output)").join("\n\n---\n\n");

	if (settings.toggles.compare_existing_notes && related.length) {
		mergePrompt += "\n\n" + buildUserPrompt({ ...promptOpts, source_text: "(see partials above)", user_prompt: "", include_output_instructions: false });
	}

	estimates.push({
		label: "Long-source merge",
		input_tokens: estimateMessagesTokens(system, mergePrompt),
		output_tokens: expectedOutput,
		calls: 1,
	});
	return estimates;
}

export function estimateSnapshotTokens(title: string, relative_path: string, body: string): TokenEstimate {
	const prompt = buildSnapshotPrompt(title, relative_path, body);
	return {
		label: `Snapshot: ${title}`,
		input_tokens: estimateMessagesTokens("Follow the user's instructions exactly.", prompt),
		output_tokens: EXPECTED_SNAPSHOT_OUTPUT_TOKENS,
		calls: 1,
	};
}
