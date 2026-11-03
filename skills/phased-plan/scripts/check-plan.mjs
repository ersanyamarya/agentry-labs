#!/usr/bin/env node
// Checks a phased plan's mechanical rules: phase sections, Value/Done when lines, task table shape, checkboxes, models.
// Usage: node check-plan.mjs <plan.md> [--models "Haiku 5.5,Sonnet 5.5,Opus 5.5"] [--limit N]
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		limit: { type: 'string', default: '15' },
		models: { type: 'string', default: 'Haiku 5.5,Sonnet 5.5,Opus 5.5' },
	},
});

if (positionals.length !== 1) {
	console.error('Usage: node check-plan.mjs <plan.md> [--models "Haiku 5.5,Sonnet 5.5,Opus 5.5"] [--limit N]');
	process.exit(1);
}

const lines = fs.readFileSync(positionals[0], 'utf8').split('\n');
const limit = Number(values.limit);
const allowed = values.models.split(',').map((m) => m.trim());
const priciest = allowed[allowed.length - 1];

const errors = [];
const phases = [];
const priciestRows = [];
const modelCounts = Object.fromEntries(allowed.map((m) => [m, 0]));
let current;

// Unescaped pipes split table cells, even inside backticks.
const cellsOf = (line) => line.replace(/\\\|/g, '\u0000').split('|').slice(1, -1).map((c) => c.trim());

for (const [index, line] of lines.entries()) {
	const n = index + 1;
	const phase = line.match(/^##\s+Phase\s+(\S+?):?\s+(.*)$/);
	if (phase) {
		current = { done: 0, doneWhen: false, line: n, name: `Phase ${phase[1]}: ${phase[2]}`, tasks: 0, value: false };
		phases.push(current);
		continue;
	}
	if (/^##\s/.test(line)) {
		current = undefined;
		continue;
	}
	if (!current) continue;
	if (line.startsWith('**Value:**')) current.value = true;
	if (line.startsWith('**Done when:**')) current.doneWhen = true;
	if (!/^\|\s*\[/.test(line)) continue;

	const cells = cellsOf(line);
	current.tasks += 1;
	if (cells.length !== 3) {
		errors.push(`L${n}: task row has ${cells.length} cells, expected 3 (escape "|" inside a cell as "\\|")`);
		continue;
	}
	const [box, task, model] = cells;
	if (box === '[x]') current.done += 1;
	else if (box !== '[ ]') errors.push(`L${n}: checkbox is "${box}", expected "[ ]" or "[x]"`);
	if (!task) errors.push(`L${n}: empty task description`);
	if (!allowed.includes(model)) errors.push(`L${n}: model "${model}" is not one of ${allowed.join(', ')}`);
	else modelCounts[model] += 1;
	if (model === priciest) priciestRows.push(`L${n} ${current.name.split(':')[0]}: ${task.slice(0, 90)}`);
}

for (const p of phases) {
	if (!p.value) errors.push(`L${p.line}: ${p.name} has no "**Value:**" line`);
	if (!p.doneWhen) errors.push(`L${p.line}: ${p.name} has no "**Done when:**" line`);
	if (p.tasks === 0) errors.push(`L${p.line}: ${p.name} has no task rows`);
}
if (phases.length === 0) errors.push('no "## Phase <n>: <title>" headings found');
for (const heading of ['How to use this plan', 'Decisions log']) {
	if (!lines.some((l) => new RegExp(`^##\\s+${heading}`, 'i').test(l))) errors.push(`missing "## ${heading}" section`);
}

console.log(
	JSON.stringify(
		{
			errors: errors.slice(0, limit),
			errorCount: errors.length,
			models: modelCounts,
			phases: phases.map((p) => `${p.name.slice(0, 60)}: ${p.done}/${p.tasks} done`),
			priciestModelRows: priciestRows.slice(0, limit),
		},
		null,
		2,
	),
);
process.exit(errors.length > 0 ? 1 : 0);
