/**
 * Generates the store screenshot sets, one self-contained card per file (design in lib/store-design.ts):
 *
 * - ios      10 cards, 1320x2868 (6.9" iPhone, the primary App Store size), from captures/ios/
 * - android  8 cards (Play's phone limit), 1080x1920, from captures/ios/ in a Pixel-style bezel (Flutter renders the same UI)
 * - ipad     10 cards, 2064x2752 (13" iPad), from captures/ipad/
 * - android-tablet  8 cards (Play's limit), 2064x2752, for the 7" and 10" tablet slots, from captures/ipad/ in a tablet frame
 * - macos    10 cards, 2880x1800 (16:10), from captures/macos/
 *
 * Each card shows a light capture and a dark one (captures/<set>/ and captures/<set>/dark/), so run
 * `pnpm nx run image-gen-tools:capture` first. This script never captures anything itself.
 * Cards are flattened to opaque RGB: the stores reject transparency.
 *
 * Usage: pnpm nx run image-gen-tools:store [ios|android|android-tablet|ipad|macos]
 *   `all` renders ios, android and macos, plus ipad and android-tablet when captures/ipad/ has PNGs.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { CARDS } from "./lib/cards.ts";
import { APP_DIR, APP_NAME, APP_PACKAGE } from "./lib/app.ts";
import { CANVAS, type Card, cardDocument, isTablet, type Screens, type StoreTarget, type Tone } from "./lib/store-design.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const ROOT = path.join(REPO_ROOT, APP_DIR);
const STORE_OUT = path.join(REPO_ROOT, "dist", APP_PACKAGE, "store");
const CAPTURES = path.join(import.meta.dirname, "captures");
/** The app icon mark that reads on each ground: the pale one on petrol, the deep one on the pale ground. */
const LOGO_PATH = { dark: path.join(ROOT, "assets/icon/dark.png"), light: path.join(ROOT, "assets/icon/light.png") };

/** Android shows the iPhone and iPad captures: the UI is Flutter and renders identically. */
const CAPTURE_DIR: Record<StoreTarget, string> = {
	android: path.join(CAPTURES, "ios"),
	"android-tablet": path.join(CAPTURES, "ipad"),
	ios: path.join(CAPTURES, "ios"),
	ipad: path.join(CAPTURES, "ipad"),
	macos: path.join(CAPTURES, "macos"),
};

const dataUri = (file: string): string => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;

const files = (target: StoreTarget, capture: string): { dark: string; light: string } => ({
	dark: path.join(CAPTURE_DIR[target], "dark", `${capture}.png`),
	light: path.join(CAPTURE_DIR[target], `${capture}.png`),
});

/** Fails loudly if a capture is missing, rather than rendering a card with a broken image. */
const validate = (target: StoreTarget, cards: readonly Card[]): void => {
	const missing = cards.flatMap((card) => Object.values(files(target, card.capture))).filter((file) => !fs.existsSync(file));
	if (missing.length === 0) {
		return;
	}
	console.error(`\nMissing ${missing.length} capture(s) for ${target}:`);
	for (const file of missing) {
		console.error(`  - ${path.relative(import.meta.dirname, file)}`);
	}
	console.error("\nRun `pnpm nx run image-gen-tools:capture` against booted simulators (and this Mac) first.\n");
	process.exit(1);
};

const render = async (target: StoreTarget): Promise<void> => {
	const cards = CARDS.filter((card) => !card.skip?.includes(target));
	validate(target, cards);
	const canvas = CANVAS[target];
	const outDir = path.join(STORE_OUT, "store-assets", target);
	fs.rmSync(outDir, { force: true, recursive: true });
	fs.mkdirSync(outDir, { recursive: true });
	const logos = { dark: dataUri(LOGO_PATH.dark), light: dataUri(LOGO_PATH.light) };

	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: canvas.scale, viewport: { height: canvas.h, width: canvas.w } });
	for (const [i, card] of cards.entries()) {
		// Petrol, then pale, by position, so the rhythm survives a target skipping a card.
		const tone: Tone = i % 2 === 0 ? "dark" : "light";
		const paths = files(target, card.capture);
		const screens: Screens = { dark: dataUri(paths.dark), light: dataUri(paths.light) };
		// A callout is a crop of the device's own capture: the theme opposite to the ground.
		const calloutSrc = tone === "dark" ? screens.light : screens.dark;
		await page.setContent(cardDocument(target, card, tone, screens, logos[tone], calloutSrc), { waitUntil: "load" });
		await page.evaluate(() => document.fonts.ready);
		const raw = await page.screenshot({ type: "png" });
		const file = path.join(outDir, `${String(i + 1).padStart(2, "0")}-${card.name}.png`);
		await sharp(raw).removeAlpha().png().toFile(file);
		console.log(`wrote ${path.relative(ROOT, file)}`);
	}
	await browser.close();
};

const hasPngs = (dir: string): boolean => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".png"));

const arg = process.argv[2] ?? "all";
const targets: readonly StoreTarget[] = ["ios", "android", "ipad", "android-tablet", "macos"];
const requested = targets.find((t) => t === arg);
if (arg !== "all" && !requested) {
	console.error(`Unknown target "${arg}". Use ios, android, android-tablet, ipad, macos, or all.`);
	process.exit(1);
}

for (const target of requested ? [requested] : targets) {
	if (!requested && isTablet(target) && !hasPngs(CAPTURE_DIR.ipad)) {
		continue;
	}
	await render(target);
}
