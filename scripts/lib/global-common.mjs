// Helpers shared by the Claude (config) and Copilot targets of scripts/apply-global.mjs.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// JSON with object keys sorted, so two equal values compare equal as strings.
export const stable = (value) => JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
export const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// Reads parts.<part> of an install manifest (scripts/setup-manifest.mjs); prints the usage and exits 2 when it can't.
export function loadManifestPart(manifestFile, part, usageLine) {
	const usage = (why) => {
		console.error(`apply-global: ${why}`);
		console.error(usageLine);
		process.exit(2);
	};
	if (!manifestFile || manifestFile.startsWith("--")) usage("--remove needs a manifest path");
	const manifestAbs = resolve(manifestFile);
	if (!existsSync(manifestAbs)) usage(`manifest not found: ${manifestAbs}`);
	let manifest;
	try {
		manifest = JSON.parse(readFileSync(manifestAbs, "utf8"));
	} catch {
		usage(`manifest is not valid JSON: ${manifestAbs}`);
	}
	const entries = manifest?.parts?.[part];
	if (!entries || typeof entries !== "object") usage(`manifest has no ${part} part: ${manifestAbs}`);
	return entries;
}

// Copies each existing path to <configDir>/backups/agentry-setup/<stamp>/files/<absolute path> and writes its
// manifest.json. Returns the backup folder.
export function writeBackupSet(configDir, paths) {
	const touched = paths.filter((p) => existsSync(p));
	const createdAt = new Date().toISOString();
	const backupDir = join(configDir, "backups", "agentry-setup", createdAt.replace(/[:.]/g, "-"));
	const entries = [];
	for (const path of touched) {
		const backup = join(backupDir, "files", path.replace(/^\/+/, ""));
		mkdirSync(dirname(backup), { recursive: true });
		copyFileSync(path, backup);
		entries.push({ path, realPath: realpathSync(path), kind: "file", backup, sha256: sha256(readFileSync(path)) });
	}
	mkdirSync(backupDir, { recursive: true });
	writeFileSync(join(backupDir, "manifest.json"), `${JSON.stringify({ version: 1, tool: "agentry-labs-setup", createdAt, cwd: process.cwd(), status: "applied", files: entries }, null, 2)}\n`);
	return backupDir;
}
