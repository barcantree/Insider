import { App, TFile, normalizePath } from "obsidian";
import type { VaultNote } from "../types";

const FRONTMATTER_RE = /^---\s*\n[\s\S]*?\n---\s*\n/;
const NOTE_TITLE_RE = /^NOTE_TITLE:\s*(.+?)(?:\r?\n|$)/m;
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const ATTACHMENT_DIR_NAMES = new Set(["0attachments", "attachments", "assets", "images"]);
const IMAGE_EMBED_RE = /!\[\[[^\]]+\.(?:png|jpe?g|gif|webp|heic|svg)\]\]|!\[[^\]]*\]\([^)]+\.(?:png|jpe?g|gif|webp|heic|svg)\)/gi;

function stripFrontmatter(text: string): string {
	return text.replace(FRONTMATTER_RE, "").trim();
}

function isAttachmentPath(relativePath: string): boolean {
	const parts = relativePath.split("/");
	return parts.slice(0, -1).some((p) => ATTACHMENT_DIR_NAMES.has(p.toLowerCase()));
}

function isImageOnlyNote(body: string): boolean {
	const withoutEmbeds = body.replace(IMAGE_EMBED_RE, "");
	const withoutComments = withoutEmbeds.replace(/%%[\s\S]*?%%/g, "");
	return Boolean(body.trim()) && !withoutComments.trim();
}

function titleFromFile(file: TFile, raw: string): string {
	const fmMatch = raw.match(/^title:\s*(.+)$/m);
	if (fmMatch) return fmMatch[1].trim();
	return file.basename;
}

export async function listNotes(
	app: App,
	opts: { limit?: number | null; bodyLimit?: number | null; excludeAttachmentNotes?: boolean } = {},
): Promise<VaultNote[]> {
	const limit = opts.limit ?? 500;
	const bodyLimit = opts.bodyLimit ?? 4000;
	const files = app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
	const notes: VaultNote[] = [];

	for (const file of files) {
		if (file.path.split("/").some((p) => p.startsWith("."))) continue;
		if (opts.excludeAttachmentNotes && isAttachmentPath(file.path)) continue;

		const raw = await app.vault.cachedRead(file);
		let body = stripFrontmatter(raw);
		if (opts.excludeAttachmentNotes && isImageOnlyNote(body)) continue;
		if (bodyLimit !== null) body = body.slice(0, bodyLimit);

		notes.push({
			path: file.path,
			title: titleFromFile(file, raw),
			body,
			relative_path: file.path,
		});
		if (limit !== null && notes.length >= limit) break;
	}
	return notes;
}

export function findRelatedNotes(notes: VaultNote[], query: string, limit = 5): VaultNote[] {
	const words = new Set((query.match(/\w{4,}/g) ?? []).map((w) => w.toLowerCase()));
	if (!words.size) return [];

	const scored: Array<{ score: number; note: VaultNote }> = [];
	for (const note of notes.slice(0, 300)) {
		const hay = `${note.title} ${note.body}`.toLowerCase();
		let score = 0;
		for (const w of words) {
			if (hay.includes(w)) score++;
		}
		if (score) scored.push({ score, note });
	}
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit).map((s) => s.note);
}

export function sanitizeFilename(title: string): string {
	const cleaned = title.replace(INVALID_FILENAME_CHARS, "").trim().replace(/\s+/g, " ");
	return cleaned.slice(0, 120) || "Untitled";
}

export function parseGeneratedNote(text: string, fallbackTitle = "Untitled"): { title: string; content: string } {
	let raw = text.trim();
	let title = fallbackTitle;
	const match = raw.match(NOTE_TITLE_RE);
	if (match) {
		title = sanitizeFilename(match[1].trim()) || fallbackTitle;
		raw = raw.slice(match.index! + match[0].length).replace(/^\r?\n/, "");
	}
	if (raw.startsWith("# ")) {
		const firstLine = raw.split("\n", 1)[0].slice(2).trim();
		if (firstLine.toLowerCase() === title.toLowerCase()) {
			raw = raw.includes("\n") ? raw.split("\n").slice(1).join("\n").replace(/^\r?\n/, "") : "";
		}
	}
	return { title, content: raw };
}

async function uniquePath(app: App, folder: string, basename: string): Promise<string> {
	let candidate = normalizePath(`${folder}/${basename}.md`);
	let n = 2;
	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = normalizePath(`${folder}/${basename} (${n}).md`);
		n++;
	}
	return candidate;
}

export async function writeNote(
	app: App,
	outputFolder: string,
	title: string,
	body: string,
): Promise<{ path: string; title: string }> {
	const folder = normalizePath(outputFolder.trim() || "To-Process");
	const folderExists = app.vault.getAbstractFileByPath(folder);
	if (!folderExists) {
		await app.vault.createFolder(folder);
	}

	const parsed = parseGeneratedNote(body, title);
	const filePath = await uniquePath(app, folder, parsed.title);
	await app.vault.create(filePath, parsed.content.trimEnd() + "\n");
	return { path: filePath, title: parsed.title };
}
