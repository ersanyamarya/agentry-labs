// Text edits of a string array in a JSONC file (Copilot's <ch>/config.json): comments and every byte outside the
// edited array stay as they were. parseJsonc checks the file (comments and trailing commas allowed); addToArray and
// removeFromArray edit one top-level key and verify the result parses to the expected value before returning it.

import { stable } from "./global-common.mjs";

// Tokens: strings (with escapes), punctuation, bare literals, and // or /* */ comments.
function tokenize(text) {
	const tokens = [];
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		if (/\s/.test(c)) i++;
		else if (c === "/" && text[i + 1] === "/") {
			const end = text.indexOf("\n", i);
			const stop = end < 0 ? text.length : end;
			tokens.push({ type: "comment", start: i, end: stop });
			i = stop;
		} else if (c === "/" && text[i + 1] === "*") {
			const end = text.indexOf("*/", i + 2);
			if (end < 0) throw new Error("unterminated comment");
			tokens.push({ type: "comment", start: i, end: end + 2 });
			i = end + 2;
		} else if (c === '"') {
			let j = i + 1;
			while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
			if (j >= text.length) throw new Error("unterminated string");
			tokens.push({ type: "str", start: i, end: j + 1 });
			i = j + 1;
		} else if ("{}[],:".includes(c)) {
			tokens.push({ type: c, start: i, end: i + 1 });
			i++;
		} else {
			const m = /^[^\s{}[\],:"/]+/.exec(text.slice(i));
			if (!m) throw new Error(`unexpected character at ${i}`);
			tokens.push({ type: "lit", start: i, end: i + m[0].length });
			i += m[0].length;
		}
	}
	return tokens;
}

// Value nodes with offsets. Objects: props [{key, keyStart, value, commaAfter}]; arrays: items [{...node, commaAfter}];
// commaAfter is the offset of the comma that follows, else -1. trailingComma: the last entry is followed by one.
function parseTree(text) {
	const toks = tokenize(text).filter((t) => t.type !== "comment");
	let k = 0;
	const peek = () => toks[k];
	const take = (type) => {
		const t = toks[k];
		if (!t || (type && t.type !== type)) throw new Error(`expected ${type ?? "a value"} at ${t ? t.start : "end of file"}`);
		k++;
		return t;
	};
	const value = () => {
		const t = take();
		if (t.type === "str" || t.type === "lit") return { kind: "scalar", start: t.start, end: t.end };
		if (t.type !== "{" && t.type !== "[") throw new Error(`unexpected ${t.type} at ${t.start}`);
		const isObj = t.type === "{";
		const close = isObj ? "}" : "]";
		const entries = [];
		let trailingComma = false;
		while (peek()?.type !== close) {
			let entry;
			if (isObj) {
				const key = take("str");
				take(":");
				entry = { key: JSON.parse(text.slice(key.start, key.end)), keyStart: key.start, value: value(), commaAfter: -1 };
			} else entry = { ...value(), commaAfter: -1 };
			entries.push(entry);
			if (peek()?.type === ",") {
				entry.commaAfter = take(",").start;
				trailingComma = peek()?.type === close;
			} else if (peek()?.type !== close) throw new Error(`expected , or ${close} at ${peek() ? peek().start : "end of file"}`);
		}
		const end = take(close).end;
		return isObj ? { kind: "object", start: t.start, end, props: entries, trailingComma } : { kind: "array", start: t.start, end, items: entries, trailingComma };
	};
	const root = value();
	if (k !== toks.length) throw new Error(`unexpected content at ${toks[k].start}`);
	return root;
}

// The parsed value: comments blanked, trailing commas dropped, then JSON.parse. Throws when it isn't valid JSONC.
export function parseJsonc(text) {
	const toks = tokenize(text);
	const sig = toks.filter((t) => t.type !== "comment");
	const units = text.split(""); // UTF-16 units, matching the token offsets
	const blankUnits = (t) => {
		for (let i = t.start; i < t.end; i++) if (units[i] !== "\n" && units[i] !== "\r") units[i] = " ";
	};
	for (const t of toks) if (t.type === "comment") blankUnits(t);
	sig.forEach((t, i) => {
		if (t.type === "," && ["]", "}"].includes(sig[i + 1]?.type)) blankUnits(t);
	});
	parseTree(text);
	return JSON.parse(units.join(""));
}

const lineStart = (text, pos) => text.lastIndexOf("\n", pos - 1) + 1;
const ownLine = (text, pos) => text.slice(lineStart(text, pos), pos).trim() === "";
const indentOf = (text, pos) => (ownLine(text, pos) ? text.slice(lineStart(text, pos), pos) : null);

function applyEdits(text, edits) {
	let out = text;
	for (const { at, del = 0, ins = "" } of [...edits].sort((a, b) => b.at - a.at)) out = out.slice(0, at) + ins + out.slice(at + del);
	return out;
}

// Parses, checks the root is an object and key (the last occurrence, as JSON.parse keeps) is absent or an array.
function locate(text, key) {
	const value = parseJsonc(text);
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("does not hold a JSON object");
	if (key in value && !Array.isArray(value[key])) throw new Error(`${key} is not an array`);
	const root = parseTree(text);
	const prop = root.props.findLast((p) => p.key === key);
	return { value, root, prop };
}

// The edited text must parse, hold `expected` under key and leave every other top-level key equal.
function verify(before, text, key, expected) {
	const after = parseJsonc(text);
	const others = (v) => stable(Object.fromEntries(Object.entries(v).filter(([k]) => k !== key)));
	if (stable(after[key]) !== stable(expected) || others(after) !== others(before)) throw new Error("the edit did not verify; nothing was written");
	return text;
}

