// Masks values that may hold secrets (env and header values, tokens in URLs and arguments) before anything prints them.
// ${VAR} names stay visible because they are references, not secrets; a ${VAR:-default} default is masked.

export const MASK = "<masked>";

const REF = /\$\{([A-Za-z_][A-Za-z0-9_]*)(:-[^}]*)?\}/g;
const SECRET_NAME = /(token|secret|passw(or)?d|api[-_]?key|apikey|auth|authorization|bearer|credentials?|cookie|key)$/i;
const SECRET_PREFIX = /^(sk-|sk_|pk_|rk_|ghp_|gho_|ghs_|github_pat_|glpat-|xox[abprs]-|AIza|ctx7sk|eyJ)/;
const AUTH_SCHEME = /^(Bearer|Basic|Token|Bot)\s+/i;

const keepRef = (name, fallback) => (fallback ? `\${${name}:-${MASK}}` : `\${${name}}`);

// Token-shaped: a known key prefix, or a long run of letters and digits with no dots or slashes.
export const looksSecret = (text) => SECRET_PREFIX.test(text) || (text.length >= 20 && /^[A-Za-z0-9_\-+=]+$/.test(text) && /\d/.test(text) && /[A-Za-z]/.test(text));

// Every literal stretch becomes MASK; ${VAR} references stay. "" stays "".
export const maskValue = (value) => {
	if (typeof value !== "string") {
		return MASK;
	}
	let out = "";
	let last = 0;
	for (const match of value.matchAll(REF)) {
		if (match.index > last) {
			out += MASK;
		}
		out += keepRef(match[1], match[2]);
		last = match.index + match[0].length;
	}
	return last < value.length ? out + MASK : out;
};

export const maskHeader = (value) => {
	const scheme = typeof value === "string" ? value.match(AUTH_SCHEME)?.[0] : undefined;
	return scheme ? scheme + maskValue(value.slice(scheme.length)) : maskValue(value);
};

export const maskMap = (map, maskOne = maskValue) => Object.fromEntries(Object.entries(map ?? {}).map(([key, value]) => [key, maskOne(value)]));

// Masks userinfo, every query value and token-shaped path segments; keeps scheme, host and ${VAR} names.
export const maskUrl = (url) => {
	if (typeof url !== "string") {
		return MASK;
	}
	const refs = [];
	const hold = (text) => text.replace(REF, (_, name, fallback) => `\0${refs.push(keepRef(name, fallback)) - 1}\0`);
	const restore = (text) => text.replace(/\0(\d+)\0/g, (_, index) => refs[index]);
	const literal = (text) => (/^(\0\d+\0)+$/.test(text) ? text : text === "" ? "" : MASK);

	const held = hold(url);
	const queryAt = held.search(/[?#]/);
	let base = queryAt === -1 ? held : held.slice(0, queryAt);
	const query = queryAt === -1 ? "" : held.slice(queryAt);
	base = base.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, `$1${MASK}@`).replace(/\/([^/]+)/g, (whole, segment) => (looksSecret(segment) ? `/${MASK}` : whole));
	const maskedQuery = query.replace(/([?&#])([^&#=]*)(=?)([^&#]*)/g, (_, sep, key, eq, value) => (eq ? `${sep}${key}=${literal(value)}` : `${sep}${looksSecret(key) ? MASK : key}`));
	return restore(base + maskedQuery);
};

// Masks the value after a secret-named flag (`--token X`, `--api-key=X`), `NAME=X` pairs with a secret name,
// `Authorization: X` header arguments, URLs and bare token-shaped arguments.
export const maskArgs = (args) => {
	if (!Array.isArray(args)) {
		return [];
	}
	let secretNext = false;
	return args.map((arg) => {
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

const maskArg = (arg) => {
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

export const maskCommand = (command) => (typeof command === "string" ? maskArg(command) : MASK);
