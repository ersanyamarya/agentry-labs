/**
 * Resizes the raw simulator captures into the web-ready screenshots that
 * apps/main-website shows inside its device frames.
 *
 * Source: captures/macos/ and captures/ios/ (light) plus their dark/ folders (gitignored, written by
 * the capture scripts). Unlike the store-asset cards these are the bare screens,
 * so the site can frame them itself and lay its own copy around them.
 *
 * Only the captures the site shows are converted (SITE_SHOTS below). The other
 * visuals on the home page are drawn in code; add a capture to the list when a
 * section starts using it, and remove it when it stops.
 *
 * Output: apps/main-website/public/shots/<platform>-<capture>-<light|dark>.webp, committed
 * with the site. Widths match the markup in the site's DesktopShot / PhoneShot
 * (1800 and 640), which already cover 2x of their largest rendered size.
 *
 * Usage: pnpm nx run image-gen-tools:website
 */
import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CAPTURES_DIR = path.join(import.meta.dirname, "captures");
const OUT_DIR = path.join(REPO_ROOT, "apps", "main-website", "public", "shots");

const WEBP_QUALITY = 82;

type Platform = {
	/** Capture names (file stems) the site shows on this platform. */
	readonly captures: readonly string[];
	readonly name: "ios" | "macos";
	readonly width: number;
};

const SITE_SHOTS: readonly Platform[] = [
	{ captures: ["dashboard"], name: "macos", width: 1800 },
	{ captures: ["dashboard"], name: "ios", width: 640 },
];

/** The capture's own title bar (64 px of white at 2x) is replaced with one in the app's colour, so a dark shot has no white strip. */
const MAC_TITLE_PX = 64;
const MAC_BAR_PX = 56;
const BAR_COLOR = { dark: "#0D1114", light: "#F5FAFC" } as const;

const macBar = (width: number, theme: "dark" | "light"): Buffer => {
	const dot = (cx: number, fill: string): string => `<circle cx="${cx}" cy="${MAC_BAR_PX / 2}" r="11" fill="${fill}"/>`;
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${MAC_BAR_PX}"><rect width="${width}" height="${MAC_BAR_PX}" fill="${BAR_COLOR[theme]}"/>${dot(36, "#FF5F57")}${dot(70, "#FEBC2E")}${dot(104, "#28C840")}</svg>`
	);
};

const toWebp = async (platform: Platform, source: string, theme: "dark" | "light", target: string): Promise<void> => {
	let input = sharp(source);
	if (platform.name === "macos") {
		const { height, width } = await sharp(source).metadata();
		const body = await sharp(source)
			.extract({ height: (height ?? 0) - MAC_TITLE_PX, left: 0, top: MAC_TITLE_PX, width: width ?? 0 })
			.toBuffer();
		// Flattened to a buffer first: sharp would otherwise resize before compositing, and the pieces would no longer fit.
		const framed = await sharp({
			create: { background: BAR_COLOR[theme], channels: 3, height: (height ?? 0) - MAC_TITLE_PX + MAC_BAR_PX, width: width ?? 0 },
		})
			.composite([
				{ input: macBar(width ?? 0, theme), left: 0, top: 0 },
				{ input: body, left: 0, top: MAC_BAR_PX },
			])
			.png()
			.toBuffer();
		input = sharp(framed);
	}
	// withoutEnlargement keeps a small capture at its own size instead of blurring it up.
	await input.resize({ width: platform.width, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY }).toFile(target);
	console.log(`wrote ${path.relative(REPO_ROOT, target)} (${(fs.statSync(target).size / 1024).toFixed(0)} KB)`);
};

const main = async (): Promise<void> => {
	fs.mkdirSync(OUT_DIR, { recursive: true });
	let written = 0;

	for (const platform of SITE_SHOTS) {
		const sourceDir = path.join(CAPTURES_DIR, platform.name);
		for (const capture of platform.captures) {
			for (const theme of ["light", "dark"] as const) {
				const source = path.join(sourceDir, ...(theme === "dark" ? ["dark"] : []), `${capture}.png`);
				if (!fs.existsSync(source)) {
					console.error(`${path.relative(REPO_ROOT, source)} is missing: run \`pnpm nx run image-gen-tools:capture\` first.`);
					process.exit(1);
				}
				await toWebp(platform, source, theme, path.join(OUT_DIR, `${platform.name}-${capture}-${theme}.webp`));
				written += 1;
			}
		}
	}

	console.log(`\nGenerated ${written} website shot(s) in ${path.relative(REPO_ROOT, OUT_DIR)}/`);
};

await main();
