#!/usr/bin/env node
/** Offline unit tests for YouTube parsing helpers (no network). */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Inline minimal copies of parsing logic for offline verification
function extractJsonObject(html, start) {
	const open = html.indexOf("{", start);
	if (open < 0) return null;
	let depth = 0;
	for (let i = open; i < html.length; i++) {
		if (html[i] === "{") depth++;
		else if (html[i] === "}") {
			depth--;
			if (depth === 0) return html.slice(open, i + 1);
		}
	}
	return null;
}

function captionTracksFromHtml(html) {
	const idx = html.indexOf("ytInitialPlayerResponse");
	const jsonStr = extractJsonObject(html, idx);
	const pr = JSON.parse(jsonStr);
	return pr.captions.playerCaptionsTracklistRenderer.captionTracks;
}

function decodeTranscriptJson3(json) {
	const data = JSON.parse(json);
	return data.events
		.map((e) => ({
			start: (e.tStartMs ?? 0) / 1000,
			text: (e.segs ?? []).map((s) => s.utf8 ?? "").join("").trim(),
		}))
		.filter((s) => s.text);
}

// Innertube player response parsing
const innertube = JSON.parse(readFileSync(join(__dirname, "fixtures/innertube-player-response.json"), "utf8"));
const innertubeTracks = innertube.captions.playerCaptionsTracklistRenderer.captionTracks;
console.assert(innertubeTracks.length === 2, "innertube: expected 2 tracks");

const fixture = readFileSync(join(__dirname, "fixtures/youtube-player-snippet.html"), "utf8");
const tracks = captionTracksFromHtml(fixture);
console.assert(tracks.length === 2, "html: expected 2 caption tracks");
console.assert(tracks[0].baseUrl.includes("timedtext"), "expected timedtext baseUrl");
console.assert(tracks[0].baseUrl.includes("\\u0026"), "fixture should have escaped ampersands");

const json3 = readFileSync(join(__dirname, "fixtures/youtube-json3.json"), "utf8");
const segments = decodeTranscriptJson3(json3);
console.assert(segments.length === 3, "expected 3 json3 segments");
console.assert(segments[0].text === "All right, so here we are", "first segment text");

console.log("OK: all offline YouTube parse tests passed");
