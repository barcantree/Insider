import { App, TFile, requestUrl } from "obsidian";
import { makeResult } from "./base";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** Minimal PDF text extraction from raw bytes (works for many text-based PDFs). */
function extractTextFromPdfBytes(bytes: ArrayBuffer): { text: string; pageCount: number } {
	const raw = new Uint8Array(bytes);
	const decoder = new TextDecoder("latin1");
	const content = decoder.decode(raw);

	const pageMatches = content.match(/\/Type\s*\/Page\b/g);
	const pageCount = pageMatches?.length ?? 1;

	const textChunks: string[] = [];
	const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
	let match: RegExpExecArray | null;
	while ((match = streamRe.exec(content)) !== null) {
		const stream = match[1];
		const tjMatches = stream.match(/\((?:\\.|[^\\)])*\)\s*Tj/g);
		if (tjMatches) {
			for (const tj of tjMatches) {
				const inner = tj.replace(/\)\s*Tj$/, "").slice(1);
				const decoded = inner
					.replace(/\\n/g, "\n")
					.replace(/\\r/g, "\r")
					.replace(/\\t/g, "\t")
					.replace(/\\\(/g, "(")
					.replace(/\\\)/g, ")")
					.replace(/\\\\/g, "\\");
				if (decoded.trim()) textChunks.push(decoded);
			}
		}
	}

	const text = textChunks.join(" ").replace(/\s+/g, " ").trim();
	if (!text) {
		throw new Error("PDF contains no extractable text (scanned PDFs are not yet supported).");
	}
	return { text, pageCount };
}

export async function fetchPdf(source: string, app?: App): Promise<ReturnType<typeof makeResult>> {
	let bytes: ArrayBuffer;
	let title = "PDF";
	const warnings: string[] = [];

	if (source.startsWith("http://") || source.startsWith("https://")) {
		const resp = await requestUrl({ url: source, method: "GET" });
		if (resp.status >= 400) throw new Error(`PDF download failed (${resp.status}).`);
		bytes = resp.arrayBuffer;
		if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("PDF exceeds 50 MB limit.");
		try {
			title = decodeURIComponent(new URL(source).pathname.split("/").pop()?.replace(/\.pdf$/i, "") ?? "Online PDF");
		} catch {
			title = "Online PDF";
		}
	} else {
		if (!app) throw new Error("Vault PDF paths require the Obsidian app context.");
		const normalized = source.replace(/^\/+/, "");
		const file = app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile) || file.extension !== "pdf") {
			throw new Error(`PDF not found in vault: ${source}`);
		}
		bytes = await app.vault.readBinary(file);
		title = file.basename;
	}

	const { text, pageCount } = extractTextFromPdfBytes(bytes);
	return makeResult({
		content_type: "pdf",
		title,
		text,
		source_url: source,
		metadata: { page_count: pageCount },
		warnings,
	});
}
