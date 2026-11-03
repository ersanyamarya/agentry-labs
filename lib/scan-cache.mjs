// Per-repo scan results, valid while every file the result depended on is unchanged. A result is stored with the list of
// files it touched and a stamp (mtime + size, or null when absent) for each; the entry is reused only if all stamps still
// match, so a changed file invalidates only the repos that read it. Results are already masked; no raw config is stored.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SCHEMA = 1;

const stamp = (file) => {
	try {
		const stats = statSync(file);
		return `${stats.mtimeMs}:${stats.size}`;
	} catch {
		return null;
	}
};

export const createScanCache = (paths, { enabled = true, version = "" } = {}) => {
	const dir = paths.cacheDir;
	const fileFor = (repo) => join(dir, `scan-${createHash("sha1").update(repo).digest("hex").slice(0, 16)}.json`);

	const get = (repo) => {
		if (!enabled) {
			return undefined;
		}
		try {
			const entry = JSON.parse(readFileSync(fileFor(repo), "utf8"));
			if (entry.schema !== SCHEMA || entry.version !== version || entry.repo !== repo) {
				return undefined;
			}
			return Object.entries(entry.stamps).every(([file, value]) => stamp(file) === value) ? entry.result : undefined;
		} catch {
			return undefined;
		}
	};

	const set = (repo, files, result) => {
		if (!enabled) {
			return;
		}
		try {
			mkdirSync(dir, { recursive: true });
			const stamps = Object.fromEntries([...new Set(files)].map((file) => [file, stamp(file)]));
			writeFileSync(fileFor(repo), JSON.stringify({ schema: SCHEMA, version, repo, stamps, result }));
		} catch {
			// A cache that cannot be written only costs speed.
		}
	};

	return { get, set };
};
