/**
 * Generates the website's brand files from the one logo the app icons already use: the browser favicons and the
 * default Open Graph card shown when a page is shared.
 *
 * Source: {APP_DIR}/assets/icon/source/logo.svg (flat black fill, tight crop, the same file
 * `brand-icons` reads) and the website screenshots in apps/main-website/public/shots (made by generate-website-shots.ts, run first by `website`; light Mac window and dark phone).
 *
 * Output, all in apps/main-website/public (served as-is, committed):
 *   - favicon.svg           the mark in petrol, light-on-dark in dark mode (prefers-color-scheme)
 *   - favicon.ico           16, 32 and 48 px PNG frames, for browsers and tools that ignore SVG
 *   - apple-touch-icon.png  180 px, the app's light icon (iOS paints no transparency)
 *   - og-default.png        1200x630 share card: lockup, tagline, Mac window with a phone over it
 *
 * The share card is HTML rendered in Playwright's Chromium, like the store graphics, and reuses `deviceFrame` from
 * lib/device-frame.ts, on the same petrol ground as the store cards (lib/store-design.ts). It is rendered at 2x and downscaled with Lanczos so the
 * screenshots stay crisp, then flattened (no alpha).
 *
 * Usage: pnpm nx run image-gen-tools:website
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { deviceFrame, PHONE_ASPECT } from "./lib/device-frame.ts";
import { ground, PALETTE } from "./lib/store-design.ts";
import { ICON_THEME, THEME } from "./theme.ts";
import { APP_DIR, APP_NAME, APP_PACKAGE } from "./lib/app.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SOURCE_SVG = path.join(REPO_ROOT, APP_DIR, "assets/icon/source/logo.svg");
const SITE_PUBLIC = path.join(REPO_ROOT, "apps", "main-website", "public");
const SHOTS = path.join(SITE_PUBLIC, "shots");

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_SCALE = 2;
const ICO_SIZES = [16, 32, 48] as const;
const APPLE_SIZE = 180;
/** Share of the icon square the mark fills. */
const MARK_SHARE = 0.62;

const readLogo = (): string => {
	if (!fs.existsSync(SOURCE_SVG)) {
		throw new Error(`Source logo not found: ${path.relative(REPO_ROOT, SOURCE_SVG)}`);
	}
	return fs.readFileSync(SOURCE_SVG, "utf8");
};

/** The logo with its black fill swapped and the root sized, so it rasterizes at `size` instead of upscaling. */
const coloredLogo = (svg: string, color: string, size: number): string =>
	svg
		.replace(/fill="black"/g, `fill="${color}"`)
		.replace(/(<svg[^>]*?)\swidth="[^"]*"/, `$1 width="${size}"`)
		.replace(/(<svg[^>]*?)\sheight="[^"]*"/, `$1 height="${size}"`);

/** A square icon: the mark centered on an opaque background. */
const iconPng = async (svg: string, size: number): Promise<Buffer> => {
	const mark = Math.round(size * MARK_SHARE);
	const pad = Math.round((size - mark) / 2);
	const markPng = await sharp(Buffer.from(coloredLogo(svg, ICON_THEME.markLight, mark)))
		.png()
		.toBuffer();
	return await sharp({ create: { background: ICON_THEME.backgroundLight, channels: 4, height: size, width: size } })
		.composite([{ input: markPng, left: pad, top: pad }])
		.png()
		.toBuffer();
};

/** ICO container holding PNG frames (supported by every current browser). */
const buildIco = (frames: { data: Buffer; size: number }[]): Buffer => {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(frames.length, 4);
	let offset = 6 + frames.length * 16;
	const entries = frames.map(({ data, size }) => {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size, 0);
		entry.writeUInt8(size, 1);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(data.length, 8);
		entry.writeUInt32LE(offset, 12);
		offset += data.length;
		return entry;
	});
	return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.data)]);
};

