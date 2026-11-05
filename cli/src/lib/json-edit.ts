// Text-level JSON editing for `agentry fix`: each operation splices the original text, so every byte outside the edit
// (indentation, key order, spacing, escapes, trailing newline, line endings) stays identical. Nothing is parsed and
// re-serialized. Only strict JSON is accepted: a file that does not parse (comments, trailing commas, BOM, junk after
// the value) throws `{ code: "EJSONPARSE" }` without quoting any of its content, and the caller leaves the file alone.
// Errors: EJSONPARSE (not valid JSON), EJSONDUP (duplicate key on a path, so "the" value is ambiguous), EJSONPATH
// (path not found or the wrong type), EJSONROOT (the root value cannot be deleted).
//
//   const doc = createJsonEdit(text);
//   doc.deleteKey(["mcpServers", "old"]);      // object member
//   doc.deleteElement(["permissions", "allow", 2]);   // array element (path ends in the index)
//   doc.set(["env", "A"], "b");                // replace a value, or add the key to an existing object
//   doc.renameInStrings((value, path) => value.replace("a", "b"));   // string values only, not keys
//   doc.text                                   // the edited text
// A path is an array of keys (strings) and indexes (numbers). Each operation re-scans the text it produced.

export type JsonEditCode = "EJSONPARSE" | "EJSONDUP" | "EJSONPATH" | "EJSONROOT";

/** A key (object member) or an index (array element). */
export type JsonPath = (string | number)[];

type Splice = [start: number, end: number, insert: string];

interface Member {
	key: string;
	keyStart: number;
	keyEnd: number;
	value: Node;
}

type Node =
	| { type: "string" | "literal"; start: number; end: number }
	| { type: "object"; start: number; end: number; children: Member[] }
	| { type: "array"; start: number; end: number; children: Node[] };

const fail = (code: JsonEditCode): Error & { code: JsonEditCode } => Object.assign(new Error(code === "EJSONPARSE" ? "not valid JSON" : code), { code });

// ---- scanner ----

// Node: { type, start, end, children? }. Object children: { key, keyStart, keyEnd, value }; array children: the nodes.
const scan = (text: string): Node => {
	let at = 0;
	const skip = () => {
		while (at < text.length && " \t\n\r".includes(text[at])) {
			at++;
		}
	};
	const expect = (char: string): void => {
		if (text[at] !== char) {
			throw fail("EJSONPARSE");
		}
		at++;
	};
	const string = (): Node => {
		const start = at;
		expect('"');
		while (at < text.length && text[at] !== '"') {
			const code = text.charCodeAt(at);
			if (code < 0x20) {
				throw fail("EJSONPARSE");
			}
			if (text[at] === "\\") {
				at++;
				if ("\"\\/bfnrt".includes(text[at] ?? "x")) {
					at++;
				} else if (text[at] === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(at + 1, at + 5))) {
					at += 5;
				} else {
					throw fail("EJSONPARSE");
				}
			} else {
				at++;
			}
		}
		expect('"');
		return { type: "string", start, end: at };
	};
	const value = (): Node => {
		skip();
		const start = at;
		const char = text[at];
		if (char === '"') {
			return string();
		}
		if (char === "{") {
			at++;
			const children: Member[] = [];
			skip();
			if (text[at] === "}") {
				at++;
				return { type: "object", start, end: at, children };
			}
			for (;;) {
				skip();
				const key = string();
				skip();
				expect(":");
				children.push({ key: JSON.parse(text.slice(key.start, key.end)), keyStart: key.start, keyEnd: key.end, value: value() });
				skip();
				if (text[at] === ",") {
					at++;
					continue;
				}
				expect("}");
				return { type: "object", start, end: at, children };
			}
		}
		if (char === "[") {
			at++;
			const children: Node[] = [];
			skip();
			if (text[at] === "]") {
				at++;
				return { type: "array", start, end: at, children };
			}
			for (;;) {
				children.push(value());
				skip();
				if (text[at] === ",") {
					at++;
					continue;
				}
				expect("]");
				return { type: "array", start, end: at, children };
			}
		}
		const literal = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(at, at + 400));
		if (!literal) {
			throw fail("EJSONPARSE");
		}
		at += literal[0].length;
		return { type: "literal", start, end: at };
	};
	const root = value();
	skip();
	if (at !== text.length) {
		throw fail("EJSONPARSE");
	}
	return root;
};

// ---- helpers ----

const eolOf = (text: string): string => (text.includes("\r\n") ? "\r\n" : "\n");

// The whitespace that starts the line `offset` is on.
const lineIndent = (text: string, offset: number): string => {
	const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
	return /^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? "";
};

// The file's indent unit: the indent of the first member of the first multi-line container ("" when compact).
const indentUnit = (text: string, root: Node): string => {
	const first = "children" in root ? root.children[0] : undefined;
	const start = first ? ("keyStart" in first ? first.keyStart : first.start) : undefined;
	if (start === undefined || !/\n[ \t]*$/.test(text.slice(root.start, start))) {
		return "";
	}
	return lineIndent(text, start);
};

const render = (text: string, root: Node, value: unknown, baseIndent: string): string => {
	const unit = indentUnit(text, root);
	const eol = eolOf(text);
	const body = (unit === "" ? JSON.stringify(value) : JSON.stringify(value, null, unit)) as string;
	return body.split("\n").join(`${eol}${baseIndent}`);
};

