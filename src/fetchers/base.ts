import type { FetchResult } from "../types";

export type { FetchResult };

export function makeResult(partial: Omit<FetchResult, "metadata" | "warnings"> & { metadata?: Record<string, unknown>; warnings?: string[] }): FetchResult {
	return {
		metadata: partial.metadata ?? {},
		warnings: partial.warnings ?? [],
		content_type: partial.content_type,
		title: partial.title,
		text: partial.text,
		source_url: partial.source_url,
	};
}
