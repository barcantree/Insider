import type { TokenEstimate } from "./types";

const CHARS_PER_TOKEN = 4;
const MESSAGE_OVERHEAD_TOKENS = 8;

export function estimateTokens(text: string): number {
	return text ? Math.max(1, Math.round(text.length / CHARS_PER_TOKEN)) : 0;
}

export function estimateMessagesTokens(system: string, user: string): number {
	return estimateTokens(system) + estimateTokens(user) + MESSAGE_OVERHEAD_TOKENS * 2;
}

export function combineEstimates(label: string, estimates: TokenEstimate[]): TokenEstimate {
	return {
		label,
		input_tokens: estimates.reduce((s, e) => s + e.input_tokens, 0),
		output_tokens: estimates.reduce((s, e) => s + e.output_tokens, 0),
		calls: estimates.reduce((s, e) => s + e.calls, 0),
	};
}

export function totalTokens(e: TokenEstimate): number {
	return e.input_tokens + e.output_tokens;
}

export function formatTokenEstimate(e: TokenEstimate): string {
	const calls = e.calls ? `, ${e.calls} call${e.calls !== 1 ? "s" : ""}` : "";
	return `${e.label}: ~${e.input_tokens.toLocaleString()} input, ~${e.output_tokens.toLocaleString()} output${calls}`;
}
