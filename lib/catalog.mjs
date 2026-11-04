// The agentry-labs skill catalog: a shallow git clone of the repo, cached under <cacheDir>/catalog. Skills are grouped by
// the bundle tagged in its bundles.tsv (skills in no bundle go to "extras"). `add` copies a skill onto the shelf, off, and
// never overwrites; removing one is `shelf remove`. Only `refresh` touches the network.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createShelf } from "./shelf.mjs";
import { descriptionTokens, readDescription } from "./tokens.mjs";

export const CATALOG_REPO = "https://github.com/ersanyamarya/agentry-labs.git";

const git = (args) => execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });

export const createCatalog = (paths, { out = console.log, err = console.error, repo = process.env.AGENTRY_CATALOG_REPO || CATALOG_REPO, run = git } = {}) => {
	const dir = join(paths.cacheDir, "catalog");
	const fetched = () => existsSync(join(dir, "skills"));

	const refresh = () => {
		try {
			if (existsSync(join(dir, ".git"))) {
				run(["-C", dir, "pull", "--ff-only", "--depth", "1"]);
			} else {
				mkdirSync(dirname(dir), { recursive: true });
				run(["clone", "--depth", "1", repo, dir]);
			}
		} catch (error) {
			err(`Could not fetch the catalog from ${repo}: ${String(error.stderr ?? error.message).trim().split("\n").at(-1)}`);
			return 1;
		}
		out(`catalog up to date (${entries().length} skills)`);
		return 0;
	};

	const bundleOf = () => {
		const file = join(dir, "bundles.tsv");
		const map = new Map();
		for (const line of existsSync(file) ? readFileSync(file, "utf8").split("\n") : []) {
			const [bundle, selector] = line.split("\t");
			if (bundle && !bundle.startsWith("#") && selector?.startsWith("skills/")) {
				map.set(selector.slice("skills/".length), bundle);
			}
		}
		return map;
	};

	// [{ name, bundle, description, tokens, shelf (group or null), global }]; [] until the catalog is fetched.
	const entries = () => {
		if (!fetched()) {
			return [];
		}
		const bundles = bundleOf();
		const shelved = new Map(createShelf(paths, { out: () => {}, err: () => {}, warn: () => {} }).groups().flatMap((group) => group.items.filter((item) => item.kind === "skills").map((item) => [item.name, group.name])));
		return readdirSync(join(dir, "skills"), { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && existsSync(join(dir, "skills", entry.name, "SKILL.md")))
			.map(({ name }) => ({
				name,
				bundle: bundles.get(name) ?? "extras",
				description: readDescription(join(dir, "skills", name, "SKILL.md")),
				tokens: descriptionTokens(join(dir, "skills", name, "SKILL.md")),
				shelf: shelved.get(name) ?? null,
				global: existsSync(join(paths.configDir, "skills", name)),
			}))
			.sort((a, b) => a.bundle.localeCompare(b.bundle) || a.name.localeCompare(b.name));
	};

	const list = ({ json = false } = {}) => {
		if (!fetched()) {
			err("The catalog is not fetched yet: run agentry catalog refresh");
			return 1;
		}
		const all = entries();
		if (json) {
			out(JSON.stringify(all, null, 2));
			return 0;
		}
		for (const skill of all) {
			const where = skill.shelf ? `shelf/${skill.shelf}` : skill.global ? "~/.claude/skills" : "not installed";
			out(`${skill.bundle.padEnd(8)} ${skill.name.padEnd(30)} ~${String(skill.tokens).padStart(4)}  ${where}`);
		}
		return 0;
	};

	// Copies each skill onto the shelf (group default: its bundle). Stops at the first problem; nothing is overwritten.
	const add = (names, { group, dryRun = false } = {}) => {
		if (!fetched()) {
			err("The catalog is not fetched yet: run agentry catalog refresh");
			return 1;
		}
		if (group !== undefined && (group === "" || group === "agents" || group.includes("/") || group.startsWith("."))) {
			err(`Not a usable group name: "${group}"`);
			return 1;
		}
		const all = entries();
		for (const name of names) {
			const skill = all.find((entry) => entry.name === name);
			if (!skill) {
				err(`No skill "${name}" in the catalog. See agentry catalog list`);
				return 1;
			}
			if (skill.shelf || skill.global) {
				err(`${name} is already installed (${skill.shelf ? `shelf/${skill.shelf}` : "~/.claude/skills"}); not overwriting`);
				return 1;
			}
			const to = join(paths.shelfDir, group ?? skill.bundle, name);
			if (dryRun) {
				out(`would add ${name} to shelf group ${group ?? skill.bundle}: ${join(dir, "skills", name)} -> ${to}`);
				continue;
			}
			mkdirSync(dirname(to), { recursive: true });
			cpSync(join(dir, "skills", name), to, { recursive: true });
			out(`added ${name} to shelf group ${group ?? skill.bundle} (off); turn it on with agentry shelf on ${group ?? skill.bundle}/${name}`);
		}
		return 0;
	};

	return { refresh, entries, list, add, fetched: () => fetched(), dir };
};
