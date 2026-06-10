import { requestUrl } from "obsidian";
import { makeResult } from "./base";

const POST_JSON_RE = /\/r\/([^/]+)\/comments\/([^/]+)/;

function submissionJsonUrl(url: string): string {
	const m = url.match(POST_JSON_RE);
	if (!m) throw new Error("Not a valid Reddit post URL.");
	return `https://www.reddit.com/r/${m[1]}/comments/${m[2]}.json`;
}

export async function fetchReddit(url: string, maxComments = 30): Promise<ReturnType<typeof makeResult>> {
	const jsonUrl = submissionJsonUrl(url);
	const resp = await requestUrl({
		url: jsonUrl,
		method: "GET",
		headers: { "User-Agent": "insider:v1.0 (research tool)" },
	});
	if (resp.status === 404) throw new Error("Reddit post not found or is private.");
	if (resp.status >= 400) throw new Error(`Reddit fetch failed (${resp.status}).`);

	const data = resp.json as Array<{ data: { children: Array<{ kind: string; data: Record<string, unknown> }> } }>;
	const postData = data[0]?.data?.children?.[0]?.data ?? {};
	const title = String(postData.title ?? "Reddit post");
	const selftext = String(postData.selftext ?? "").trim();
	const author = String(postData.author ?? "unknown");
	const subreddit = String(postData.subreddit ?? "");

	const lines = [
		`# ${title}`,
		`**Subreddit:** r/${subreddit}  **Author:** u/${author}`,
		"",
		selftext || "_(link post — see source URL)_",
	];

	const comments = data[1]?.data?.children ?? [];
	const commentLines: string[] = [];
	let count = 0;
	for (const child of comments) {
		if (child.kind !== "t1") continue;
		const c = child.data;
		const body = String(c.body ?? "").trim();
		if (!body || body === "[deleted]" || body === "[removed]") continue;
		commentLines.push(`**u/${String(c.author ?? "?")}:** ${body}`);
		count++;
		if (count >= maxComments) break;
	}

	if (commentLines.length) {
		lines.push("", "## Top comments", "", ...commentLines);
	}

	const warnings: string[] = [];
	if (count >= maxComments) warnings.push(`Comment list capped at ${maxComments}.`);

	return makeResult({
		content_type: "reddit",
		title,
		text: lines.join("\n"),
		source_url: url,
		metadata: { subreddit, comment_count: count },
		warnings,
	});
}
