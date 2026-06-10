import type { InsiderSettings, VaultNote } from "./types";

export const NOTE_TITLE_RULES = `Filename title requirements (NOTE_TITLE line):
- Clear, specific, and searchable
- Capture the central idea, not just the broad topic
- Avoid clickbait, vague phrases, and decorative wording
- Avoid colon subtitles by default. Use a colon only if the second half adds necessary specificity rather than restating the first half.
- Do not use academic filler like "A Research Note on," "An Analysis of," or "A Reflection on."
- Do not include the note generation date`;

export const MARKDOWN_STYLE_RULES = `Markdown styling rules for the main note body:
- Use clean, readable Markdown.
- Use level 1 headings (\`#\`) for major sections, including sections like \`# Related Notes\` and \`# Future Note Ideas\` if they are included.
- Always leave one blank line after every heading before the section content begins.
- Use a wider range of heading levels (\`##\`, \`###\`, and occasionally deeper levels) when they help organize the note's hierarchy.
- Headings should clarify the structure of the note, not decorate it.
- Use **bold** for key terms, central claims, and important distinctions.
- Use *italics* sparingly for emphasis, especially for nuanced qualifications or conceptual contrasts.
- Use bullet points for lists of ideas, takeaways, examples, implications, or evidence.
- Use numbered lists when sequence, priority, or step-by-step logic matters.
- Use tables when comparing concepts, arguments, tradeoffs, methods, or evidence.
- Start new paragraphs when the focus shifts, when a point needs room to breathe, or when readability improves.
- Paragraph length should follow the complexity of the idea: some paragraphs may be short, while others may be longer when developing a connected argument.
- Avoid unnecessary decorative formatting. Formatting should clarify the note.
- Keep Obsidian compatibility in mind: use standard Markdown and \`[[Note Title]]\` links.
- Do not start the body with a level-1 heading that repeats the NOTE_TITLE.`;

export const DIRECT_QUESTION_USER_PROMPT = `Answer the user's question as a nuanced research-style report.

First, determine the best response mode:
- Reasoning mode: use when the question is conceptual, philosophical, strategic, reflective, or can be answered mainly through logic and careful argument.
- Research mode: use when the question depends on current facts, recent developments, statistics, laws, prices, product/tool comparisons, scientific findings, named external sources, or factual claims that should be verified.
- Hybrid mode: use when the question requires both conceptual reasoning and factual support.

If research mode or hybrid mode is needed, use the provided source material and retrieved sources. Do not pretend to have researched sources that were not provided.

Report requirements:
1. State the question being answered in precise terms.
2. Give a direct answer or thesis early.
3. Break the issue into the most important dimensions.
4. Present competing interpretations or counterarguments.
5. Stress-test the main answer by asking what would make it wrong, incomplete, or misleading.
6. Separate evidence-based claims from reasoning-based claims.
7. Use related notes only when they genuinely deepen, challenge, support, or contextualize the answer.
8. Avoid generic nuance. Every qualification should change how the reader thinks or acts.
9. Do not overclaim. Mark uncertainty clearly.
10. End with a practical takeaway, decision framework, or refined conclusion.

Style:
- Clear, structured, and intellectually honest.
- Prefer precise claims over broad statements.
- Avoid filler phrases.
- Do not ask the user questions unless the task cannot be answered without missing information.`;

const REPORT_MODE_PROMPT = `Write a source-grounded research note based on the provided source material.

Primary goal:
Accurately explain what the source says, how it argues, what evidence it uses, and what should or should not be concluded from it.

Use the source as the primary authority. Do not add outside facts unless they are explicitly included in the input.

Use the following structure as a guide, not a rigid checklist. Include the sections that are relevant to the source. If a section has little useful content, merge it into another section or omit it rather than forcing filler.

Suggested structure:
1. Central thesis:
State the source's main claim, purpose, or conclusion.

2. Context:
Explain the problem, question, debate, or situation the source is responding to.

3. Argument map:
Break down the source's reasoning into its major steps, sections, or moves.

4. Evidence:
Identify the key evidence used: studies, examples, anecdotes, data, cases, demonstrations, formulas, quotations, observations, or personal experiences.

5. Source evaluation:
Evaluate the strength of the source's reasoning based only on the provided material. Note whether the evidence strongly supports the conclusion, only partially supports it, or leaves important gaps.

6. Limitations and uncertainty:
Explain what the source does not prove, where the source is ambiguous, where the material may be incomplete, and what should not be overclaimed.

7. Implications:
Explain the practical, intellectual, or personal takeaways that reasonably follow from the source.

Rules:
- Be faithful to the provided material.
- Clearly separate the source's claims from your own interpretation.
- Do not invent claims, names, citations, studies, statistics, examples, timestamps, formulas, events, or conclusions.
- If the source material is ambiguous, incomplete, auto-transcribed, OCR-derived, or missing context, mark uncertainty briefly and avoid overclaiming.
- Preserve important distinctions, mechanisms, metaphors, examples, tensions, and qualifications.
- Prefer precise claims over generic summaries.
- Do not create related-note links or compare this source to existing vault notes; that will be handled separately.`;

