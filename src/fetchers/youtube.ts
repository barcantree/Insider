import { requestUrl } from "obsidian";
import { makeResult } from "./base";

const AUDIO_CUE_RE = /\[(?:music|applause|laughter|silence)\]/gi;

const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip";
const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PREFERRED_LANGS = ["en", "en-US", "en-GB", "en-CA", "en-AU"];

interface CaptionTrack {
	baseUrl?: string;
	languageCode?: string;
	kind?: string;
}

export function extractVideoId(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.hostname === "youtu.be") {
			const id = parsed.pathname.slice(1).split("/")[0];
			if (id) return id;
		}
		if (parsed.hostname.includes("youtube")) {
			if (parsed.pathname === "/watch") {
				const id = parsed.searchParams.get("v");
				if (id) return id;
			}
			if (parsed.pathname.startsWith("/shorts/")) {
				const id = parsed.pathname.split("/")[2];
				if (id) return id;
			}
			if (parsed.pathname.startsWith("/embed/")) {
				const id = parsed.pathname.split("/")[2];
				if (id) return id;
			}
		}
	} catch {
		// fall through
	}
	throw new Error("Not a valid YouTube URL.");
}

function formatTime(seconds: number): string {
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function unescapeYoutubeUrl(url: string): string {
	return url.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}

export function captionTracksFromPlayer(player: Record<string, unknown>): CaptionTrack[] {
	const captions = player.captions as Record<string, unknown> | undefined;
	const renderer = captions?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
	return (renderer?.captionTracks as CaptionTrack[] | undefined) ?? [];
}

function extractJsonObject(html: string, start: number): string | null {
	const open = html.indexOf("{", start);
	if (open < 0) return null;
	let depth = 0;
	for (let i = open; i < html.length; i++) {
		const ch = html[i];
		if (ch === "{") depth++;
		else if (ch === "}") {
			depth--;
			if (depth === 0) return html.slice(open, i + 1);
		}
	}
	return null;
}

function parsePlayerResponseFromHtml(html: string): Record<string, unknown> | null {
	const markers = ["ytInitialPlayerResponse", "var ytInitialPlayerResponse"];
	for (const marker of markers) {
		const idx = html.indexOf(marker);
		if (idx < 0) continue;
		const jsonStr = extractJsonObject(html, idx);
		if (!jsonStr) continue;
		try {
			return JSON.parse(jsonStr) as Record<string, unknown>;
		} catch {
			continue;
		}
	}
	return null;
}

function captionTracksFromHtml(html: string): CaptionTrack[] {
	const player = parsePlayerResponseFromHtml(html);
	if (player) {
		const tracks = captionTracksFromPlayer(player);
		if (tracks.length) return tracks;
	}

	const label = '"captionTracks":';
	const idx = html.indexOf(label);
	if (idx < 0) return [];
	const arrStart = html.indexOf("[", idx + label.length);
	if (arrStart < 0) return [];
	let depth = 0;
	for (let i = arrStart; i < html.length; i++) {
		const ch = html[i];
		if (ch === "[") depth++;
		else if (ch === "]") {
			depth--;
			if (depth === 0) {
				try {
					return JSON.parse(html.slice(arrStart, i + 1)) as CaptionTrack[];
				} catch {
					return [];
				}
			}
		}
	}
	return [];
}

function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
	if (!tracks.length) return null;
	for (const lang of PREFERRED_LANGS) {
		const match = tracks.find((t) => t.languageCode === lang);
		if (match?.baseUrl) return match;
	}
	const manual = tracks.find((t) => t.kind !== "asr" && t.baseUrl);
	if (manual) return manual;
	return tracks.find((t) => t.baseUrl) ?? null;
}

function decodeTranscriptXml(xml: string): Array<{ start: number; text: string }> {
	const segments: Array<{ start: number; text: string }> = [];
	const re = /<text start="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(xml)) !== null) {
		const start = parseFloat(match[1]);
		const text = match[2]
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/<[^>]+>/g, "")
			.trim();
		if (text) segments.push({ start, text });
	}
	return segments;
}

interface Json3Event {
	tStartMs?: number;
	segs?: Array<{ utf8?: string }>;
}

export function decodeTranscriptJson3(json: string): Array<{ start: number; text: string }> {
	const data = JSON.parse(json) as { events?: Json3Event[] };
	const segments: Array<{ start: number; text: string }> = [];
	for (const event of data.events ?? []) {
		const text = (event.segs ?? []).map((s) => s.utf8 ?? "").join("").replace(/\n/g, " ").trim();
		if (!text) continue;
		segments.push({ start: (event.tStartMs ?? 0) / 1000, text });
	}
	return segments;
}

async function innertubePlayerRequest(
	videoId: string,
	client: "ANDROID" | "WEB",
	apiKey?: string,
): Promise<Record<string, unknown>> {
	const url =
		client === "WEB" && apiKey
			? `https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`
			: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

	const clientVersion = client === "ANDROID" ? "20.10.38" : "2.20241120.01.00";
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "*/*",
		"Accept-Language": "en-US,en;q=0.9",
	};

	if (client === "ANDROID") {
		headers["User-Agent"] = ANDROID_UA;
		headers["X-YouTube-Client-Name"] = "3";
		headers["X-YouTube-Client-Version"] = clientVersion;
	} else {
		headers["User-Agent"] = BROWSER_UA;
		headers["X-YouTube-Client-Name"] = "1";
		headers["X-YouTube-Client-Version"] = clientVersion;
	}

	const body = {
		context: {
			client: {
				clientName: client,
				clientVersion,
				hl: "en",
				gl: "US",
				...(client === "ANDROID" ? { androidSdkVersion: 34 } : {}),
			},
		},
		videoId,
	};

	const resp = await requestUrl({
		url,
		method: "POST",
		contentType: "application/json",
		headers,
		body: JSON.stringify(body),
		throw: false,
	});

	if (resp.status >= 400) {
		throw new Error(`Innertube player request failed (${resp.status}).`);
	}

	return resp.json as Record<string, unknown>;
}

