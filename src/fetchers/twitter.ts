import { requestUrl } from "obsidian";
import { makeResult } from "./base";

const STATUS_RE = /\/status\/(\d+)/;

function extractTweetId(url: string): string {
	try {
		const m = new URL(url).pathname.match(STATUS_RE);
		if (m) return m[1];
	} catch {
		// fall through
	}
	throw new Error("Not a valid X/Twitter status URL.");
}

export async function fetchTwitter(url: string, bearerToken: string): Promise<ReturnType<typeof makeResult>> {
	if (!bearerToken.trim()) {
		throw new Error("X/Twitter requires a bearer token in Insider settings.");
	}

	const tweetId = extractTweetId(url);
	const headers = { Authorization: `Bearer ${bearerToken}` };
	const params = new URLSearchParams({
		"tweet.fields": "created_at,author_id,conversation_id",
		expansions: "author_id",
		"user.fields": "username,name",
	});

	const resp = await requestUrl({
		url: `https://api.twitter.com/2/tweets/${tweetId}?${params}`,
		method: "GET",
		headers,
	});
	if (resp.status === 401) throw new Error("Invalid Twitter bearer token.");
	if (resp.status >= 400) throw new Error(`Twitter API error (${resp.status}).`);

	const payload = resp.json as {
		data?: { id?: string; text?: string; created_at?: string; author_id?: string; conversation_id?: string };
		includes?: { users?: Array<{ id: string; username?: string }> };
	};
	const tweet = payload.data ?? {};
	const users = Object.fromEntries((payload.includes?.users ?? []).map((u) => [u.id, u]));
	const author = users[tweet.author_id ?? ""] ?? {};
	const handle = author.username ?? "unknown";

	const lines = [`**@${handle}** (${tweet.created_at ?? ""})`, "", tweet.text ?? ""];
	const warnings: string[] = [];

	const conversationId = tweet.conversation_id;
	if (conversationId && conversationId !== tweetId) {
		try {
			const threadResp = await requestUrl({
				url: `https://api.twitter.com/2/tweets/search/recent?${new URLSearchParams({
					query: `conversation_id:${conversationId} from:${handle}`,
					"tweet.fields": "created_at",
					max_results: "20",
				})}`,
				method: "GET",
				headers,
			});
			if (threadResp.status === 200) {
				const threadData = (threadResp.json as { data?: Array<{ id: string; text?: string; created_at?: string }> }).data ?? [];
				if (threadData.length > 1) {
					lines.push("", "## Thread");
					for (const t of [...threadData].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
						if (t.id === tweetId) continue;
						lines.push(t.text ?? "", "");
					}
				}
			} else {
				warnings.push("Could not expand full thread (API tier limits may apply).");
			}
		} catch {
			warnings.push("Could not expand full thread.");
		}
	}

	return makeResult({
		content_type: "twitter",
		title: `@${handle} tweet`,
		text: lines.join("\n").trim(),
		source_url: url,
		metadata: { tweet_id: tweetId, author: handle },
		warnings,
	});
}
