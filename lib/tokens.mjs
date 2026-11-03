// Estimates what a skill or agent costs in every session: its frontmatter `description`, at about 4 characters per token.

import { existsSync, readFileSync } from "node:fs";

export const estimateTokens = (text) => Math.ceil(text.length / 4);

// Reads `description` from the YAML frontmatter of a SKILL.md or agent .md file. Handles plain, quoted and
// folded (>) or literal (|) values; returns "" when the file or the field is missing.
export const readDescription = (file) => {
	if (!existsSync(file)) {
		return "";
	}
	const frontmatter = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	const lines = frontmatter.split("\n");
	const start = lines.findIndex((line) => line.startsWith("description:"));
	if (start === -1) {
		return "";
	}
	const value = lines[start].slice("description:".length).trim();
	if (/^[>|][+-]?$/.test(value)) {
		const block = [];
		for (const line of lines.slice(start + 1)) {
			if (!/^\s/.test(line)) {
				break;
			}
			block.push(line.trim());
		}
		return block.join(" ");
	}
	return value.replace(/^(["'])(.*)\1$/, "$2");
};

export const descriptionTokens = (file) => estimateTokens(readDescription(file));