async function fetchInnertubeApiKey(): Promise<string | null> {
	const resp = await requestUrl({
		url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
		method: "GET",
		headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
	});
	const html = resp.text ?? "";
	const match = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
	return match?.[1] ?? null;
}

async function fetchCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
	const errors: string[] = [];

	function playabilityHint(player: Record<string, unknown>): string {
		const ps = player.playabilityStatus as { status?: string; reason?: string } | undefined;
		if (!ps?.status) return "";
		return ` (playability: ${ps.status}${ps.reason ? ` — ${ps.reason}` : ""})`;
	}

	// 1. InnerTube ANDROID — most reliable for server-side / Obsidian requests (2025+)
	try {
		const player = await innertubePlayerRequest(videoId, "ANDROID");
		const tracks = captionTracksFromPlayer(player);
		if (tracks.length) return tracks;
		errors.push(`ANDROID innertube: no caption tracks${playabilityHint(player)}`);
	} catch (e) {
		errors.push(`ANDROID innertube: ${e instanceof Error ? e.message : String(e)}`);
	}

	// 2. InnerTube WEB with harvested API key
	try {
		const apiKey = await fetchInnertubeApiKey();
		if (apiKey) {
			const player = await innertubePlayerRequest(videoId, "WEB", apiKey);
			const tracks = captionTracksFromPlayer(player);
			if (tracks.length) return tracks;
			errors.push(`WEB innertube: no caption tracks${playabilityHint(player)}`);
		}
	} catch (e) {
		errors.push(`WEB innertube: ${e instanceof Error ? e.message : String(e)}`);
	}

	// 3. HTML scrape fallback
	try {
		const resp = await requestUrl({
			url: `https://www.youtube.com/watch?v=${videoId}&hl=en`,
			method: "GET",
			headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
		});
		if (resp.status < 400 && resp.text) {
			const tracks = captionTracksFromHtml(resp.text);
			if (tracks.length) return tracks;
			errors.push("HTML scrape: no caption tracks found");
		}
	} catch (e) {
		errors.push(`HTML scrape: ${e instanceof Error ? e.message : String(e)}`);
	}

	console.warn("Insider YouTube caption lookup failed:", errors.join("; "));
	return [];
}

function captionJson3Url(baseUrl: string): string {
	const clean = unescapeYoutubeUrl(baseUrl).replace(/&fmt=[^&]+/g, "");
	const joiner = clean.includes("?") ? "&" : "?";
	return `${clean}${joiner}fmt=json3`;
}

async function fetchTranscriptSegments(track: CaptionTrack): Promise<{
	segments: Array<{ start: number; text: string }>;
	isGenerated: boolean;
}> {
	const baseUrl = unescapeYoutubeUrl(track.baseUrl ?? "");
	if (!baseUrl) throw new Error("Caption track has no URL.");

	const isGenerated = track.kind === "asr";
	const headers = { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" };

	const jsonUrl = captionJson3Url(baseUrl);
	try {
		const jsonResp = await requestUrl({ url: jsonUrl, method: "GET", headers });
		if (jsonResp.status === 200 && jsonResp.text.includes('"events"')) {
			const segments = decodeTranscriptJson3(jsonResp.text);
			if (segments.length) return { segments, isGenerated };
		}
	} catch {
		// fall through to XML
	}

	const xmlResp = await requestUrl({ url: baseUrl, method: "GET", headers });
	if (xmlResp.status >= 400) {
		throw new Error(`Caption download failed (${xmlResp.status}).`);
	}
	const segments = decodeTranscriptXml(xmlResp.text);
	if (!segments.length) {
		throw new Error("Could not parse YouTube transcript (empty caption file).");
	}
	return { segments, isGenerated };
}

export async function fetchYoutube(
	url: string,
	opts: { include_timestamps?: boolean; strip_audio_cues?: boolean } = {},
): Promise<ReturnType<typeof makeResult>> {
	const videoId = extractVideoId(url);
	const warnings: string[] = [];
	const includeTimestamps = opts.include_timestamps ?? true;
	const stripAudioCues = opts.strip_audio_cues ?? true;

	const tracks = await fetchCaptionTracks(videoId);
	const track = pickCaptionTrack(tracks);
	if (!track) {
		throw new Error(
			"No captions available for this video. YouTube may be blocking the request, or the video has no captions.",
		);
	}

	const { segments, isGenerated } = await fetchTranscriptSegments(track);
	if (isGenerated) {
		warnings.push("Using auto-generated captions (no manual track found).");
	} else {
		warnings.push(`Using ${track.languageCode ?? "available"} captions.`);
	}

	const lines: string[] = [];
	for (const seg of segments) {
		let text = seg.text;
		if (stripAudioCues) text = text.replace(AUDIO_CUE_RE, "").trim();
		if (!text) continue;
		lines.push(includeTimestamps ? `[${formatTime(seg.start)}] ${text}` : text);
	}

	const body = lines.join("\n");
	if (!body) throw new Error("Transcript was empty after cleaning.");

	return makeResult({
		content_type: "youtube",
		title: `YouTube ${videoId}`,
		text: body,
		source_url: url,
		metadata: { video_id: videoId, segment_count: segments.length, language: track.languageCode },
		warnings,
	});
}