const children = (node: Node, key: string | number): Node | undefined => {
	if (node.type === "object") {
		const found = node.children.filter((child) => child.key === key);
		if (found.length > 1) {
			throw fail("EJSONDUP");
		}
		return found[0]?.value;
	}
	return node.type === "array" && Number.isInteger(key) ? node.children[key as number] : undefined;
};

// Node at `path`, plus its parent and the member that holds it.
const locate = (root: Node, path: JsonPath): { node: Node; parent: Node | undefined } => {
	let node = root;
	let parent: Node | undefined;
	for (const key of path) {
		const next = children(node, key);
		if (!next) {
			throw fail("EJSONPATH");
		}
		parent = node;
		node = next;
	}
	return { node, parent };
};

// Splice that removes member/element `index` of `container` together with one comma and its whitespace.
const removal = (container: Node & { children: (Member | Node)[] }, index: number): Splice => {
	const items = container.children;
	const startOf = (item: Member | Node): number => ("keyStart" in item ? item.keyStart : item.start);
	const endOf = (item: Member | Node): number => ("value" in item ? item.value.end : item.end);
	if (items.length === 1) {
		return [container.start + 1, container.end - 1, ""];
	}
	if (index < items.length - 1) {
		return [startOf(items[index]), startOf(items[index + 1]), ""];
	}
	return [endOf(items[index - 1]), endOf(items[index]), ""];
};

// ---- API ----

export const createJsonEdit = (source: string) => {
	let text = source;
	let root = scan(text);
	const splice = ([start, end, insert]: Splice): void => {
		const next = text.slice(0, start) + insert + text.slice(end);
		root = scan(next);
		text = next;
	};

	const deleteKey = (path: JsonPath): void => {
		const { node, parent } = locate(root, path);
		if (!parent) {
			throw fail("EJSONROOT");
		}
		if (parent.type !== "object") {
			throw fail("EJSONPATH");
		}
		splice(removal(parent, parent.children.findIndex((child) => child.value === node)));
	};

	const deleteElement = (path: JsonPath): void => {
		const { node, parent } = locate(root, path);
		if (!parent) {
			throw fail("EJSONROOT");
		}
		if (parent.type !== "array") {
			throw fail("EJSONPATH");
		}
		splice(removal(parent, parent.children.indexOf(node)));
	};

	const set = (path: JsonPath, value: unknown): void => {
		if (path.length === 0) {
			splice([root.start, root.end, render(text, root, value, "")]);
			return;
		}
		const parentPath = path.slice(0, -1);
		const key = path.at(-1) as string | number;
		const { node: parent } = locate(root, parentPath);
		const existing = children(parent, key);
		if (existing) {
			splice([existing.start, existing.end, render(text, root, value, lineIndent(text, existing.start))]);
			return;
		}
		if (parent.type !== "object" || typeof key !== "string") {
			throw fail("EJSONPATH");
		}
		const member = (indent: string): string => `${JSON.stringify(key)}: ${render(text, root, value, indent)}`;
		const last = parent.children.at(-1);
		if (last) {
			const before = parent.children.length > 1 ? (parent.children.at(-2) as Member).value.end : parent.start + 1;
			const lead = text.slice(before, last.keyStart).replace(/^\s*,/, "");
			splice([last.value.end, last.value.end, `,${lead}${member(lineIndent(text, last.keyStart))}`]);
			return;
		}
		const unit = indentUnit(text, root);
		const base = lineIndent(text, parent.start);
		const eol = eolOf(text);
		splice([parent.start + 1, parent.end - 1, unit === "" ? member("") : `${eol}${base}${unit}${member(base + unit)}${eol}${base}`]);
	};

	// Calls `replace(value, path)` for every string value; a different string result replaces it in place.
	const renameInStrings = (replace: (value: string, path: JsonPath) => unknown): number => {
		const edits: Splice[] = [];
		const walk = (node: Node, path: JsonPath): void => {
			if (node.type === "string") {
				const value = JSON.parse(text.slice(node.start, node.end));
				const next = replace(value, path);
				if (typeof next === "string" && next !== value) {
					edits.push([node.start, node.end, JSON.stringify(next)]);
				}
			} else if (node.type === "object") {
				node.children.forEach((child) => walk(child.value, [...path, child.key]));
			} else if (node.type === "array") {
				node.children.forEach((child, index) => walk(child, [...path, index]));
			}
		};
		walk(root, []);
		for (const edit of edits.reverse()) {
			text = text.slice(0, edit[0]) + edit[2] + text.slice(edit[1]);
		}
		if (edits.length > 0) {
			root = scan(text);
		}
		return edits.length;
	};

	// The parsed value at `path` (undefined when absent), for fixes that inspect before they edit.
	const get = (path: JsonPath): unknown => {
		try {
			const { node } = locate(root, path);
			return JSON.parse(text.slice(node.start, node.end));
		} catch (error) {
			if ((error as { code?: string }).code === "EJSONPATH") {
				return undefined;
			}
			throw error;
		}
	};

	return { deleteKey, deleteElement, set, renameInStrings, get, get text() { return text; } };
};