const faviconSvg = (svg: string): string => {
	const style = `<style>.m{fill:${ICON_THEME.markLight}}@media (prefers-color-scheme:dark){.m{fill:${ICON_THEME.markDark}}}</style>`;
	return svg
		.replace(/fill="black"/g, 'class="m"')
		.replace(/\s(width|height)="[^"]*"/g, "")
		.replace(/(<svg[^>]*>)/, `$1<title>${APP_NAME}</title>${style}`);
};

const dataUri = (file: string, mime: string): string => `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;

const ogHtml = (svg: string): string => {
	// A pale window with a dark phone over it: the two themes also separate the phone from the window.
	const macShot = path.join(SHOTS, "macos-dashboard-light.webp");
	const phoneShot = path.join(SHOTS, "ios-dashboard-dark.webp");
	for (const file of [macShot, phoneShot]) {
		if (!fs.existsSync(file)) {
			throw new Error(`Missing ${path.relative(REPO_ROOT, file)}: run \`pnpm nx run image-gen-tools:website\` first.`);
		}
	}
	const mark = `data:image/svg+xml;base64,${Buffer.from(coloredLogo(svg, ICON_THEME.markDark, 96)).toString("base64")}`;
	const phone = deviceFrame(
		{ src: dataUri(phoneShot, "image/webp") },
		{ aspect: PHONE_ASPECT, kind: "island", left: 548, tiltDeg: -6, top: 262, width: 196, zIndex: 3 }
	);

	return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${THEME.fontsHref}">
<style>*{margin:0;padding:0;box-sizing:border-box}
body{width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden;font-family:${THEME.fontBody};color:#fff;background:#09303A}</style></head><body>
<div style="position:absolute;inset:0;background:${ground("dark")}"></div>
<div style="position:absolute;left:72px;top:50%;transform:translateY(-50%);width:470px">
	<div style="display:flex;align-items:center;gap:16px">
		<img src="${mark}" alt="" style="width:48px;height:48px" />
		<span style="font-size:30px;font-weight:800;letter-spacing:0.14em">${APP_NAME.toUpperCase()}</span>
	</div>
	<h1 style="margin-top:28px;font-size:50px;line-height:1.06;font-weight:800;letter-spacing:-0.025em">MQTT configured <span style="color:${PALETTE.dark.accent}">once.</span><br>Deployed everywhere.</h1>
</div>
<div style="position:absolute;left:600px;top:150px;width:760px;border-radius:18px;overflow:hidden;background:${THEME.card};box-shadow:0 40px 90px -30px rgba(0,0,0,0.6)">
	<img src="${dataUri(macShot, "image/webp")}" alt="" style="display:block;width:100%;height:auto" />
</div>
${phone}
</body></html>`;
};

const renderOg = async (svg: string): Promise<Buffer> => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ deviceScaleFactor: OG_SCALE, viewport: { height: OG_HEIGHT, width: OG_WIDTH } });
	await page.setContent(ogHtml(svg), { waitUntil: "load" });
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(300);
	const raw = await page.screenshot({ type: "png" });
	await browser.close();
	return await sharp(raw).resize(OG_WIDTH, OG_HEIGHT, { kernel: "lanczos3" }).flatten({ background: "#09303A" }).png().toBuffer();
};

const main = async (): Promise<void> => {
	const svg = readLogo();
	fs.mkdirSync(SITE_PUBLIC, { recursive: true });
	const write = (name: string, data: Buffer | string): void => {
		const target = path.join(SITE_PUBLIC, name);
		fs.writeFileSync(target, data);
		console.log(`wrote ${path.relative(REPO_ROOT, target)} (${(fs.statSync(target).size / 1024).toFixed(1)} KB)`);
	};

	write("favicon.svg", faviconSvg(svg));
	write("favicon.ico", buildIco(await Promise.all(ICO_SIZES.map(async (size) => ({ data: await iconPng(svg, size), size })))));
	write("apple-touch-icon.png", await iconPng(svg, APPLE_SIZE));

	write("og-default.png", await renderOg(svg));
};

await main();
