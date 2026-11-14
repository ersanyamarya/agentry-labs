#!/usr/bin/env node
// Checks a phased plan: every phase has Value and Done when lines and 3-cell task rows with a checkbox and a known
// model, and every opus row says why. Usage: node check-plan.mjs <plan.md> [--models "haiku,sonnet,opus"]
// A model cell may carry a version suffix (opus-5-5). Prints JSON; exits 1 on errors.
import fs from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { models: { type: 'string', default: 'haiku,sonnet,opus' } },
});
if (positionals.length !== 1) {
	console.error('Usage: node check-plan.mjs <plan.md> [--models "haiku,sonnet,opus"]');
	process.exit(1);
}

const models = values.models.split(',').map((m) => m.trim().toLowerCase());
const priciest = models[models.length - 1];
const errors = [];
const phases = [];
const counts = Object.fromEntries(models.map((m) => [m, 0]));
let phase;

// Unescaped pipes split cells, even inside backticks.
const cellsOf = (line) => line.replace(/\\\|/g, '\u0000').split('|').slice(1, -1).map((c) => c.trim());

for (const [i, line] of fs.readFileSync(positionals[0], 'utf8').split('\n').entries()) {
	const n = i + 1;
	const heading = line.match(/^##\s+Phase\s+\S+?:?\s+(.*)$/);
	if (heading) {
		phase = { name: heading[1], line: n, rows: 0, done: 0, value: false, doneWhen: false };
		phases.push(phase);
		continue;
	}
	if (/^##\s/.test(line)) phase = undefined;
	if (!phase) continue;
	if (line.startsWith('**Value:**')) phase.value = true;
	if (line.startsWith('**Done when:**')) phase.doneWhen = true;
	if (!/^\|\s*\[/.test(line)) continue;

	phase.rows += 1;
	const cells = cellsOf(line);
	if (cells.length !== 3) {
		errors.push(`L${n}: row has ${cells.length} cells, expected 3 (escape "|" in a cell as "\\|")`);
		continue;
	}
	const [box, task, model] = cells;
	if (box === '[x]') phase.done += 1;
	else if (box !== '[ ]') errors.push(`L${n}: checkbox is "${box}", expected "[ ]" or "[x]"`);
	const tier = models.find((m) => model.toLowerCase() === m || model.toLowerCase().startsWith(`${m}-`));
	if (!tier) errors.push(`L${n}: model "${model}" is not one of ${models.join(', ')}`);
	else counts[tier] += 1;
	if (tier === priciest && !/why(\s+\S+)?:/i.test(task)) errors.push(`L${n}: ${priciest} row has no "Why ${priciest}: <reason>"`);
}

for (const p of phases) {
	if (!p.value) errors.push(`L${p.line}: "${p.name}" has no **Value:** line`);
	if (!p.doneWhen) errors.push(`L${p.line}: "${p.name}" has no **Done when:** line`);
	if (p.rows === 0) errors.push(`L${p.line}: "${p.name}" has no task rows`);
}
if (phases.length === 0) errors.push('no "## Phase <n>: <title>" headings found');

console.log(JSON.stringify({ errors, errorCount: errors.length, models: counts, phases: phases.map((p) => `${p.name}: ${p.done}/${p.rows} done`) }, null, 2));
process.exit(errors.length ? 1 : 0);
