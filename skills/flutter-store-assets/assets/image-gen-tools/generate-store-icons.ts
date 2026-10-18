/**
 * Generates the store-listing icons each console asks for separately from
 * the app's own installed icon: the App Store Connect "App Store" icon
 * (1024×1024) and the Play Console "App icon" store-listing asset (512×512).
 *
 * Source: assets/icon/light.png — the same master image
 * flutter_launcher_icons.yaml reads to build the installed app icon — composited
 * onto the identical #EAF0F1 background that config already uses
 * (background_color_ios / adaptive_icon_background), so the store listing
 * matches what's actually on the home screen instead of drifting from it.
 *
 * Output: dist/{APP_PACKAGE}/store/store-icons/
 *   - app-store-icon-1024.png  (1024×1024, no alpha — Apple rejects one with alpha)
 *   - play-store-icon-512.png  (512×512, with alpha — Play's spec, even though flattened here)
 *
 * Usage: pnpm nx run image-gen-tools:store (runs with the store cards and feature graphic)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";
import { ICON_THEME } from "./theme.ts";
import { APP_DIR, APP_NAME, APP_PACKAGE } from "./lib/app.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const ROOT = path.join(REPO_ROOT, APP_DIR);
const STORE_OUT = path.join(REPO_ROOT, "dist", APP_PACKAGE, "store");
const SOURCE_ICON = path.join(ROOT, "assets/icon/light.png");
const OUT_DIR = path.join(STORE_OUT, "store-icons");

const ICON_BACKGROUND = ICON_THEME.backgroundLight;

type IconSpec = {
	readonly alpha: boolean;
	readonly file: string;
	readonly size: number;
};

const ICONS: readonly IconSpec[] = [
	{ alpha: false, file: "app-store-icon-1024.png", size: 1024 },
	{ alpha: true, file: "play-store-icon-512.png", size: 512 },
];

const main = async (): Promise<void> => {
	if (!fs.existsSync(SOURCE_ICON)) {
		console.error(`Source icon not found: ${path.relative(ROOT, SOURCE_ICON)}`);
		process.exit(1);
	}
	fs.mkdirSync(OUT_DIR, { recursive: true });

	for (const icon of ICONS) {
		// flatten() bakes the transparent margin around the mark onto the brand
		// background and drops the alpha channel; ensureAlpha() adds a fully
		// opaque one back only where the target spec calls for "with alpha".
		let pipeline = sharp(SOURCE_ICON).resize(icon.size, icon.size).flatten({ background: ICON_BACKGROUND });
		if (icon.alpha) {
			pipeline = pipeline.ensureAlpha();
		}

		const target = path.join(OUT_DIR, icon.file);
		await pipeline.png().toFile(target);
		console.log(`wrote ${path.relative(ROOT, target)} (${icon.size}×${icon.size}, alpha: ${icon.alpha})`);
	}

	console.log(`\nGenerated ${ICONS.length} store listing icon(s) in ${path.relative(ROOT, OUT_DIR)}/`);
};

await main();
