#!/usr/bin/env node
/**
 * Live integration test — InnerTube ANDROID caption fetch.
 * Usage: node scripts/test-youtube.mjs [videoIdOrUrl]
 */
import https from "https";

const VIDEO = process.argv[2] ?? "jNQXAC9IVRw";
const videoId = VIDEO.includes("youtube") || VIDEO.includes("youtu.be")
	? (VIDEO.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/)?.[1] ?? VIDEO)
	: VIDEO;

const ANDROID_UA = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip";

function post(url, body, headers) {
	return new Promise((resolve, reject) => {
		const u = new URL(url);
		const req = https.request(
			{
				hostname: u.hostname,
				path: u.pathname + u.search,
				method: "POST",
				headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
			},
			(res) => {
				let data = "";
				res.on("data", (c) => (data += c));
				res.on("end", () => resolve({ status: res.statusCode, text: data }));
			},
		);
		req.on("error", reject);
		req.write(body);
		req.end();
	});
}

function get(url) {
	return new Promise((resolve, reject) => {
		https
			.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
				let data = "";
				res.on("data", (c) => (data += c));
				res.on("end", () => resolve({ status: res.statusCode, text: data }));
			})
			.on("error", reject);
	});
}

async function main() {
	console.log(`Testing video: ${videoId}`);

	const body = JSON.stringify({
		context: {
			client: {
				clientName: "ANDROID",
				clientVersion: "20.10.38",
				androidSdkVersion: 34,
				hl: "en",
				gl: "US",
			},
		},
		videoId,
	});

	const player = await post(
		"https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
		body,
		{
			"Content-Type": "application/json",
			"User-Agent": ANDROID_UA,
			"X-YouTube-Client-Name": "3",
			"X-YouTube-Client-Version": "20.10.38",
		},
	);
	console.log(`Innertube status: ${player.status}`);

	const data = JSON.parse(player.text);
	const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
	console.log(`Caption tracks: ${tracks.length}`);

	if (!tracks.length) {
		console.error("FAIL: no tracks. playability:", data?.playabilityStatus?.status);
		process.exit(1);
	}

	const baseUrl = tracks[0].baseUrl.replace(/\\u0026/g, "&");
	const jsonUrl = `${baseUrl}&fmt=json3`;
	const cap = await get(jsonUrl);
	console.log(`Caption fetch status: ${cap.status}`);

	if (cap.text.includes('"events"')) {
		const events = JSON.parse(cap.text).events?.length ?? 0;
		console.log(`OK: ${events} JSON3 events`);
		process.exit(0);
	}
	if (cap.text.includes("<text")) {
		console.log(`OK: XML transcript`);
		process.exit(0);
	}

	console.error("FAIL: unparseable caption response");
	process.exit(1);
}

main().catch((e) => {
	console.error("FAIL:", e);
	process.exit(1);
});
