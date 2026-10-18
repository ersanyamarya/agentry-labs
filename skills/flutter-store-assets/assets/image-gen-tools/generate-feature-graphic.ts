/**
 * Generates the Play Console feature graphic: the 1024x500 banner at the top of the store listing (Play Console >
 * Store presence > Main store listing > Graphics).
 *
 * Same design as the store cards (lib/store-design.ts): the petrol ground, the brand lockup and tagline on the left, and
 * the same screen in light and dark, two tilted phones bleeding off the bottom on the right. Play crops this asset per device, so the copy
 * stays well inside the edges (64px left; the tagline is short on purpose).
 *
 * Rendered at 2x and downscaled with Lanczos, which keeps the device screens crisp; a 1x render of a 2796px-tall
 * capture shrunk by the browser was visibly soft.
 *
 * Output: dist/{APP_PACKAGE}/store/feature-graphic/play-feature-graphic.png
 * (24-bit PNG, no alpha channel; Play rejects one with alpha)
 *
 * Usage: pnpm nx run image-gen-tools:store (runs with the store cards and icons)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { deviceFrame, PHONE_ASPECT } from "./lib/device-frame.ts";
import { ground, PALETTE } from "./lib/store-design.ts";
import { THEME } from "./theme.ts";
import { APP_DIR, APP_NAME, APP_PACKAGE } from "./lib/app.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const ROOT = path.join(REPO_ROOT, APP_DIR);
const STORE_OUT = path.join(REPO_ROOT, "dist", APP_PACKAGE, "store");
const CAPTURES = path.join(import.meta.dirname, "captures", "ios");
const OUT_DIR = path.join(STORE_OUT, "feature-graphic");
const ICON_PATH = path.join(ROOT, "assets/icon/dark.png");

/** Google Play's exact feature graphic spec. */
const WIDTH = 1024;
const HEIGHT = 500;
const SCALE = 2;
const HERO_CAPTURES = ["dashboard.png", "workspace_brokers.png"] as const;

const imageDataUri = (file: string): string => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;

const bannerHtml = (): string => {
	const shot = (name: string, theme: "dark" | "light"): { src: string } => ({
		src: imageDataUri(path.join(CAPTURES, theme === "dark" ? "dark" : "", name)),
	});
	const device = (screen: { src: string }, centerX: number, top: number, tiltDeg: number, zIndex: number): string =>
		deviceFrame(screen, { aspect: PHONE_ASPECT, kind: "island", left: centerX - 95, tiltDeg, top, width: 190, zIndex });

	return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${THEME.fontsHref}">
<style>*{margin:0;padding:0;box-sizing:border-box}
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;font-family:${THEME.fontBody};background:#09303A}</style></head><body>
<div style="position:absolute;inset:0;background:${ground("dark")}"></div>
<div style="position:absolute;left:64px;top:50%;transform:translateY(-50%);width:470px;z-index:5">
	<div style="display:flex;align-items:center;gap:14px">
		<img src="${imageDataUri(ICON_PATH)}" alt="" style="width:44px;height:44px;border-radius:10px" />
		<span style="font-size:26px;font-weight:800;letter-spacing:0.14em;color:${PALETTE.dark.title}">${APP_NAME.toUpperCase()}</span>
	</div>
	<h1 style="margin-top:24px;font-size:42px;line-height:1.06;font-weight:800;letter-spacing:-0.025em;color:${PALETTE.dark.title}">MQTT configured <span style="color:${PALETTE.dark.accent}">once.</span><br>Deployed everywhere.</h1>
</div>
${device(shot(HERO_CAPTURES[1], "dark"), 880, 110, 6, 3)}
${device(shot(HERO_CAPTURES[0], "light"), 700, 150, -6, 4)}
</body></html>`;
};

const main = async (): Promise<void> => {
	fs.mkdirSync(OUT_DIR, { recursive: true });

	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: SCALE, viewport: { height: HEIGHT, width: WIDTH } });
	await page.setContent(bannerHtml(), { waitUntil: "load" });
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(300);
	const raw = await page.screenshot({ type: "png" });
	await browser.close();

	const target = path.join(OUT_DIR, "play-feature-graphic.png");
	await sharp(raw).resize(WIDTH, HEIGHT, { kernel: "lanczos3" }).flatten({ background: THEME.canvas }).png().toFile(target);
	console.log(`wrote ${path.relative(ROOT, target)} (${WIDTH}×${HEIGHT}, no alpha)`);
};

await main();