// Appends the strings not already in text's top-level `key` array (creating the key when absent).
// Returns { text, added }. Throws a message when the file can't be parsed or edited safely.
export function addToArray(text, key, wanted) {
	const { value, root, prop } = locate(text, key);
	const existing = value[key] ?? [];
	const added = [...new Set(wanted)].filter((w) => !existing.includes(w));
	if (added.length === 0) return { text, added };
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const firstKey = root.props[0];
	const unit = (firstKey && indentOf(text, firstKey.keyStart)) || "  ";
	const lines = (indent) => added.map((f) => indent + JSON.stringify(f)).join(`,${eol}`);
	const inner = (node) => text.slice(node.start + 1, node.end - 1);
	const edits = [];

	if (prop) {
		const arr = prop.value;
		const keyIndent = indentOf(text, prop.keyStart);
		const last = arr.items.at(-1);
		if (last) {
			if (!text.slice(arr.start, arr.end).includes("\n")) edits.push({ at: last.end, ins: added.map((f) => `, ${JSON.stringify(f)}`).join("") });
			else {
				const elIndent = indentOf(text, last.start) ?? `${keyIndent ?? unit}${unit}`;
				if (ownLine(text, arr.end - 1)) {
					if (!arr.trailingComma) edits.push({ at: last.end, ins: "," });
					edits.push({ at: lineStart(text, arr.end - 1), ins: `${lines(elIndent)}${arr.trailingComma ? "," : ""}${eol}` });
				} else edits.push({ at: last.end, ins: `,${eol}${lines(elIndent)}` });
			}
		} else if (keyIndent === null) edits.push({ at: arr.start + 1, del: inner(arr).trim() === "" ? inner(arr).length : 0, ins: added.map((f) => JSON.stringify(f)).join(", ") });
		else if (inner(arr).trim() === "") edits.push({ at: arr.start + 1, del: inner(arr).length, ins: `${eol}${lines(keyIndent + unit)}${eol}${keyIndent}` });
		else if (ownLine(text, arr.end - 1)) edits.push({ at: lineStart(text, arr.end - 1), ins: `${lines(keyIndent + unit)}${eol}` });
		else edits.push({ at: arr.end - 1, ins: `${eol}${lines(keyIndent + unit)}${eol}${keyIndent}` });
	} else {
		const property = (indent) => `${JSON.stringify(key)}: [${eol}${lines(indent + unit)}${eol}${indent}]`;
		const last = root.props.at(-1);
		const multiline = text.slice(root.start, root.end).includes("\n") && (!firstKey || indentOf(text, firstKey.keyStart) !== null);
		if (!multiline) {
			const inline = `${JSON.stringify(key)}: [${added.map((f) => JSON.stringify(f)).join(", ")}]`;
			edits.push(last ? { at: last.value.end, ins: `, ${inline}` } : { at: root.start + 1, del: inner(root).trim() === "" ? inner(root).length : 0, ins: inline });
		} else if (!last && inner(root).trim() === "") edits.push({ at: root.start + 1, del: inner(root).length, ins: `${eol}${unit}${property(unit)}${eol}` });
		else if (ownLine(text, root.end - 1)) {
			if (last && !root.trailingComma) edits.push({ at: last.value.end, ins: "," });
			edits.push({ at: lineStart(text, root.end - 1), ins: `${unit}${property(unit)}${eol}` });
		} else if (last) edits.push({ at: last.value.end, ins: `,${eol}${unit}${property(unit)}` });
		else edits.push({ at: root.end - 1, ins: `${eol}${unit}${property(unit)}${eol}` });
	}
	return { text: verify(value, applyEdits(text, edits), key, [...existing, ...added]), added };
}

// Removes every element of text's top-level `key` array equal to one of `unwanted`, one at a time.
// Returns { text, removed } (removed: the distinct values taken out). An emptied array stays as [].
export function removeFromArray(text, key, unwanted) {
	const drop = new Set(unwanted);
	const { value: original } = locate(text, key);
	const removed = [...new Set((original[key] ?? []).filter((v) => drop.has(v)))];
	let out = text;
	for (;;) {
		const { value, prop } = locate(out, key);
		if (!prop) break;
		const items = prop.value.items;
		const k = (value[key] ?? []).findIndex((v) => drop.has(v));
		if (k < 0) break;
		const it = items[k];
		const prev = items[k - 1];
		const afterItem = it.commaAfter >= 0 ? it.commaAfter + 1 : it.end;
		const nl = out.indexOf("\n", afterItem);
		const alone = ownLine(out, it.start) && nl >= 0 && out.slice(afterItem, nl).trim() === "";
		const edits = [];
		if (alone) {
			edits.push({ at: lineStart(out, it.start), del: nl + 1 - lineStart(out, it.start) });
			if (it.commaAfter < 0 && prev) edits.push({ at: prev.commaAfter, del: 1 });
		} else if (it.commaAfter >= 0) {
			const spaces = /^[ \t]*/.exec(out.slice(it.commaAfter + 1))[0].length;
			edits.push({ at: it.start, del: it.commaAfter + 1 + spaces - it.start });
		} else if (prev) edits.push({ at: prev.commaAfter, del: it.end - prev.commaAfter });
		else edits.push({ at: it.start, del: it.end - it.start });
		out = applyEdits(out, edits);
	}
	if (out === text) return { text, removed: [] };
	return { text: verify(original, out, key, (original[key] ?? []).filter((v) => !drop.has(v))), removed };
}