const SUMMARY_MODE_PROMPT = `Write a concise source-grounded summary based on the provided source material.

Primary goal:
Accurately explain the source's main point, important supporting details, and reasonable takeaways without adding unsupported outside information.

Use the following structure as a guide, not a rigid checklist. Include only the parts that are useful for this source. If a part has little relevant content, merge it into another part or omit it rather than forcing filler.

Suggested structure:
1. Main point:
State the source's central claim, purpose, or conclusion.

2. Key takeaways:
List the most important ideas from the source.

3. Evidence or examples:
Identify important evidence, examples, anecdotes, mechanisms, formulas, data, or observations used in the source.

4. Reasonable implications:
Explain what someone can reasonably learn or apply from the source.

5. Do not overclaim:
Briefly state what the source does not prove or where the material is uncertain.

Rules:
- Be faithful to the source.
- Do not add outside facts unless they are explicitly included in the input.
- Clearly separate the source's claims from your own interpretation.
- Do not invent claims, names, citations, studies, statistics, examples, timestamps, formulas, events, or conclusions.
- If the material is ambiguous, incomplete, auto-transcribed, OCR-derived, or missing context, mark uncertainty briefly and avoid overclaiming.
- Prefer precise claims over generic summaries.
- Do not create related-note links or compare this source to existing vault notes; that will be handled separately.`;

export function noteOutputInstructions(opts: {
	source_generation: boolean;
	date_created?: string;
	source_url?: string;
	content_type?: string;
	question?: string;
}): string {
	const created = opts.date_created ?? new Date().toISOString().slice(0, 10);
	const lines = [
		"## Note output format (follow exactly)",
		"",
		"Return only the finished note file content in this order:",
		"1. First line: `NOTE_TITLE: <filename title>`",
		"2. YAML frontmatter block",
		"3. Main note body",
		"",
		"The NOTE_TITLE becomes the Markdown filename. Do not put the note title in frontmatter and do not use it as the body's opening level-1 heading.",
		"",
		NOTE_TITLE_RULES,
		"",
		"### YAML frontmatter",
		`- Include \`date_created: ${created}\``,
		"- Do not include a `title` property",
	];
	if (opts.source_generation) {
		lines.push(
			`- Include \`source_url: "${opts.source_url ?? ""}"\` exactly as provided`,
			`- Include \`content_type: ${opts.content_type ?? ""}`,
			"- Do not include `source` or `source: insider`",
		);
	} else {
		lines.push(
			"- Include `question:` with the user's question verbatim",
			"- Use a YAML block scalar (`|`) if the question spans multiple lines",
			"",
			"User question (copy verbatim into frontmatter):",
			opts.question?.trim() || "(see source text below)",
		);
	}
	lines.push("", MARKDOWN_STYLE_RULES);
	return lines.join("\n");
}

export function baseSystemPrompt(settings: InsiderSettings, sourceGeneration = true): string {
	if (!sourceGeneration) {
		return "You write excellent Obsidian markdown notes.\n";
	}
	return (settings.mode === "report" ? REPORT_MODE_PROMPT : SUMMARY_MODE_PROMPT) + "\n";
}

export function buildUserPrompt(opts: {
	settings: InsiderSettings;
	source_label: string;
	source_text: string;
	user_prompt: string;
	related_notes: VaultNote[];
	related_links?: string;
	source_generation?: boolean;
	source_url?: string;
	content_type?: string;
	question?: string;
	include_output_instructions?: boolean;
	snapshotContext?: string;
}): string {
	const parts: string[] = [];
	const sourceGeneration = opts.source_generation ?? true;
	const includeOutput = opts.include_output_instructions ?? true;

	if (includeOutput) {
		parts.push(
			noteOutputInstructions({
				source_generation: sourceGeneration,
				source_url: opts.source_url,
				content_type: opts.content_type,
				question: opts.question,
			}),
			"",
		);
	}
	parts.push(`# Source: ${opts.source_label}`, "", opts.source_text.trim());

	if (opts.user_prompt.trim()) {
		if (sourceGeneration) {
			parts.push(
				"",
				"## User optional instructions",
				"Apply these optional instructions. If they conflict with the source-generation guidelines, these user optional instructions override those guidelines.",
				opts.user_prompt.trim(),
			);
		} else {
			parts.push("", "## User instructions", opts.user_prompt.trim());
		}
	}

	if (opts.settings.toggles.compare_existing_notes && opts.related_notes.length) {
		parts.push("", "## Related notes in vault (for compare/contrast)");
		for (const note of opts.related_notes) {
			parts.push(`### [[${note.title}]] (${note.relative_path})`);
			parts.push(note.body.slice(0, 2500));
			parts.push("");
		}
	}

	if (opts.settings.toggles.compare_existing_notes && opts.related_links?.trim()) {
		parts.push(
			"",
			"## Validated related note links",
			"Include these validated links in a `# Related Notes` section in the finished note body.",
			opts.related_links.trim(),
		);
	}

	if (opts.snapshotContext) {
		parts.push("", opts.snapshotContext);
	}

	if (opts.settings.toggles.recommend_note_ideas) {
		parts.push(
			"",
			"## Required closing section",
			"End the note with a section titled `# Future Note Ideas` containing 3-5 ",
			"specific [[wiki-style]] note titles the user could create next, each with one sentence explaining why.",
		);
	}

	return parts.join("\n");
}
