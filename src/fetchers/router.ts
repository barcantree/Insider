import { App } from "obsidian";
import type { FetchResult, InsiderSettings } from "../types";
import { fetchPdf } from "./pdf";
import { fetchReddit } from "./reddit";
import { fetchTwitter } from "./twitter";
import { fetchYoutube } from "./youtube";

const YOUTUBE_RE = /(youtube\.com|youtu\.be)/i;
const REDDIT_RE = /(reddit\.com|redd\.it)/i;
const TWITTER_RE = /(twitter\.com|x\.com)/i;

export function detectSource(source: string): string {
	const trimmed = source.trim();
	if (trimmed.toLowerCase().endsWith(".pdf") || trimmed.startsWith("/") || trimmed.startsWith("~")) {
		try {
			const parsed = new URL(trimmed.startsWith("http") ? trimmed : `file://${trimmed}`);
			if (parsed.protocol.startsWith("http") && parsed.pathname.toLowerCase().includes(".pdf")) return "pdf_url";
		} catch {
			// local path
		}
		if (!trimmed.startsWith("http")) return "pdf_file";
	}
	let host = "";
	try {
		host = new URL(trimmed).hostname ?? "";
	} catch {
		if (trimmed.toLowerCase().endsWith(".pdf")) return "pdf_file";
	}
	if (YOUTUBE_RE.test(host)) return "youtube";
	if (REDDIT_RE.test(host)) return "reddit";
	if (TWITTER_RE.test(host)) return "twitter";
	try {
		if (new URL(trimmed).pathname.toLowerCase().endsWith(".pdf")) return "pdf_url";
	} catch {
		// ignore
	}
	throw new Error(`Unsupported source: ${source}`);
}

export async function fetchSource(source: string, settings: InsiderSettings, app: App): Promise<FetchResult> {
	const kind = detectSource(source);
	switch (kind) {
		case "youtube":
			return fetchYoutube(source, {
				include_timestamps: settings.toggles.include_timestamps,
				strip_audio_cues: settings.toggles.strip_audio_cues,
			});
		case "reddit":
			return fetchReddit(source, settings.reddit_max_comments);
		case "twitter":
			return fetchTwitter(source, settings.twitter_bearer_token);
		case "pdf_file":
		case "pdf_url":
			return fetchPdf(source, app);
		default:
			throw new Error(`Unhandled source type: ${kind}`);
	}
}
