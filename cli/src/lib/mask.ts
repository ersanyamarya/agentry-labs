// Masks values that may hold secrets (env and header values, tokens in URLs and arguments) before anything prints them.
// ${VAR} names stay visible because they are references, not secrets; a ${VAR:-default} default is masked.

export const MASK = "<masked>";

const REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*)?\}/g;
export const SECRET_NAME =/(token|secret|passw(or)?d|api[-_]?key|apikey|auth|authorization|bearer|credentials?|cookie|key)$/i;
const SECRET_PREFIX = /^(sk-|sk_|pk_|rk_|ghp_|gho_|ghs_|github_pat_|glpat-|xox[abprs]-|AIza|ctx7sk|eyJ)/;
const AUTH_SCHEME = /^(Bearer|Basic|Token|Bot)\s+/i;

const keepRef = (name: string, fallback?: string): string => (fallback ? `\${${name}:-${MASK}}` : `\${${name}}`);

// Token-shaped: a known key prefix, or a long run of letters and digits with no dots or slashes.
export const looksSecret = (text: string): boolean => SECRET_PREFIX.test(text) || (text.length >= 20 && /^[A-Za-z0-9_\-+=]+$/.test(text) && /\d/.test(text) && /[A-Za-z]/.test(text));

// Every literal stretch becomes MASK; ${VAR} references stay. "" stays "".
export const maskValue = (value: unknown): string => {
	if (typeof value !== "string") {
		return MASK;
	}
	let out = "";
	let last = 0;
	for (const match of value.matchAll(REF)) {
		if ((match.index ?? 0) > last) {
			out += MASK;
		}
		out += keepRef(match[1] ?? "", match[2]);
		last = (match.index ?? 0) + match[0].length;
	}
	return last < value.length ? out + MASK : out;
};

export const maskHeader = (value: unknown): string => {
	const scheme = typeof value === "string" ? value.match(AUTH_SCHEME)?.[0] : undefined;
	return scheme ? scheme + maskValue((value as string).slice(scheme.length)) : maskValue(value);
};

export const maskMap = (map: unknown, maskOne: (value: unknown) => string = maskValue): Record<string, string> => Object.fromEntries(Object.entries((map ?? {}) as Record<string, unknown>).map(([key, value]) => [key, maskOne(value)]));

// Masks userinfo, every query value and token-shaped path segments; keeps scheme, host and ${VAR} names.
export const maskUrl = (url: unknown): string => {
	if (typeof url !== "string") {
		return MASK;
	}
	const refs: string[] = [];
	const hold = (text: string): string => text.replace(REF, (_, name: string, fallback?: string) => `\0${refs.push(keepRef(name, fallback)) - 1}\0`);
	const restore = (text: string): string => text.replace(/\0(\d+)\0/g, (_, index: string) => refs[Number(index)] ?? "");
	const literal = (text: string): string => (/^(\0\d+\0)+$/.test(text) ? text : text === "" ? "" : MASK);

	const held = hold(url);
	const queryAt = held.search(/[?#]/);
	let base = queryAt === -1 ? held : held.slice(0, queryAt);
	const query = queryAt === -1 ? "" : held.slice(queryAt);
	base = base.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, `$1${MASK}@`).replace(/\/([^/]+)/g, (whole: string, segment: string) => (looksSecret(segment) ? `/${MASK}` : whole));
	const maskedQuery = query.replace(/([?&#])([^&#=]*)(=?)([^&#]*)/g, (_, sep: string, key: string, eq: string, value: string) => (eq ? `${sep}${key}=${literal(value)}` : `${sep}${looksSecret(key) ? MASK : key}`));
	return restore(base + maskedQuery);
};

// Masks the value after a secret-named flag (`--token X`, `--api-key=X`), `NAME=X` pairs with a secret name,
// `Authorization: X` header arguments, URLs and bare token-shaped arguments.
export const maskArgs = (args: unknown): string[] => {
	if (!Array.isArray(args)) {
		return [];
	}
	let secretNext = false;
	return (args as unknown[]).map((arg) => {
		if (typeof arg !== "string") {
			return MASK;
		}
		if (secretNext) {
			secretNext = false;
			return maskValue(arg);
		}
		const flag = arg.match(/^(--?[A-Za-z][\w-]*)(=(.*))?$/s);
		if (flag) {
			if (!SECRET_NAME.test(flag[1])) {
				return flag[2] ? `${flag[1]}=${maskArg(flag[3])}` : arg;
			}
			if (flag[2]) {
				return `${flag[1]}=${maskValue(flag[3])}`;
			}
			secretNext = true;
			return arg;
		}
		return maskArg(arg);
	});
};

const maskArg = (arg: string): string => {
	const pair = arg.match(/^([A-Za-z_][\w.-]*)=(.*)$/s);
	if (pair) {
		return SECRET_NAME.test(pair[1]) ? `${pair[1]}=${maskValue(pair[2])}` : `${pair[1]}=${maskArg(pair[2])}`;
	}
	const header = arg.match(/^([A-Za-z][\w-]*):\s*(.*)$/s);
	if (header && SECRET_NAME.test(header[1])) {
		return `${header[1]}: ${maskHeader(header[2])}`;
	}
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg)) {
		return maskUrl(arg);
	}
	if (looksSecret(arg)) {
		return MASK;
	}
	return arg.replace(REF, (_, name, fallback) => keepRef(name, fallback));
};

export const maskCommand = (command: unknown): string => (typeof command === "string" ? maskArg(command) : MASK);

// A whole shell command line (a hook's `command`): masked word by word with the same rules as arguments.
// Whitespace and the quotes around each word are kept, so the line still reads like the original.
export const maskShell = (line: unknown): string => {
	if (typeof line !== "string") {
		return MASK;
	}
	const parts = line.split(/(\s+)/);
	const words = parts.map((part) => (/^\s*$/.test(part) ? undefined : part.match(/^(["'`]*)(.*?)(["'`]*)$/s)));
	const masked = maskArgs(words.filter((match): match is RegExpMatchArray => Boolean(match)).map((match) => match[2]));
	let next = 0;
	return parts
		.map((part, index) => {
			const word = words[index];
			return word ? `${word[1]}${masked[next++]}${word[3]}` : part;
		})
		.join("");
};
